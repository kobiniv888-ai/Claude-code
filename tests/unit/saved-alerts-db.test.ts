/**
 * Saved-search and price-drop emails (round 3, brief 7.4) against the local database: what
 * matches (the search page's own where-builder, new since the save or the last check, never demo
 * or the user's own), once a day per user under concurrency, never the same listing twice, pause,
 * the switches, and the price-drop rule with its one-email-per-drop claim. Emails are captured,
 * not sent. Creates its own users, city and listings with a unique prefix and removes them.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const sent = vi.hoisted(() => ({ emails: [] as { to: string; template: string; locale: string; data: Record<string, unknown>; headers?: Record<string, string> }[], fail: false }));
vi.mock("@/lib/email", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...real,
    sendEmail: vi.fn(async (input: { to: string; template: string; locale: string; data: Record<string, unknown> }) => {
      if (sent.fail) return { ok: false, delivery: "failed" };
      sent.emails.push(input);
      return { ok: true, delivery: "logged" };
    }),
  };
});

const { db } = await import("@/lib/db");
const { runSavedSearchAlerts } = await import("@/lib/saved-searches/run");
const { runPriceDropAlerts } = await import("@/lib/alerts/price-drop-run");
const { createSavedSearch, setSavedSearchActive, listSavedSearches } = await import("@/lib/saved-searches/server");
const { DAILY_CLAIM_PREFIX } = await import("@/lib/saved-searches/core");
const { setUnsubscribeSwitch, unsubscribeSwitchOn } = await import("@/lib/alerts/unsubscribe-server");
const { verifyUnsubscribeToken } = await import("@/lib/alerts/unsubscribe-token");

const prefix = `sa${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ids = { city: "", users: [] as string[] };
// Monday 9 Nov 2026, 09:30 in Israel; Tuesday the same time.
const MONDAY = new Date("2026-11-09T07:30:00Z");
const TUESDAY = new Date("2026-11-10T07:30:00Z");
const never = () => false;
const searchRun = (user: string, now = MONDAY) => runSavedSearchAlerts(now, { isRestTime: never, onlyUserId: user });
const dropRun = (user: string, now = MONDAY) => runPriceDropAlerts(now, { isRestTime: never, onlyUserId: user });
const citySlug = () => `${prefix}-city`;

async function createUser(name: string, opts: { locale?: "he" | "en"; prefs?: object; isDemo?: boolean } = {}) {
  const id = `${prefix}${name}`;
  await db.user.create({
    data: {
      id,
      name: `Test ${name}`,
      firstName: name,
      email: `${id}@example.com`,
      phoneNumber: `+99559${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
      phoneNumberVerified: true,
      locale: opts.locale ?? "en",
      isDemo: opts.isDemo ?? false,
      notificationPrefs: opts.prefs as never,
    },
  });
  ids.users.push(id);
  return id;
}

async function createListing(ownerId: string, opts: { isDemo?: boolean; dealType?: "SHORT_STAY" | "MONTHLY_RENT"; publishedAt?: Date; price?: number; currency?: "GEL" | "USD"; status?: "LIVE" | "PAUSED"; editedAt?: Date } = {}) {
  return db.listing.create({
    data: {
      ownerId,
      status: opts.status ?? "LIVE",
      isDemo: opts.isDemo ?? false,
      dealType: opts.dealType ?? "SHORT_STAY",
      propertyType: "APARTMENT",
      pricePeriod: opts.dealType === "MONTHLY_RENT" ? "MONTH" : "NIGHT",
      cityId: ids.city,
      lat: 41.7,
      lng: 44.8,
      originalLocale: "en",
      title: `${prefix} flat ${Math.random().toString(36).slice(2, 6)}`,
      description: "A test listing for the saved-search email tests.",
      price: opts.price ?? 100,
      priceUsd: opts.price ?? 100,
      currency: opts.currency ?? "GEL",
      publishedAt: opts.publishedAt ?? new Date("2026-11-08T12:00:00Z"),
      contentUpdatedAt: opts.editedAt ?? new Date("2026-11-08T12:00:00Z"),
    },
    select: { id: true, publicId: true, title: true },
  });
}

async function saveSearch(userId: string, query: string, name = "My search", createdAt = new Date("2026-11-07T12:00:00Z")) {
  const result = await createSavedSearch(userId, { query, currency: "USD", name });
  if (result.kind !== "created") throw new Error(`not created: ${result.kind}`);
  await db.savedSearch.update({ where: { id: result.id }, data: { createdAt } });
  return result.id;
}

beforeAll(async () => {
  const city = await db.city.create({
    data: { slug: citySlug(), names: { he: "עיר", en: "Testville", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "testville", lat: 41.7, lng: 44.8 },
  });
  ids.city = city.id;
});

afterAll(async () => {
  await db.rateLimit.deleteMany({ where: { OR: ids.users.map((id) => ({ key: { contains: id } })) } });
  await db.listing.deleteMany({ where: { ownerId: { in: ids.users } } });
  await db.user.deleteMany({ where: { id: { in: ids.users } } });
  await db.city.deleteMany({ where: { id: ids.city } });
  await db.$disconnect();
});

beforeEach(() => {
  sent.emails = [];
  sent.fail = false;
});

describe("saved-search emails", () => {
  it("emails new matching places once, groups the searches, and never sends a place twice", async () => {
    const guest = await createUser("guest");
    const host = await createUser("host");
    const stays = await saveSearch(guest, `deal=short-stay&city=${citySlug()}`, "Stays in Testville");
    const rentals = await saveSearch(guest, `deal=monthly&city=${citySlug()}`, "Rentals in Testville");
    const stay = await createListing(host);
    const rental = await createListing(host, { dealType: "MONTHLY_RENT" });
    // Never: published before the search was saved, a demo listing, the guest's own, a paused one.
    await createListing(host, { publishedAt: new Date("2026-11-06T12:00:00Z") });
    await createListing(host, { isDemo: true });
    await createListing(guest);
    await createListing(host, { status: "PAUSED" });

    expect(await searchRun(guest)).toMatchObject({ status: "ran", users: 1, sent: 1 });
    expect(sent.emails).toHaveLength(1);
    const email = sent.emails[0];
    expect(email).toMatchObject({ to: `${guest}@example.com`, template: "saved_search_matches", locale: "en" });
    const data = email.data as { searches: { name: string; url: string; places: { title: string }[] }[]; totalPlaces: number; unsubscribeUrl: string };
    expect(data.totalPlaces).toBe(2);
    expect(data.searches.map((s) => s.name).sort()).toEqual(["Rentals in Testville", "Stays in Testville"]);
    expect(data.searches.flatMap((s) => s.places.map((p) => p.title)).sort()).toEqual([rental.title, stay.title].sort());
    expect(data.searches.find((s) => s.name === "Stays in Testville")?.url).toBe(`/search?deal=short-stay&city=${citySlug()}`);
    // A signed unsubscribe link for this email only, and the one-click headers.
    const token = decodeURIComponent(data.unsubscribeUrl.split("t=")[1]);
    expect(verifyUnsubscribeToken(token)).toEqual({ userId: guest, kind: "saved_search" });
    expect(email.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");

    const rows = await db.savedSearch.findMany({ where: { id: { in: [stays, rentals] } }, select: { id: true, lastMatchIds: true, lastSentAt: true } });
    expect(rows.find((r) => r.id === stays)?.lastMatchIds).toEqual([stay.id]);
    expect(rows.every((r) => r.lastSentAt?.getTime() === MONDAY.getTime())).toBe(true);

    // At most one email a day: a new place later that morning waits for tomorrow.
    const later = await createListing(host, { publishedAt: new Date("2026-11-09T07:40:00Z") });
    expect(await searchRun(guest, new Date("2026-11-09T08:30:00Z"))).toMatchObject({ sent: 0, already: 1 });
    // Tomorrow: only the new place, never the ones already sent.
    sent.emails = [];
    expect(await searchRun(guest, TUESDAY)).toMatchObject({ sent: 1 });
    const next = sent.emails[0].data as { searches: { places: { title: string }[] }[]; totalPlaces: number };
    expect(next.totalPlaces).toBe(1);
    expect(next.searches[0].places.map((p) => p.title)).toEqual([later.title]);
    // Nothing new: no email, and the day is not claimed.
    sent.emails = [];
    expect(await searchRun(guest, new Date("2026-11-11T07:30:00Z"))).toMatchObject({ sent: 0, quiet: 1 });
    expect(await db.rateLimit.count({ where: { key: `${DAILY_CLAIM_PREFIX}2026-11-11:${guest}` } })).toBe(0);
  });

  it("sends one email when two runs race for the same user", async () => {
    const guest = await createUser("racer");
    const host = await createUser("racehost");
    await saveSearch(guest, `city=${citySlug()}`);
    await createListing(host);
    const results = await Promise.all([searchRun(guest), searchRun(guest), searchRun(guest)]);
    expect(results.reduce((n, r) => n + ("sent" in r ? r.sent : 0), 0)).toBe(1);
    expect(sent.emails.filter((e) => e.to === `${guest}@example.com`)).toHaveLength(1);
  });

  it("matches the filters like the search page (price in the saved currency, rooms, property type)", async () => {
    const guest = await createUser("filters");
    const host = await createUser("filterhost");
    await saveSearch(guest, `city=${citySlug()}&priceMax=150&bedrooms=2`);
    const cheap = await createListing(host, { price: 120 });
    await db.listing.update({ where: { id: cheap.id }, data: { bedrooms: 2 } });
    const pricey = await createListing(host, { price: 400 });
    await db.listing.update({ where: { id: pricey.id }, data: { bedrooms: 3 } });
    const small = await createListing(host, { price: 100 });
    await db.listing.update({ where: { id: small.id }, data: { bedrooms: 1 } });
    await searchRun(guest);
    const data = sent.emails[0].data as { searches: { places: { title: string }[] }[] };
    expect(data.searches[0].places.map((p) => p.title)).toEqual([cheap.title]);
  });

  it("sends nothing for a paused search, and resuming starts from then", async () => {
    const guest = await createUser("pauser");
    const host = await createUser("pausehost");
    const search = await saveSearch(guest, `city=${citySlug()}`);
    expect(await setSavedSearchActive(guest, search, false)).toBe(true);
    await createListing(host);
    expect(await searchRun(guest)).toMatchObject({ users: 0, sent: 0 });
    // Resumed after the place was published: it is not new for the search.
    expect(await setSavedSearchActive(guest, search, true, new Date("2026-11-09T07:00:00Z"))).toBe(true);
    expect(await searchRun(guest)).toMatchObject({ sent: 0, quiet: 1 });
    expect(sent.emails).toHaveLength(0);
    // Another user cannot pause it.
    const other = await createUser("stranger");
    expect(await setSavedSearchActive(other, search, false)).toBe(false);
  });

  it("only marks the searches checked when the emails are off, there is no address, or the dates passed", async () => {
    const off = await createUser("off", { prefs: { email: { savedSearches: false } } });
    const dated = await createUser("dated");
    const host = await createUser("offhost");
    const offSearch = await saveSearch(off, `city=${citySlug()}`);
    await saveSearch(dated, `deal=short-stay&city=${citySlug()}&checkIn=2026-11-01&checkOut=2026-11-05`);
    await createListing(host);
    expect(await searchRun(off)).toMatchObject({ off: 1, sent: 0 });
    expect((await db.savedSearch.findUnique({ where: { id: offSearch } }))?.lastCheckedAt?.getTime()).toBe(MONDAY.getTime());
    expect(await searchRun(dated)).toMatchObject({ quiet: 1, sent: 0 });
    expect((await listSavedSearches(dated, MONDAY))[0].datesPassed).toBe(true);
    expect(sent.emails).toHaveLength(0);
  });

  it("never emails demo accounts, and a failed send changes nothing", async () => {
    const demo = await createUser("demo", { isDemo: true });
    const guest = await createUser("failer");
    const host = await createUser("failhost");
    await saveSearch(demo, `city=${citySlug()}`);
    const search = await saveSearch(guest, `city=${citySlug()}`);
    await createListing(host);
    expect(await searchRun(demo)).toMatchObject({ users: 0 });
    sent.fail = true;
    expect(await searchRun(guest)).toMatchObject({ failed: 1, sent: 0 });
    expect((await db.savedSearch.findUnique({ where: { id: search } }))?.lastMatchIds).toEqual([]);
    expect(await db.rateLimit.count({ where: { key: `${DAILY_CLAIM_PREFIX}2026-11-09:${guest}` } })).toBe(0);
    sent.fail = false;
    expect(await searchRun(guest)).toMatchObject({ sent: 1 });
  });

  it("does nothing outside the morning window or on Shabbat", async () => {
    const guest = await createUser("window");
    expect(await runSavedSearchAlerts(new Date("2026-11-09T15:00:00Z"), { isRestTime: never, onlyUserId: guest })).toMatchObject({ status: "too_late" });
    expect(await runSavedSearchAlerts(new Date("2026-11-07T07:30:00Z"), { isRestTime: () => true, onlyUserId: guest })).toMatchObject({ status: "rest_day" });
    expect(await runPriceDropAlerts(new Date("2026-11-07T07:30:00Z"), { isRestTime: () => true, onlyUserId: guest })).toMatchObject({ status: "rest_day" });
  });

  it("saves the same search once, and at most 20", async () => {
    const guest = await createUser("dupes");
    const first = await createSavedSearch(guest, { query: `city=${citySlug()}&sort=newest`, currency: "USD", name: "A" });
    const again = await createSavedSearch(guest, { query: `city=${citySlug()}`, currency: "ILS", name: "B" });
    expect(first.kind).toBe("created");
    expect(again).toMatchObject({ kind: "exists", name: "A" });
    for (let i = 0; i < 19; i++) await createSavedSearch(guest, { query: `city=${citySlug()}&guests=${i + 1}`, currency: "USD", name: `S${i}` });
    expect(await createSavedSearch(guest, { query: `city=${citySlug()}&bedrooms=3`, currency: "USD", name: "Too many" })).toEqual({ kind: "limit" });
  });
});

describe("price-drop emails", () => {
  async function savePlace(userId: string, listingId: string, alertPrice: number | null, alertCurrency: "GEL" | "USD" | null = "GEL") {
    return db.favorite.create({ data: { userId, listingId, alertPrice, alertCurrency }, select: { id: true } });
  }

  it("emails a real drop once and moves the alert price down", async () => {
    const guest = await createUser("dropper", { locale: "he" });
    const host = await createUser("drophost");
    const listing = await createListing(host, { price: 90 });
    const favorite = await savePlace(guest, listing.id, 100);
    expect(await dropRun(guest)).toMatchObject({ status: "ran", sent: 1 });
    expect(sent.emails).toHaveLength(1);
    expect(sent.emails[0]).toMatchObject({ template: "price_drop", locale: "he" });
    expect(sent.emails[0].data).toMatchObject({ oldPrice: 100, newPrice: 90, pct: 10 });
    const token = decodeURIComponent(String(sent.emails[0].data.unsubscribeUrl).split("t=")[1]);
    expect(verifyUnsubscribeToken(token)).toEqual({ userId: guest, kind: "price_drop" });
    expect(Number((await db.favorite.findUnique({ where: { id: favorite.id } }))?.alertPrice)).toBe(90);
    // The same price again: nothing.
    expect(await dropRun(guest, TUESDAY)).toMatchObject({ sent: 0 });
    expect(sent.emails).toHaveLength(1);
  });

  it("sends one email per drop when two runs race", async () => {
    const guest = await createUser("droprace");
    const host = await createUser("droprachost");
    const listing = await createListing(host, { price: 80 });
    await savePlace(guest, listing.id, 100);
    const results = await Promise.all([dropRun(guest), dropRun(guest), dropRun(guest)]);
    expect(results.reduce((n, r) => n + ("sent" in r ? r.sent : 0), 0)).toBe(1);
    expect(sent.emails).toHaveLength(1);
  });

  it("ignores small drops, other currencies, demo and own listings, and the switch", async () => {
    const guest = await createUser("dropmix");
    const off = await createUser("dropoff", { prefs: { email: { priceDrops: false } } });
    const host = await createUser("dropmixhost");
    const small = await createListing(host, { price: 98 });
    await savePlace(guest, small.id, 100);
    const dollars = await createListing(host, { price: 30, currency: "USD" });
    const dollarsFav = await savePlace(guest, dollars.id, 100, "GEL");
    const demo = await createListing(host, { price: 50, isDemo: true });
    await savePlace(guest, demo.id, 100);
    const own = await createListing(guest, { price: 50 });
    await savePlace(guest, own.id, 100);
    const unwatched = await createListing(host, { price: 70 });
    const unwatchedFav = await savePlace(guest, unwatched.id, null, null);
    const offListing = await createListing(host, { price: 50 });
    const offFav = await savePlace(off, offListing.id, 60);

    expect(await dropRun(guest)).toMatchObject({ sent: 0, rebased: 2 });
    // Another currency: the new price becomes the alert price (no email); no alert price yet: the same.
    expect(await db.favorite.findUnique({ where: { id: dollarsFav.id } })).toMatchObject({ alertCurrency: "USD" });
    expect(Number((await db.favorite.findUnique({ where: { id: dollarsFav.id } }))?.alertPrice)).toBe(30);
    expect(Number((await db.favorite.findUnique({ where: { id: unwatchedFav.id } }))?.alertPrice)).toBe(70);
    // Switched off: no email and the alert price stays (turning it on later still tells them).
    expect(await dropRun(off)).toMatchObject({ off: 1, sent: 0 });
    expect(Number((await db.favorite.findUnique({ where: { id: offFav.id } }))?.alertPrice)).toBe(60);
    expect(sent.emails).toHaveLength(0);
  });

  it("does not email a drop of more than half (a changed period or a mistake), and a failed send restores the alert price", async () => {
    const guest = await createUser("dropbig");
    const host = await createUser("dropbighost");
    const big = await createListing(host, { price: 20, editedAt: new Date("2026-11-09T06:00:00Z") });
    const bigFav = await savePlace(guest, big.id, 100);
    expect(await dropRun(guest)).toMatchObject({ sent: 0, rebased: 0 });
    expect(Number((await db.favorite.findUnique({ where: { id: bigFav.id } }))?.alertPrice)).toBe(100);

    const fails = await createListing(host, { price: 85 });
    const failsFav = await savePlace(guest, fails.id, 100);
    sent.fail = true;
    expect(await dropRun(guest)).toMatchObject({ failed: 1 });
    expect(Number((await db.favorite.findUnique({ where: { id: failsFav.id } }))?.alertPrice)).toBe(100);
  });
});

describe("the email switches", () => {
  it("turn the saved-search and price-drop emails off and on, keeping the other preferences", async () => {
    const user = await createUser("switches", { prefs: { email: { weeklyStats: false } } });
    expect(await unsubscribeSwitchOn(user, "saved_search")).toBe(true);
    expect(await setUnsubscribeSwitch(user, "saved_search", false)).toBe(true);
    expect(await setUnsubscribeSwitch(user, "price_drop", false)).toBe(true);
    expect(await unsubscribeSwitchOn(user, "saved_search")).toBe(false);
    expect(await unsubscribeSwitchOn(user, "price_drop")).toBe(false);
    expect(await unsubscribeSwitchOn(user, "weekly_stats")).toBe(false);
    expect(await setUnsubscribeSwitch(user, "price_drop", true)).toBe(true);
    expect(await unsubscribeSwitchOn(user, "price_drop")).toBe(true);
    expect(await unsubscribeSwitchOn(user, "saved_search")).toBe(false);
  });
});
