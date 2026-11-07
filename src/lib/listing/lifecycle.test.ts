/**
 * Listing lifecycle and risk checks against the local database (DATABASE_URL in .env).
 * Creates its own users, city, places and listings with a unique prefix and removes them afterwards.
 * Emails are rendered with the real templates and messages, but not sent.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createTranslator } from "use-intl/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PLEDGE_CURRENT_VERSION } from "@/lib/pledge";

process.env.OVERPASS_ENABLED = "false";
process.env.GOOGLE_TRANSLATE_API_KEY = "";
process.env.TWILIO_ACCOUNT_SID = "";

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const file = path.join(process.cwd(), "messages", locale, `${namespace}.json`);
    const messages = { [namespace]: JSON.parse(fs.readFileSync(file, "utf8")) };
    return createTranslator({ locale, messages, namespace });
  },
}));
vi.mock("@/lib/request", () => ({
  getIpHash: async () => "test-ip",
  getDeviceHash: async () => deviceHash,
  getUserAgent: async () => userAgent,
}));

type Sent = { to: string; template: string; locale: string; subject: string; text: string };
const sent: Sent[] = [];
vi.mock("@/lib/email", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...real,
    sendEmail: vi.fn(async (input: Parameters<typeof real.sendEmail>[0]) => {
      const rendered = await real.renderEmail(input.template, input.locale, input.data as never);
      sent.push({ to: input.to, template: input.template, locale: String(input.locale), subject: rendered.subject, text: rendered.text });
      return { ok: true };
    }),
  };
});

const deviceHash: string | null = "device-1";
const userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";

const { db } = await import("@/lib/db");
const lifecycle = await import("./lifecycle");
const { assessListing, clearBannedWordsCache, isPhotoOfOtherAccount } = await import("@/lib/risk");
const { approximateLocation, haversineMeters } = await import("@/lib/geo");
const { getSettings } = await import("@/lib/settings");
const { AppError, NotFoundError } = await import("@/lib/errors");

const prefix = `vt${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ids = { city: "", place: "", bannedWord: "", users: [] as string[] };
const DAY = 24 * 3600 * 1000;
const point = { lat: 41.7092, lng: 44.7682 };

function randomHash(): string {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

/** Flips `bits` bits of a hex hash (a near-identical photo). */
function nearHash(hash: string, bits: number): string {
  let value = hash.split("").map((c) => parseInt(c, 16));
  for (let i = 0; i < bits; i++) value[i] ^= 1;
  value = value.map((v) => v & 15);
  return value.map((v) => v.toString(16)).join("");
}

async function createUser(
  name: string,
  opts: { verified?: boolean; createdAt?: Date; locale?: "he" | "en" | "ru" | "ar" | "ka"; role?: "USER" | "MODERATOR"; pledgeVersion?: number | null } = {},
) {
  const id = `${prefix}${name}`;
  const digits = String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
  await db.user.create({
    data: {
      id,
      name: `Test ${name}`,
      email: `${id}@example.com`,
      phoneNumber: `+99559${digits}`,
      phoneNumberVerified: opts.verified ?? true,
      locale: opts.locale ?? "en",
      role: opts.role ?? "USER",
      createdAt: opts.createdAt ?? new Date(Date.now() - 60 * DAY),
      welcomePledgeVersion: opts.pledgeVersion === undefined ? PLEDGE_CURRENT_VERSION : opts.pledgeVersion,
      welcomePledgeAcceptedAt: opts.pledgeVersion === null ? null : new Date(),
    },
  });
  ids.users.push(id);
  return id;
}

async function createListing(
  ownerId: string,
  overrides: Partial<{ title: string; description: string; price: number; photos: number; hashes: string[]; rulesAccepted: boolean; dealType: "MONTHLY_RENT" | "SALE"; status: "DRAFT" | "LIVE" }> = {},
) {
  const listing = await db.listing.create({
    data: {
      ownerId,
      status: overrides.status ?? "DRAFT",
      dealType: overrides.dealType ?? "MONTHLY_RENT",
      propertyType: "APARTMENT",
      pricePeriod: overrides.dealType === "SALE" ? "TOTAL" : "MONTH",
      cityId: ids.city,
      lat: point.lat,
      lng: point.lng,
      originalLocale: "en",
      title: overrides.title ?? "Bright two-room flat near Vake Park",
      description: overrides.description ?? "Renovated flat with a balcony, 75 m², 5th floor of 9, five minutes from the park.",
      price: overrides.price ?? 800,
      currency: "USD",
      sizeSqm: 75,
      shabbatFeatures: ["mechanical_key", "no_motion_sensors", "hot_plate"],
      rulesAcceptedAt: overrides.rulesAccepted === false ? null : new Date(),
      contactMethods: [{ channel: "WHATSAPP", value: "+995555000111", order: 0 }],
    },
  });
  const hashes = overrides.hashes ?? Array.from({ length: overrides.photos ?? 5 }, randomHash);
  await db.listingPhoto.createMany({
    data: hashes.map((phash, i) => ({ listingId: listing.id, url: `https://example.com/${i}.webp`, phash, sortOrder: i, isCover: i === 0 })),
  });
  return listing;
}

const emailsFor = (template: string) => sent.filter((e) => e.template === template);

/**
 * Staff "mark reviewed" on a host's report flag (Admin → Flags). Reports against ownerA's listings
 * (the moderation tests) flag the host, and a flagged host's NEW listings wait for review (round 3,
 * ./review-rule.ts); tests that expect a direct publish close the flag first, as staff would.
 */
async function reviewHostFlag(ownerId: string) {
  await db.user.update({ where: { id: ownerId }, data: { hostFlagReviewedAt: new Date() } });
}
const parseCodes = (reasons: unknown) => (Array.isArray(reasons) ? reasons.map((r) => (r as { code: string }).code) : []);

let ownerA = "";
let ownerB = "";
let staff = "";

beforeAll(async () => {
  const city = await db.city.create({
    data: {
      slug: `${prefix}-city`,
      names: { he: "עיר בדיקה", en: "Test City", ru: "Тестовый город", ar: "مدينة اختبار", ka: "სატესტო ქალაქი" },
      searchText: "test city",
      lat: point.lat,
      lng: point.lng,
      airportCode: "TBS",
      airportLat: 41.6692,
      airportLng: 44.9547,
    },
  });
  ids.city = city.id;
  const place = await db.jewishPlace.create({
    data: {
      type: "CHABAD_HOUSE",
      names: { en: "Test Chabad House", he: "בית חב״ד לבדיקה" },
      cityId: city.id,
      lat: point.lat + 0.004,
      lng: point.lng,
      // Walking times come only from verified, non-demo places (brief 5.9, src/lib/nearby.ts).
      verifiedAt: new Date(),
      source: "lifecycle test",
    },
  });
  ids.place = place.id;
  ownerA = await createUser("a", { locale: "he" });
  ownerB = await createUser("b");
  staff = await createUser("staff", { role: "MODERATOR" });
});

beforeEach(() => {
  sent.length = 0;
});

afterAll(async () => {
  const listings = await db.listing.findMany({ where: { ownerId: { in: ids.users } }, select: { id: true } });
  await db.auditLog.deleteMany({ where: { targetId: { in: listings.map((l) => l.id) } } });
  await db.user.deleteMany({ where: { id: { in: ids.users } } });
  if (ids.bannedWord) await db.bannedWord.deleteMany({ where: { id: ids.bannedWord } });
  await db.jewishPlace.deleteMany({ where: { id: ids.place } });
  await db.city.deleteMany({ where: { id: ids.city } });
  await db.$disconnect();
});

describe("publishing", () => {
  it("moves the public map point by a secret, stable offset (not derivable from the listing id)", () => {
    const a = lifecycle.publicMapPoint(point, "listing-id-1");
    expect(lifecycle.publicMapPoint(point, "listing-id-1")).toEqual(a);
    expect(a).not.toEqual(approximateLocation(point, "listing-id-1"));
    const meters = haversineMeters(point, a);
    expect(meters).toBeGreaterThan(0);
    expect(meters).toBeLessThanOrEqual(1000);
  });

  it("sends the first listing of an account to review, with derived fields filled in", async () => {
    const listing = await createListing(ownerA);
    const result = await lifecycle.submitForPublication(listing.id, ownerA);
    expect(result.status).toBe("IN_REVIEW");
    expect(result.reasons.map((r) => r.code)).toContain("first_listing");

    const saved = await db.listing.findUniqueOrThrow({ where: { id: listing.id }, include: { translations: true } });
    expect(saved.status).toBe("IN_REVIEW");
    expect(saved.welcomePledgeVersion).toBe(PLEDGE_CURRENT_VERSION);
    expect(saved.welcomePledgeAt).toBeInstanceOf(Date);
    expect(saved.riskScore).toBe(0);
    expect(saved.approxLat).not.toBeNull();
    expect(Math.abs(saved.approxLat! - point.lat)).toBeLessThan(0.01);
    expect(Number(saved.priceUsd)).toBe(800);
    expect(saved.pricePerSqmUsd).toBeNull();
    expect(saved.isShabbatFriendly).toBe(true);
    expect(saved.translations).toHaveLength(1);
    expect(saved.translations[0]).toMatchObject({ locale: "en", isOriginal: true });
    expect(saved.searchText).toContain("עיר בדיקה");
    expect(saved.searchText).toContain("bright two room flat");
    expect(saved.chabadWalkMin).toBeGreaterThan(0);
    expect(saved.synagogueWalkMin).toBe(saved.chabadWalkMin);
    expect(saved.nearby).toMatchObject({ chabad: { name: { en: "Test Chabad House" } }, airport: { code: "TBS" } });

    expect(emailsFor("listing_in_review")).toHaveLength(1);
    expect(emailsFor("listing_in_review")[0].locale).toBe("he");
  });

  it("goes live directly once the account has an approved listing", async () => {
    const first = await db.listing.findFirstOrThrow({ where: { ownerId: ownerA, status: "IN_REVIEW" } });
    const approved = await lifecycle.approveListing(first.id, staff);
    expect(approved).toEqual({ status: "LIVE", changed: true });
    expect(await lifecycle.approveListing(first.id, staff)).toEqual({ status: "LIVE", changed: false });
    const live = await db.listing.findUniqueOrThrow({ where: { id: first.id } });
    expect(live.publishedAt).not.toBeNull();
    expect(live.reviewedById).toBe(staff);
    const settings = await getSettings();
    expect(Math.round((live.expiresAt!.getTime() - Date.now()) / DAY)).toBe(settings.listingExpiryDays);
    expect(await db.auditLog.count({ where: { targetId: first.id, action: "listing.approve", actorId: staff } })).toBe(1);
    expect(emailsFor("listing_approved")).toHaveLength(1);

    const second = await createListing(ownerA);
    const result = await lifecycle.submitForPublication(second.id, ownerA);
    expect(result).toEqual({ status: "LIVE", reasons: [] });
    expect(emailsFor("listing_live")).toHaveLength(1);
    expect(emailsFor("listing_live")[0].text).toContain("/listing/");
  });

  it("checks the requirements", async () => {
    const fewPhotos = await createListing(ownerA, { photos: 2 });
    await expect(lifecycle.submitForPublication(fewPhotos.id, ownerA)).rejects.toMatchObject({
      code: "missing_requirements",
      requirements: ["photos"],
    });
    const noRules = await createListing(ownerA, { rulesAccepted: false });
    await expect(lifecycle.submitForPublication(noRules.id, ownerA)).rejects.toMatchObject({ code: "rules_not_accepted" });
    await expect(lifecycle.submitForPublication(noRules.id, ownerB)).rejects.toBeInstanceOf(NotFoundError);

    const noPledge = await createUser("np", { pledgeVersion: null });
    const noPledgeListing = await createListing(noPledge);
    await expect(lifecycle.submitForPublication(noPledgeListing.id, noPledge)).rejects.toMatchObject({ code: "pledge_required" });
    const oldPledge = await createUser("op", { pledgeVersion: PLEDGE_CURRENT_VERSION - 1 });
    const oldPledgeListing = await createListing(oldPledge);
    await expect(lifecycle.submitForPublication(oldPledgeListing.id, oldPledge)).rejects.toMatchObject({ code: "pledge_required" });

    const unverified = await createUser("c", { verified: false });
    const listing = await createListing(unverified);
    await expect(lifecycle.submitForPublication(listing.id, unverified)).rejects.toMatchObject({ code: "phone_not_verified" });
    const assessment = await assessListing(listing.id);
    expect(assessment.blocked).toBe(true);
    expect(assessment.reasons.map((r) => r.code)).toContain("phone_not_verified");
  });
});

describe("automatic checks", () => {
  it("flags photos used by another account and by the same owner", async () => {
    const original = await db.listingPhoto.findFirstOrThrow({ where: { listing: { ownerId: ownerA } } });
    const copy = await createListing(ownerB, { hashes: [nearHash(original.phash!, 3), randomHash(), randomHash(), randomHash(), randomHash()] });
    const result = await assessListing(copy.id);
    const duplicate = result.reasons.find((r) => r.code === "duplicate_photos_other_account");
    expect(duplicate?.points).toBe(45);
    expect(result.score).toBeGreaterThanOrEqual(45);
    expect(result.requiresReview).toBe(true);

    const other = await db.listingPhoto.findFirstOrThrow({ where: { listingId: original.listingId, id: { not: original.id } } });
    const own = await createListing(ownerA, { hashes: [other.phash!, randomHash(), randomHash(), randomHash(), randomHash()] });
    const ownResult = await assessListing(own.id);
    expect(ownResult.reasons.map((r) => r.code)).toEqual(["duplicate_photos_same_account"]);
    expect(ownResult.score).toBe(10);
    expect(ownResult.requiresReview).toBe(false);

    // The single-photo check used when a photo is added to a live listing.
    expect(await isPhotoOfOtherAccount(nearHash(original.phash!, 3), copy.id, ownerB)).toBe(true);
    expect(await isPhotoOfOtherAccount(other.phash!, own.id, ownerA)).toBe(false);
    expect(await isPhotoOfOtherAccount(randomHash(), copy.id, ownerB)).toBe(false);
    expect(await isPhotoOfOtherAccount("not-a-hash", copy.id, ownerB)).toBe(false);
  });

  it("flags scam phrases and contact details; the phone number alone stops publishing (mistake check)", async () => {
    const listing = await createListing(ownerA, {
      description: "Nice flat. I am abroad, payment by Western Union only. Call +995 555 12 34 56.",
    });
    const assessment = await assessListing(listing.id);
    const codes = assessment.reasons.map((r) => r.code);
    expect(codes).toContain("scam_phrase");
    expect(codes).toContain("contact_info_in_text");
    const scam = assessment.reasons.find((r) => r.code === "scam_phrase")!;
    expect(scam.points).toBe(60); // western union 30 + abroad 35, capped at 60
    expect(assessment.score).toBe(75);
    // Round 3 (brief 6.1): contact details in the text are an error that blocks publishing, checked
    // again under the row lock with the status change: the listing stays a draft.
    await expect(lifecycle.submitForPublication(listing.id, ownerA)).rejects.toMatchObject({ code: "listing_mistakes", mistakes: ["contact_in_description"] });
    expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("DRAFT");

    // Without the number, the scam phrases send it to review.
    await db.listing.update({ where: { id: listing.id }, data: { description: "Nice flat. I am abroad, payment by Western Union only." } });
    const result = await lifecycle.submitForPublication(listing.id, ownerA);
    expect(result.status).toBe("IN_REVIEW");
    expect(result.reasons.map((r) => r.code)).toContain("scam_phrase");
    const saved = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(saved.riskScore).toBe(60);
    expect(saved.riskReasons).toEqual(result.reasons);
  });

  it("blocks admin BLOCK phrases without publishing", async () => {
    const word = `blk${prefix}`;
    const row = await db.bannedWord.create({ data: { phrase: word, action: "BLOCK", category: "SCAM", weight: 10 } });
    ids.bannedWord = row.id;
    clearBannedWordsCache();
    const listing = await createListing(ownerA, { description: `Pay with ${word.toUpperCase()} please.` });
    const result = await lifecycle.submitForPublication(listing.id, ownerA);
    expect(result.status).toBe("BLOCKED");
    expect(result.reasons.find((r) => r.code === "blocked_phrase")?.detail).toContain(word);
    expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("DRAFT");
    expect(sent).toHaveLength(0);
  });

  it("flags a price far below the area", async () => {
    const listing = await createListing(ownerA, { price: 120 });
    await lifecycle.prepareListingDerivedFields(listing.id); // priceUsd
    const result = await assessListing(listing.id);
    expect(result.reasons).toEqual([expect.objectContaining({ code: "price_far_below_area", points: 30 })]);
    expect(result.requiresReview).toBe(true);
  });

  it("flags new accounts posting fast and shared devices", async () => {
    const fresh = await createUser("d", { createdAt: new Date() });
    const listings = [];
    for (let i = 0; i < 4; i++) listings.push(await createListing(fresh));
    await db.deviceLink.createMany({
      data: [
        { deviceHash: `${prefix}-device`, userId: fresh },
        { deviceHash: `${prefix}-device`, userId: ownerB },
      ],
    });
    const result = await assessListing(listings[3].id);
    const codes = result.reasons.map((r) => r.code);
    expect(codes).toEqual(expect.arrayContaining(["new_account_velocity", "shared_device", "first_listing"]));
    expect(result.score).toBe(45);
  });
});

describe("moderation", () => {
  it("asks for changes in the owner's language; the fix comes back to review, then goes live on approval", async () => {
    const listing = await db.listing.findFirstOrThrow({ where: { ownerId: ownerA, status: "LIVE" }, orderBy: { createdAt: "desc" } });
    const result = await lifecycle.requestChanges(listing.id, staff, "price_unrealistic", "Please check the currency.");
    expect(result).toEqual({ status: "NEEDS_CHANGES", changed: true });
    expect(await lifecycle.requestChanges(listing.id, staff, "price_unrealistic", "Please check the currency.")).toEqual({
      status: "NEEDS_CHANGES",
      changed: false,
    });
    const [email] = emailsFor("listing_needs_changes");
    expect(email.locale).toBe("he");
    expect(email.text).toContain("המחיר לא נראה מציאותי");
    expect(email.text).toContain("Please check the currency.");
    await expect(lifecycle.requestChanges(listing.id, staff, "not_a_reason" as never)).rejects.toMatchObject({ code: "invalid_input" });

    // Round 3 (./review-rule.ts): after "ask for changes" only a person lets it go live.
    const resubmitted = await lifecycle.submitForPublication(listing.id, ownerA);
    expect(resubmitted.status).toBe("IN_REVIEW");
    expect(await lifecycle.approveListing(listing.id, staff)).toEqual({ status: "LIVE", changed: true });
    const saved = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(saved.moderationReason).toBeNull();
  });

  it("rejects, and a rejected listing always goes back to a person", async () => {
    const listing = await createListing(ownerA);
    await lifecycle.submitForPublication(listing.id, ownerA);
    expect(await lifecycle.rejectListing(listing.id, staff, "suspected_scam")).toEqual({ status: "REJECTED", changed: true });
    expect(emailsFor("listing_rejected")).toHaveLength(1);
    expect(await db.auditLog.count({ where: { targetId: listing.id, action: "listing.reject" } })).toBe(1);
    const again = await lifecycle.submitForPublication(listing.id, ownerA);
    expect(again.status).toBe("IN_REVIEW");
  });

  /** A report from a new account (on its own device unless `device` is given). */
  async function report(listingId: string, name: string, opts: { trusted?: boolean; device?: string } = {}) {
    const trusted = opts.trusted ?? true;
    const reporter = await createUser(name, trusted ? {} : { verified: false, createdAt: new Date() });
    await db.deviceLink.create({ data: { userId: reporter, deviceHash: opts.device ?? `${prefix}-device-${name}` } });
    await db.report.create({ data: { targetType: "LISTING", listingId, reporterId: reporter, reason: "FAKE_LISTING" } });
    return lifecycle.applyReport(listingId);
  }

  it("does not hide a listing for reports from fake accounts or one device", async () => {
    const listing = await createListing(ownerA);
    await lifecycle.submitForPublication(listing.id, ownerA);
    const { reportsToAutoHide } = await getSettings();
    // Brand-new accounts without a verified phone, anonymous reports, and accounts sharing one device.
    for (let i = 0; i < reportsToAutoHide; i++) await report(listing.id, `fake${i}`, { trusted: false });
    await db.report.create({ data: { targetType: "LISTING", listingId: listing.id, reason: "FAKE_LISTING" } });
    let last = await lifecycle.applyReport(listing.id);
    for (let i = 0; i < reportsToAutoHide; i++) last = await report(listing.id, `shared${i}`, { device: `${prefix}-one-phone` });
    expect(last).toEqual({ hidden: false, openReports: reportsToAutoHide * 2 + 1, countedReports: 1 });
    expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("LIVE");
    expect(emailsFor("listing_hidden_reports")).toHaveLength(0);

    // Round 3: 2+ reports in 12 months flag the host, so their next NEW listing waits for a person,
    // until staff mark the flag reviewed.
    const next = await createListing(ownerA);
    expect(await lifecycle.submitForPublication(next.id, ownerA)).toMatchObject({ status: "IN_REVIEW" });
    await reviewHostFlag(ownerA);
    const after = await createListing(ownerA);
    expect(await lifecycle.submitForPublication(after.id, ownerA)).toMatchObject({ status: "LIVE" });
  });

  it("hides a listing after enough reports from distinct trusted accounts and restores it", async () => {
    const listing = await createListing(ownerA);
    await lifecycle.submitForPublication(listing.id, ownerA);
    const { reportsToAutoHide } = await getSettings();
    let last = { hidden: false, openReports: 0, countedReports: 0 };
    for (let i = 0; i < reportsToAutoHide; i++) {
      last = await report(listing.id, `reporter${i}`);
      if (i < reportsToAutoHide - 1) expect(last.hidden).toBe(false);
    }
    expect(last).toEqual({ hidden: true, openReports: reportsToAutoHide, countedReports: reportsToAutoHide });
    const hidden = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(hidden).toMatchObject({ status: "HIDDEN", reportCount: reportsToAutoHide });
    expect(emailsFor("listing_hidden_reports")).toHaveLength(1);
    expect(await db.auditLog.count({ where: { targetId: listing.id, action: "listing.auto_hide", actorId: null } })).toBe(1);

    expect(await lifecycle.restoreHiddenListing(listing.id, staff)).toEqual({ status: "LIVE", changed: true });
  });
});

describe("owner actions", () => {
  beforeEach(() => reviewHostFlag(ownerA));

  it("pauses, rents, renews and deletes — idempotently and only for the owner", async () => {
    const listing = await createListing(ownerA);
    await lifecycle.submitForPublication(listing.id, ownerA);

    expect(await lifecycle.pauseListing(listing.id, ownerA)).toMatchObject({ status: "PAUSED", changed: true });
    expect(await lifecycle.pauseListing(listing.id, ownerA)).toMatchObject({ status: "PAUSED", changed: false });
    await expect(lifecycle.pauseListing(listing.id, ownerB)).rejects.toBeInstanceOf(NotFoundError);
    expect(await lifecycle.unpauseListing(listing.id, ownerA)).toMatchObject({ status: "LIVE", changed: true });

    await expect(lifecycle.markSold(listing.id, ownerA)).rejects.toMatchObject({ code: "wrong_deal_type" });
    expect(await lifecycle.markRented(listing.id, ownerA)).toMatchObject({ status: "RENTED", changed: true });

    const renewed = await lifecycle.renewListing(listing.id, ownerA);
    expect(renewed).toMatchObject({ status: "LIVE", changed: true });
    // Renewing again right away is not a free bump.
    expect(await lifecycle.renewListing(listing.id, ownerA)).toMatchObject({ status: "LIVE", changed: false });

    expect(await lifecycle.softDeleteListing(listing.id, ownerA)).toMatchObject({ status: "DELETED", changed: true });
    expect(await lifecycle.softDeleteListing(listing.id, ownerA)).toMatchObject({ status: "DELETED", changed: false });
    expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).deletedAt).not.toBeNull();
    await expect(lifecycle.renewListing(listing.id, ownerA)).rejects.toMatchObject({ code: "invalid_status" });
    await expect(lifecycle.renewListing(listing.id, ownerA)).rejects.toBeInstanceOf(AppError);
  });

  it("checks a listing again before it goes back online when it was edited since the last check", async () => {
    const listing = await createListing(ownerA);
    await lifecycle.submitForPublication(listing.id, ownerA);
    const checked = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(checked.status).toBe("LIVE");
    expect(checked.lastCheckedAt).not.toBeNull();

    // Paused and untouched: back online without running the checks again.
    await lifecycle.pauseListing(listing.id, ownerA);
    expect(await lifecycle.unpauseListing(listing.id, ownerA)).toMatchObject({ status: "LIVE", changed: true });
    expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).lastCheckedAt).toEqual(checked.lastCheckedAt);

    // Paused, then edited (as the wizard saves it): the checks run and send it to a person.
    await lifecycle.pauseListing(listing.id, ownerA);
    await db.listing.update({
      where: { id: listing.id },
      data: { description: "I am abroad, payment by Western Union only.", contentUpdatedAt: new Date() },
    });
    sent.length = 0;
    expect(await lifecycle.unpauseListing(listing.id, ownerA)).toMatchObject({ status: "IN_REVIEW", changed: true });
    const inReview = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(inReview.riskScore).toBeGreaterThanOrEqual(60);
    expect(inReview.lastCheckedAt!.getTime()).toBeGreaterThan(checked.lastCheckedAt!.getTime());
    expect(emailsFor("listing_in_review")).toHaveLength(1);
  });

  it("checks a rented listing again on renew when a photo was added since the last check", async () => {
    const listing = await createListing(ownerA);
    await lifecycle.submitForPublication(listing.id, ownerA);
    await lifecycle.markRented(listing.id, ownerA);
    // A photo already used by another account's listing (the duplicate-photo check).
    const theirs = await createListing(ownerB);
    const copied = await db.listingPhoto.findFirstOrThrow({ where: { listingId: theirs.id }, select: { phash: true } });
    await db.listingPhoto.create({ data: { listingId: listing.id, url: "https://example.com/new.webp", phash: copied.phash, sortOrder: 9 } });
    sent.length = 0;
    expect(await lifecycle.renewListing(listing.id, ownerA)).toMatchObject({ status: "IN_REVIEW", changed: true });
    const saved = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(parseCodes(saved.riskReasons)).toContain("duplicate_photos_other_account");
    expect(emailsFor("listing_in_review")).toHaveLength(1);
  });

  it("re-checks a live listing after a price change only when its content changed since the last check", async () => {
    const listing = await createListing(ownerA);
    await lifecycle.submitForPublication(listing.id, ownerA);
    expect(await lifecycle.recheckLiveListingAfterPriceChange(listing.id, ownerA)).toMatchObject({ status: "LIVE", rechecked: false });

    // The price step saved a new price together with text that was never checked.
    await db.listing.update({
      where: { id: listing.id },
      data: { price: 790, description: "I am abroad, payment by Western Union only.", contentUpdatedAt: new Date() },
    });
    sent.length = 0;
    await expect(lifecycle.recheckLiveListingAfterPriceChange(listing.id, ownerB)).rejects.toBeInstanceOf(NotFoundError);
    const result = await lifecycle.recheckLiveListingAfterPriceChange(listing.id, ownerA);
    expect(result).toMatchObject({ status: "IN_REVIEW", rechecked: true });
    expect(result.reasons.map((r) => r.code)).toContain("scam_phrase");
    expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("IN_REVIEW");
    expect(emailsFor("listing_in_review")).toHaveLength(1);
  });

  it("records price drops and clears the label when the price goes back up", async () => {
    const listing = await createListing(ownerA);
    await lifecycle.recordPriceChange(listing.id, 800, 700, "USD");
    let saved = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(Number(saved.previousPrice)).toBe(800);
    expect(saved.priceDroppedAt).not.toBeNull();
    await lifecycle.recordPriceChange(listing.id, 700, 700, "USD");
    await lifecycle.recordPriceChange(listing.id, 700, 850, "USD");
    saved = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(saved.previousPrice).toBeNull();
    expect(saved.priceDroppedAt).toBeNull();
    expect(await db.priceChange.count({ where: { listingId: listing.id } })).toBe(2);
  });
});

describe("expiry", () => {
  beforeEach(() => reviewHostFlag(ownerA));

  it("warns before expiry and then expires", async () => {
    const listing = await createListing(ownerA);
    await lifecycle.submitForPublication(listing.id, ownerA);
    const now = new Date();
    await db.listing.update({ where: { id: listing.id }, data: { expiresAt: new Date(now.getTime() + DAY) } });

    const first = await lifecycle.expireDueListings(now);
    expect(first.warned).toBeGreaterThanOrEqual(1);
    expect(emailsFor("listing_expiring").some((e) => e.to.startsWith(ownerA))).toBe(true);
    const again = await lifecycle.expireDueListings(now);
    expect(emailsFor("listing_expiring").filter((e) => e.to.startsWith(ownerA))).toHaveLength(1);
    expect(again.warned).toBe(0);

    const later = new Date(now.getTime() + 2 * DAY);
    const result = await lifecycle.expireDueListings(later);
    expect(result.expired).toBeGreaterThanOrEqual(1);
    expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("EXPIRED");
    expect(emailsFor("listing_expired").some((e) => e.to.startsWith(ownerA))).toBe(true);

    expect(await lifecycle.renewListing(listing.id, ownerA)).toMatchObject({ status: "LIVE", changed: true });
  });
});

describe("prices in USD", () => {
  it("converts prices and computes the price per m² for sales", () => {
    const rates = { USD: 1, GEL: 2.5, ILS: 4, EUR: 0.8, GBP: 0.8, AED: 3.67 };
    expect(lifecycle.computeUsdPrices({ price: 250_000, currency: "GEL", dealType: "SALE", sizeSqm: 100 }, [], rates)).toEqual({
      priceUsd: 100_000,
      pricePerSqmUsd: 1000,
      roomTypePricesUsd: [],
    });
    expect(
      lifecycle.computeUsdPrices({ price: null, currency: "USD", dealType: "HOTEL_ROOM", sizeSqm: null }, [
        { price: 200, currency: "GEL" },
        { price: 320, currency: "ILS" },
      ], rates),
    ).toEqual({ priceUsd: 80, pricePerSqmUsd: null, roomTypePricesUsd: [80, 80] });
  });
});

// Stats (views, saves, contact taps, bookings): src/lib/listing/stats.test.ts.
