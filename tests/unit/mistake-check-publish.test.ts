/**
 * Round 3, brief 6.1 against the local database (DATABASE_URL in .env): the mistake check's
 * ERRORS stop publishing ON THE SERVER, whatever the browser shows.
 *
 * - "פרסום" (acceptRulesAndPublish) refuses a short stay without an exact address, with fewer
 *   than 5 photos, or with a phone number in the description ("listing_mistakes"); the listing
 *   stays a draft. Warnings (0 bathrooms) never stop it.
 * - "Save changes" (saveChanges) of a live listing refuses too, and a live listing with errors
 *   doesn't stay on the site: it waits for review (more cases: ./mistake-gates-db.test.ts).
 * - getListingMistakes is the owner's panel and the admin box: the same answer.
 * - The photo room label (updatePhotoRoom): owner only, one of the 7 rooms or null.
 *
 * The session, the founder's alerts, emails, the price guide (owned by another feature) and
 * Shabbat mode are stand-ins; everything else is the real code. Rows use fake @example.com
 * addresses and test-range phone numbers, and are removed afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as null | Record<string, unknown>,
  founder: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => undefined,
}));
vi.mock("next-intl/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-intl/server")>()),
  getLocale: async () => "he",
}));
vi.mock("@/lib/auth/session", async () => {
  const { AppError } = await import("@/lib/errors");
  return {
    requireUserForAction: async () => {
      if (!state.user) throw new AppError("auth_required", "Sign-in required", { status: 401 });
      return state.user;
    },
  };
});
vi.mock("@/lib/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/settings")>()),
  assertNotShabbatMode: async () => undefined,
}));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmail: async () => ({ ok: true, delivery: "logged" }),
}));
vi.mock("@/lib/alerts/founder-admin", () => ({
  notifyFounderListingInReview: async (id: string) => void state.founder.push(id),
}));
// The price guide belongs to another feature; here it never has enough data (no price warning).
vi.mock("@/lib/pricing/guide-server", () => ({
  getPriceGuide: async () => ({ status: "not_enough", unit: "night", currency: "GEL", scope: { level: "city", cityId: "", matched: [] }, references: [] }),
  getRoomTypePriceGuides: async () => new Map(),
}));
vi.mock("@/lib/pricing/guide", () => ({ pricePosition: () => null }));
// Nearby places ask OpenStreetMap over the network: not part of this test.
vi.mock("@/lib/nearby", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/nearby")>()),
  computeListingProximity: async () => undefined,
}));

const { db } = await import("@/lib/db");
const { PLEDGE_CURRENT_VERSION } = await import("@/lib/pledge");
const { acceptRulesAndPublish, saveChanges, updatePhotoRoom } = await import("@/lib/wizard/actions");
const { getListingMistakes } = await import("@/lib/listing/mistake-check-server");

const prefix = `p4m${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const id = (name: string) => `${prefix}-${name}`;
const users = { owner: id("owner"), other: id("other") };
let cityId = "";

function sessionUser(userId: string) {
  return { id: userId, role: "USER", phoneNumberVerified: true, twoFactorVerified: true, businessName: null, accountType: "PRIVATE" };
}

/** A complete short stay (every publishing requirement met) that the test then breaks. */
async function draft(extra: Record<string, unknown> = {}, photos = 5) {
  const row = await db.listing.create({
    data: {
      ownerId: users.owner,
      status: "DRAFT",
      dealType: "SHORT_STAY",
      propertyType: "APARTMENT",
      cityId,
      lat: 41.64,
      lng: 41.62,
      address: "Fake street 1, apt 2",
      originalLocale: "en",
      title: `${prefix} quiet flat by the sea`,
      description: "A quiet flat with a balcony and a full kitchen, five minutes from the sea and the old town.",
      price: 80,
      currency: "GEL",
      pricePeriod: "NIGHT",
      maxGuests: 2,
      bedsDouble: 1,
      bathrooms: 0,
      checkInFrom: "14:00",
      checkOutUntil: "11:00",
      paymentMethodsAtCheckIn: ["cash"],
      contactMethods: [{ channel: "WHATSAPP", value: "+995555990001", order: 0 }],
      ...extra,
    } as Parameters<typeof db.listing.create>[0]["data"],
  });
  for (let i = 0; i < photos; i += 1) {
    await db.listingPhoto.create({ data: { listingId: row.id, url: `/photos/cities/batumi.webp`, sortOrder: i, isCover: i === 0 } });
  }
  return row.id;
}

beforeAll(async () => {
  await db.user.createMany({
    data: Object.entries(users).map(([name, userId], i) => ({
      id: userId,
      name: `${name} Test`,
      email: `${userId}@example.com`,
      locale: "en",
      phoneNumber: `+99555599${String(9000 + i)}`,
      phoneNumberVerified: true,
      welcomePledgeVersion: PLEDGE_CURRENT_VERSION,
    })),
  });
  const city = await db.city.create({
    data: { slug: id("city"), names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "city", lat: 41.6168, lng: 41.6367 },
  });
  cityId = city.id;
});

afterAll(async () => {
  const ids = Object.values(users);
  const listingIds = (await db.listing.findMany({ where: { ownerId: { in: ids } }, select: { id: true } })).map((l) => l.id);
  await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { targetId: { in: [...ids, ...listingIds] } }] } });
  await db.rateLimit.deleteMany({ where: { OR: ids.map((userId) => ({ key: { contains: userId } })) } });
  await db.emailOutbox.deleteMany({ where: { to: { in: ids.map((userId) => `${userId}@example.com`) } } }).catch(() => undefined);
  await db.listing.deleteMany({ where: { id: { in: listingIds } } });
  await db.city.deleteMany({ where: { slug: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
});

beforeEach(() => {
  state.user = sessionUser(users.owner);
  state.founder.length = 0;
});

describe("publishing refuses while the mistake check has errors (server-side)", () => {
  it("no exact address for a short stay", async () => {
    const listingId = await draft({ address: null });
    const result = await acceptRulesAndPublish(listingId, { rulesAccepted: true });
    expect(result).toEqual({ ok: false, error: "listing_mistakes", fieldErrors: { mistakes: ["address_missing"] } });
    expect((await db.listing.findUniqueOrThrow({ where: { id: listingId } })).status).toBe("DRAFT");
  });

  it("a phone number in the description", async () => {
    const listingId = await draft({ description: "A quiet flat with a balcony and a full kitchen. Call me on +995 555 12 34 56 for a discount." });
    const result = await acceptRulesAndPublish(listingId, { rulesAccepted: true });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.fieldErrors?.mistakes).toEqual(["contact_in_description"]);
    expect((await db.listing.findUniqueOrThrow({ where: { id: listingId } })).status).toBe("DRAFT");
  });

  it("warnings (0 bathrooms, unlabelled photos) don't stop it: the first listing goes to review", { timeout: 20_000 }, async () => {
    const listingId = await draft();
    const mistakes = await getListingMistakes(listingId);
    expect(mistakes.errors).toEqual([]);
    expect(mistakes.warnings.map((w) => w.code)).toEqual(["no_bathrooms", "photo_rooms_missing"]);
    const result = await acceptRulesAndPublish(listingId, { rulesAccepted: true });
    expect(result.ok && result.data.status).toBe("IN_REVIEW");
  });
});

describe("'Save changes' of a published listing", () => {
  it("refuses while there are errors, and holds the live listing for review instead of leaving it on the site", async () => {
    const past = new Date(Date.now() - 86_400_000);
    const listingId = await draft({
      status: "LIVE",
      publishedAt: past,
      rulesAcceptedAt: past,
      lastCheckedAt: past,
      riskScore: 0,
      riskReasons: [],
      contentUpdatedAt: new Date(),
      address: "",
    });
    const result = await saveChanges(listingId, null);
    expect(result).toEqual({ ok: false, error: "listing_mistakes", fieldErrors: { mistakes: ["address_missing"] } });
    const row = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(row.status).toBe("IN_REVIEW");
    expect(state.founder).toContain(listingId);
  });

  it("goes through when the error is fixed", { timeout: 20_000 }, async () => {
    const past = new Date(Date.now() - 86_400_000);
    const listingId = await draft({ status: "LIVE", publishedAt: past, rulesAcceptedAt: past, lastCheckedAt: past, riskScore: 0, riskReasons: [] });
    const result = await saveChanges(listingId, null);
    expect(result.ok).toBe(true);
  });
});

describe("photo room labels", () => {
  it("the owner sets and clears a label; nobody else can; only the 7 rooms", async () => {
    const listingId = await draft();
    const photo = await db.listingPhoto.findFirstOrThrow({ where: { listingId } });
    expect(await updatePhotoRoom(listingId, photo.id, "KITCHEN")).toEqual({ ok: true, data: undefined });
    expect((await db.listingPhoto.findUniqueOrThrow({ where: { id: photo.id } })).room).toBe("KITCHEN");
    expect((await updatePhotoRoom(listingId, photo.id, "GARAGE")).ok).toBe(false);
    expect((await db.listingPhoto.findUniqueOrThrow({ where: { id: photo.id } })).room).toBe("KITCHEN");

    state.user = sessionUser(users.other);
    expect(await updatePhotoRoom(listingId, photo.id, "BEDROOM")).toMatchObject({ ok: false, error: "not_found" });
    expect((await db.listingPhoto.findUniqueOrThrow({ where: { id: photo.id } })).room).toBe("KITCHEN");

    state.user = sessionUser(users.owner);
    expect((await updatePhotoRoom(listingId, photo.id, null)).ok).toBe(true);
    expect((await db.listingPhoto.findUniqueOrThrow({ where: { id: photo.id } })).room).toBeNull();
  });

  it("labels count for the check: kitchen, bedroom and bathroom photos clear the warning", async () => {
    const listingId = await draft({ bathrooms: 1 });
    const photos = await db.listingPhoto.findMany({ where: { listingId }, orderBy: { sortOrder: "asc" } });
    for (const [i, room] of (["BEDROOM", "KITCHEN", "BATHROOM"] as const).entries()) {
      expect((await updatePhotoRoom(listingId, photos[i].id, room)).ok).toBe(true);
    }
    expect(await getListingMistakes(listingId)).toEqual({ errors: [], warnings: [] });
  });
});
