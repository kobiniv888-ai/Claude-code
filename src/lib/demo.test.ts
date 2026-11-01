import { parsePhoneNumberFromString } from "libphonenumber-js";
import { describe, expect, it, vi } from "vitest";
import { locales, siteConfig } from "@/config/site";
import { DEMO_EMAIL_DOMAIN, isDemoAlertTitle, isDemoEmail } from "@/lib/demo";
import { AMENITIES, JEWISH_FEATURES, SHABBAT_FEATURES } from "@/lib/listing/fields";
import { detectContactInfo, hasContactInfo } from "@/lib/risk/contact-info";
import { BUILTIN_PHRASE_RULES, compileAdminPhrase, scanWithRules } from "@/lib/risk/phrases";
import { normalizeSearchText } from "@/lib/search-text";
import { BANNED_WORDS as BANNED, DEMO_SCAM_ALERT } from "../../prisma/seed/content";
import { FAQ as FAQ_ITEMS } from "../../prisma/seed/faq";
import { DEMO_PLACES as PLACES } from "../../prisma/seed/jewish-places";
import { DAY_MS, generateDailyStats, georgiaDate, seededRandom, unsplashPhotoUrl, wordCount } from "../../prisma/seed/lib";
import { ALL_LISTINGS, demoPhotoPath, REMOVED_LISTING_NUMBERS } from "../../prisma/seed/listings/all";
import photoManifest from "../../prisma/seed/listings/photo-manifest.json";
import { PHOTOS } from "../../prisma/seed/listings/photos";
import { contactMethodsFor, listingTimeline, priceChangesFor } from "../../prisma/seed/listings/timeline";
import { NEIGHBORHOODS as NEIGHBORHOOD_DATA } from "../../prisma/seed/places";
import { DEMO_USERS as USERS } from "../../prisma/seed/users";

const LISTINGS = ALL_LISTINGS;
const JEWISH_PLACE_TYPES_FOR_TEST = ["SYNAGOGUE", "CHABAD_HOUSE", "KOSHER_RESTAURANT", "KOSHER_SHOP", "MIKVEH", "HERITAGE_SITE"];

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-10-31T09:30:00.000Z");

describe("demo markers", () => {
  it("recognises demo e-mails and alert titles", () => {
    expect(isDemoEmail(`guest@${DEMO_EMAIL_DOMAIN}`)).toBe(true);
    expect(isDemoEmail(`Guest@${DEMO_EMAIL_DOMAIN.toUpperCase()}`)).toBe(true);
    expect(isDemoEmail("someone@bayit.example")).toBe(false);
    expect(isDemoEmail(null)).toBe(false);
    expect(isDemoAlertTitle(DEMO_SCAM_ALERT.title)).toBe(true);
    expect(isDemoAlertTitle({ en: "Fake deposits", he: "פיקדונות" })).toBe(false);
    expect(isDemoAlertTitle("Demo: not an object")).toBe(false);
  });

  it("prefixes the demo scam alert with Demo: in every language", () => {
    for (const locale of locales) expect(DEMO_SCAM_ALERT.title[locale].startsWith("Demo:")).toBe(true);
  });
});

describe("seed helpers", () => {
  it("seededRandom is deterministic and in [0, 1)", () => {
    const a = seededRandom("x");
    const b = seededRandom("x");
    const values = Array.from({ length: 50 }, () => a());
    expect(values).toEqual(Array.from({ length: 50 }, () => b()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(seededRandom("y")()).not.toBe(values[0]);
  });

  it("builds Unsplash URLs only from photo ids", () => {
    expect(unsplashPhotoUrl("photo-1502672260266-1c1ef2d93688")).toBe(
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1600&q=75&auto=format&fit=crop",
    );
    expect(() => unsplashPhotoUrl("https://example.com/x.jpg")).toThrow();
  });

  it("counts words in any script", () => {
    expect(wordCount("שלום עולם – hello, мир!")).toBe(4);
    expect(wordCount("  ")).toBe(0);
  });

  it("uses Georgia days for DATE columns", () => {
    expect(georgiaDate(0, new Date("2026-10-31T21:00:00Z")).toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(georgiaDate(-1, NOW).toISOString()).toBe("2026-10-30T00:00:00.000Z");
  });

  it("generates consistent daily stats", () => {
    const stats = generateDailyStats({ seed: "s", from: -29, to: -5, publishedDay: -20, baseViews: 30, channels: ["WHATSAPP", "PHONE"], now: NOW });
    expect(stats[0].day).toBe(-20);
    expect(stats.at(-1)?.day).toBe(-5);
    for (const day of stats) {
      const byChannel = Object.values(day.contactsByChannel).reduce((sum: number, n) => sum + (n ?? 0), 0);
      expect(byChannel).toBe(day.contacts);
      expect(day.views).toBeGreaterThan(0);
    }
  });
});

describe("listing timeline", () => {
  const base = LISTINGS.find((l) => l.status === "LIVE")!;

  it("LIVE: expires 60 days after publishing, featured for 14 days", () => {
    const t = listingTimeline({ ...base, days: 10, featured: true }, NOW);
    expect(t.publishedAt!.getTime()).toBeLessThan(NOW.getTime());
    expect(t.expiresAt!.getTime() - t.publishedAt!.getTime()).toBe(siteConfig.listings.defaultExpiryDays * DAY_MS);
    expect(t.featuredUntil!.getTime()).toBeGreaterThan(NOW.getTime() + 13 * DAY_MS);
    expect(t.bumpedAt).toEqual(t.publishedAt);
  });

  it("EXPIRED: expiry in the past, warned before; DRAFT: step 4 and unpublished", () => {
    const expired = listingTimeline({ ...base, status: "EXPIRED", days: 15 }, NOW);
    expect(expired.expiresAt!.getTime()).toBeLessThan(NOW.getTime());
    expect(expired.expiryWarnedAt!.getTime()).toBeLessThan(expired.expiresAt!.getTime());
    const draft = listingTimeline({ ...base, status: "DRAFT", days: 2 }, NOW);
    expect(draft.wizardStep).toBe(4);
    expect(draft.publishedAt).toBeNull();
  });

  it("puts WhatsApp first with the owner's phone", () => {
    const methods = contactMethodsFor({ status: "LIVE", contact: { telegram: "@demo_user", phone: true } }, "+995555000011")!;
    expect(methods.map((m) => m.channel)).toEqual(["WHATSAPP", "TELEGRAM", "PHONE"]);
    expect(methods[0].value).toBe("+995555000011");
    expect(methods.map((m) => m.order)).toEqual([0, 1, 2]);
    expect(contactMethodsFor({ status: "DRAFT" }, "+995555000011")).toBeNull();
  });

  it("turns older prices into price changes ending at the current price", () => {
    const changes = priceChangesFor({ fields: { ...base.fields, price: 68000 }, priceHistory: [{ price: 78000, changedDaysAgo: 30 }, { price: 74000, changedDaysAgo: 9 }] }, NOW);
    expect(changes.map((c) => [c.oldPrice, c.newPrice])).toEqual([
      [78000, 74000],
      [74000, 68000],
    ]);
  });
});

describe("demo listings data", () => {
  it("has 20 listings with the required mix", () => {
    expect(LISTINGS).toHaveLength(20);
    expect(new Set(LISTINGS.map((l) => l.n)).size).toBe(20);
    for (const n of REMOVED_LISTING_NUMBERS) expect(LISTINGS.some((l) => l.n === n), `listing ${n} was removed`).toBe(false);
    const sales = LISTINGS.filter((l) => l.fields.dealType === "SALE");
    expect(sales.length).toBeGreaterThanOrEqual(3);
    expect(sales.length).toBeLessThanOrEqual(5);
    expect(sales.map((l) => l.fields.condition)).toEqual(expect.arrayContaining(["WHITE_FRAME"]));
    for (const deal of ["SHORT_STAY", "MONTHLY_RENT", "SALE", "HOTEL_ROOM"]) {
      expect(LISTINGS.some((l) => l.status === "LIVE" && l.fields.dealType === deal), deal).toBe(true);
    }
    // Every Jewish-life badge appears on at least one live listing.
    const live = LISTINGS.filter((l) => l.status === "LIVE");
    expect(live.some((l) => l.fields.kitchenKosher === "KOSHER")).toBe(true);
    expect(live.some((l) => (l.fields.hotelJewishFeatures as string[] | undefined)?.includes("kosher_breakfast"))).toBe(true);
    expect(live.some((l) => (l.fields.jewishFeatures as string[] | undefined)?.includes("host_keeps_shabbat"))).toBe(true);
    expect(live.some((l) => (l.fields.jewishFeatures as string[] | undefined)?.includes("host_speaks_hebrew"))).toBe(true);
    expect(LISTINGS.filter((l) => l.fields.dealType === "HOTEL_ROOM")).toHaveLength(2);
    expect(LISTINGS.some((l) => l.fields.propertyType === "ROOM" && l.fields.sharedRoomFor)).toBe(true);
    expect(LISTINGS.some((l) => (l.fields.maxGuests ?? 0) >= 10)).toBe(true);
    expect(LISTINGS.filter((l) => l.featured && l.status === "LIVE")).toHaveLength(2);
    expect(LISTINGS.some((l) => (l.priceHistory?.length ?? 0) > 0)).toBe(true);
    const ownerOneStatuses = LISTINGS.filter((l) => l.owner === "yossi").map((l) => l.status);
    expect(ownerOneStatuses).toEqual(expect.arrayContaining(["IN_REVIEW", "NEEDS_CHANGES", "PAUSED", "LIVE"]));
    const cities = new Set(LISTINGS.map((l) => l.city));
    for (const city of ["tbilisi", "batumi", "kutaisi", "kobuleti", "gudauri", "bakuriani", "kazbegi", "sighnaghi"]) {
      expect(cities.has(city), city).toBe(true);
    }
  });

  it("uses known vocabulary keys", () => {
    for (const l of LISTINGS) {
      for (const a of (l.fields.amenities as string[] | undefined) ?? []) expect(AMENITIES).toContain(a);
      for (const f of (l.fields.shabbatFeatures as string[] | undefined) ?? []) expect(SHABBAT_FEATURES).toContain(f);
      for (const f of (l.fields.jewishFeatures as string[] | undefined) ?? []) expect(JEWISH_FEATURES).toContain(f);
      expect(NEIGHBORHOOD_DATA[l.city]?.some((n) => n.slug === l.neighborhood)).toBe(true);
    }
  });

  it("has a title and a 60–140 word description in all five languages, with no contact details or scam phrases", () => {
    const banned = BANNED.map((w) => ({ phrase: w.phrase, re: compileAdminPhrase(w.phrase)! }));
    for (const l of LISTINGS) {
      for (const locale of locales) {
        const text = l.text[locale];
        const label = `listing ${l.n} (${locale})`;
        expect(text.title.length, label).toBeLessThanOrEqual(siteConfig.listings.titleMaxLength);
        const words = wordCount(text.description);
        expect(words, `${label}: ${words} words`).toBeGreaterThanOrEqual(60);
        expect(words, `${label}: ${words} words`).toBeLessThanOrEqual(140);
        for (const part of [text.title, text.description]) {
          expect(hasContactInfo(detectContactInfo(part)), label).toBe(false);
          expect(scanWithRules(part, BUILTIN_PHRASE_RULES), label).toEqual([]);
          const normalized = ` ${normalizeSearchText(part)} `;
          for (const word of banned) expect(word.re.test(normalized), `${label} matches "${word.phrase}"`).toBe(false);
        }
      }
    }
  });

  it("has 4–6 local photos per published listing, none shared between listings, room photos inside the listing", () => {
    const seen = new Map<string, number>();
    const manifest = photoManifest as Record<string, { width: number; blurDataURL: string }>;
    for (const l of LISTINGS) {
      if (l.status === "DRAFT") expect(l.photos).toHaveLength(0);
      else {
        expect(l.photos.length, `listing ${l.n}`).toBeGreaterThanOrEqual(4);
        expect(l.photos.length, `listing ${l.n}`).toBeLessThanOrEqual(6);
      }
      for (const key of l.photos) {
        expect(PHOTOS[key], key).toBeDefined();
        const file = manifest[demoPhotoPath(l, key)];
        expect(file, `${demoPhotoPath(l, key)} is downloaded`).toBeDefined();
        expect(file.width).toBeLessThanOrEqual(1600);
        expect(file.blurDataURL).toMatch(/^data:image\/webp;base64,/);
        const id = PHOTOS[key];
        expect(seen.get(id), `${key} used by listings ${seen.get(id)} and ${l.n}`).toBeUndefined();
        seen.set(id, l.n);
      }
      for (const room of l.roomTypes ?? []) {
        expect(room.photos.length).toBeGreaterThan(0);
        for (const key of room.photos) expect(l.photos).toContain(key);
      }
      if (l.fields.dealType === "HOTEL_ROOM") {
        expect(l.roomTypes?.length).toBeGreaterThanOrEqual(2);
        expect(l.roomTypes?.length).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe("demo users, places and reference content", () => {
  it("demo users have valid Georgian mobile numbers and demo e-mails", () => {
    const phones = new Set<string>();
    for (const user of USERS) {
      const parsed = parsePhoneNumberFromString(user.phone);
      expect(parsed?.isValid(), user.phone).toBe(true);
      expect(parsed?.country).toBe("GE");
      expect(phones.has(user.phone)).toBe(false);
      phones.add(user.phone);
    }
    expect(USERS.filter((u) => u.role !== "USER").map((u) => u.role).sort()).toEqual(["ADMIN", "EDITOR", "MODERATOR", "SUPPORT"]);
    expect(USERS.filter((u) => u.accountType === "BUSINESS")).toHaveLength(2);
  });

  it("demo Jewish places are clearly sample points and cover every type", () => {
    expect(new Set(PLACES.map((p) => p.type))).toEqual(new Set(JEWISH_PLACE_TYPES_FOR_TEST));
    expect(new Set(PLACES.map((p) => p.id)).size).toBe(PLACES.length);
  });

  it("FAQ covers all six categories in five languages", () => {
    expect(FAQ_ITEMS.length).toBeGreaterThanOrEqual(24);
    expect(new Set(FAQ_ITEMS.map((f) => f.category)).size).toBe(6);
    for (const item of FAQ_ITEMS) {
      for (const locale of locales) {
        expect(item.question[locale].trim(), `${item.id} ${locale}`).not.toBe("");
        expect(item.answer[locale].trim(), `${item.id} ${locale}`).not.toBe("");
      }
    }
  });

  it("banned words are unique, mostly FLAG with a few BLOCK", () => {
    const keys = BANNED.map((w) => `${normalizeSearchText(w.phrase)}|${w.locale ?? "*"}`);
    expect(new Set(keys).size).toBe(keys.length);
    const blocks = BANNED.filter((w) => w.action === "BLOCK").length;
    expect(blocks).toBeGreaterThan(0);
    expect(blocks).toBeLessThan(BANNED.length / 3);
    expect(new Set(BANNED.map((w) => w.category))).toEqual(new Set(["SCAM", "CONTACT_INFO", "OFFENSIVE"]));
  });

  it("every configured city has neighborhoods", () => {
    for (const city of siteConfig.cities) expect(NEIGHBORHOOD_DATA[city.slug]?.length, city.slug).toBeGreaterThan(0);
  });
});
