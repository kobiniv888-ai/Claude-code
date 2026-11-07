/**
 * The price guide's data rules (round 3, brief 5) against the local database: only LIVE, non-demo
 * listings of OTHER owners count, priced in the deal type's unit; prices are converted to the
 * host's currency; reference prices (active, not stale) come separately; hotels compare room
 * types; a host gets the guide of their own listing only.
 *
 * Creates its own (inactive) city, fake @example.com users and listings, and removes them after.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { getRates } = await import("@/lib/currency");
const { convert } = await import("@/lib/currency/convert");
const { getPriceGuide, getListingPriceGuides } = await import("@/lib/pricing/guide-server");
const { pricePosition } = await import("@/lib/pricing/guide");

const prefix = `pg${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const names = { he: "עיר בדיקה", en: "Test town", ru: "Город", ar: "مدينة", ka: "ქალაქი" };
const user = (key: string) => `${prefix}-${key}`;
const ids = { city: "", hostListing: "", otherListing: "" };

type ListingData = Parameters<typeof db.listing.create>[0]["data"];

async function listing(ownerKey: string, data: Partial<ListingData> = {}) {
  const row = await db.listing.create({
    data: {
      ownerId: user(ownerKey),
      status: "LIVE",
      dealType: "SHORT_STAY",
      propertyType: "APARTMENT",
      cityId: ids.city,
      bedrooms: 2,
      bathrooms: 1,
      price: 50,
      currency: "GEL",
      pricePeriod: "NIGHT",
      title: `${prefix} flat`,
      publishedAt: new Date(),
      ...data,
    } as ListingData,
  });
  return row.id;
}

beforeAll(async () => {
  await db.user.createMany({
    data: ["host", "o1", "o2", "o3", "o4", "demo", "suspended"].map((key) => ({
      id: user(key),
      name: `${prefix} ${key}`,
      email: `${prefix}-${key}@example.com`,
      isDemo: key === "demo",
      ...(key === "suspended" ? { status: "SUSPENDED" as const } : {}),
    })),
  });
  // Inactive: never listed on the site while the test runs.
  const city = await db.city.create({ data: { slug: `${prefix}-city`, names, searchText: "test town", lat: 41.6, lng: 41.6, active: false } });
  ids.city = city.id;

  // Five similar places of four owners (one priced in dollars).
  await listing("o1", { price: 50 });
  await listing("o1", { price: 60 });
  await listing("o2", { price: 70 });
  ids.otherListing = await listing("o3", { price: 30, currency: "USD" });
  await listing("o4", { price: 90, weekendPrice: 110 });
  // None of these may count:
  ids.hostListing = await listing("host", { price: 1000 }); // the host's own
  await listing("o4", { price: 5000, isDemo: true }); // demo listing
  await listing("demo", { price: 5000 }); // a demo owner's listing
  await listing("o2", { price: 3000, status: "PAUSED" }); // not live
  await listing("o2", { price: 3000, status: "LIVE", deletedAt: new Date() }); // deleted
  await listing("o3", { price: 4000, pricePeriod: "WEEK" }); // another unit
  await listing("o3", { price: 4000, propertyType: "VILLA" }); // another type
  await listing("o3", { price: 4000, dealType: "MONTHLY_RENT", pricePeriod: "MONTH" }); // another deal
  // Not on the public site either: a suspended owner's LIVE listing, and an expired one not swept yet.
  await listing("suspended", { price: 1 });
  await listing("o2", { price: 1, expiresAt: new Date(Date.now() - 86_400_000) });

  await db.referencePrice.createMany({
    data: [
      { cityId: city.id, dealType: "SHORT_STAY", unit: "NIGHT", low: 40, high: 80, currency: "GEL", sourceName: `${prefix} report`, sourceUrl: "https://example.com/report", sourceMonth: new Date("2026-06-01T00:00:00Z") },
      { cityId: city.id, dealType: "SHORT_STAY", unit: "NIGHT", low: 1, high: 2, currency: "GEL", sourceName: `${prefix} old`, sourceMonth: new Date("2022-01-01T00:00:00Z") },
      { cityId: city.id, dealType: "SHORT_STAY", unit: "NIGHT", low: 1, high: 2, currency: "GEL", sourceName: `${prefix} off`, sourceMonth: new Date("2026-06-01T00:00:00Z"), active: false },
      { cityId: city.id, dealType: "SHORT_STAY", propertyType: "VILLA", unit: "NIGHT", low: 1, high: 2, currency: "GEL", sourceName: `${prefix} villas`, sourceMonth: new Date("2026-06-01T00:00:00Z") },
    ],
  });
});

afterAll(async () => {
  await db.referencePrice.deleteMany({ where: { sourceName: { startsWith: prefix } } });
  await db.listing.deleteMany({ where: { title: { startsWith: prefix } } });
  await db.city.deleteMany({ where: { slug: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
});

const input = (over: Partial<Parameters<typeof getPriceGuide>[0]> = {}) => ({
  excludeOwnerId: user("host"),
  cityId: ids.city,
  dealType: "SHORT_STAY" as const,
  propertyType: "APARTMENT" as const,
  bedrooms: 2,
  displayCurrency: "GEL" as const,
  ...over,
});

describe("getPriceGuide", () => {
  it("counts only live, non-demo places of other owners, in the deal type's unit, converted to the host's currency", async () => {
    const guide = await getPriceGuide(input());
    const usd30 = Math.round(convert(30, "USD", "GEL", await getRates()));
    const sorted = [50, 60, 70, 90, usd30].sort((a, b) => a - b);
    expect(guide.status).toBe("ok");
    expect(guide.unit).toBe("night");
    expect(guide.currency).toBe("GEL");
    expect(guide.converted).toBe(true);
    expect(guide.price).toMatchObject({ count: 5, owners: 4, median: sorted[2], p25: sorted[1], p75: sorted[3] });
    expect(guide.price?.min).toBeUndefined();
    // Only one place has a weekend price: no weekend numbers.
    expect(guide.weekend).toBeUndefined();
    expect(guide.scope.matched).toEqual(["deal:SHORT_STAY", "type:APARTMENT", "bedrooms:2"]);
    expect(pricePosition(guide, 1000, "GEL")).toBe("far_above");
  });

  it("says not enough when the asking owner's two places are left out (4 places)", async () => {
    // Asked by o1: o1's two places are left out, the "host" user's place counts.
    const guide = await getPriceGuide(input({ excludeOwnerId: user("o1") }));
    expect(guide.status).toBe("not_enough");
    expect(guide.price).toBeUndefined();
  });

  it("never counts the listing it is asked about", async () => {
    // Asked by o4: 5 places without o4's; leaving out o3's listing too leaves 4.
    expect((await getPriceGuide(input({ excludeOwnerId: user("o4") }))).status).toBe("ok");
    const guide = await getPriceGuide(input({ excludeOwnerId: user("o4"), listingId: ids.otherListing }));
    expect(guide.status).toBe("not_enough");
  });

  it("shows active, recent reference prices that fit, apart from Bayit's numbers", async () => {
    const guide = await getPriceGuide(input());
    expect(guide.references).toEqual([
      { low: 40, high: 80, currency: "GEL", unit: "night", sourceName: `${prefix} report`, sourceUrl: "https://example.com/report", sourceMonth: "2026-06", perSqm: false },
    ]);
    const inDollars = await getPriceGuide(input({ displayCurrency: "USD" }));
    expect(inDollars.references[0]).toMatchObject({ currency: "USD", converted: true });
    expect(inDollars.price?.median).toBeLessThan(60);
  });

  it("compares hotel rooms by room type", async () => {
    const hotels: string[] = [];
    for (const [i, owner] of ["o1", "o2", "o3", "o4", "o1"].entries()) {
      const id = await listing(owner, { dealType: "HOTEL_ROOM", propertyType: "HOTEL", price: null, bedrooms: null });
      hotels.push(id);
      await db.roomType.createMany({
        data: [
          { listingId: id, names: { en: "Double" }, price: 100 + i * 10, currency: "GEL", bedsDouble: 1, quantity: 2 },
          { listingId: id, names: { en: "Family" }, price: 300, currency: "GEL", bedsDouble: 1, bedsSofa: 1, quantity: 1 },
        ],
      });
    }
    const mine = await listing("host", { dealType: "HOTEL_ROOM", propertyType: "HOTEL", price: null, bedrooms: null });
    const [double] = await db.roomType.createManyAndReturn({
      data: [{ listingId: mine, names: { en: "My double", he: "החדר הזוגי שלי" }, price: 95, currency: "GEL", bedsDouble: 1, quantity: 1 }],
    });
    const guide = await getPriceGuide(input({ dealType: "HOTEL_ROOM", propertyType: "HOTEL", bedrooms: null, listingId: mine, roomTypeId: double.id }));
    expect(guide.scope.matched).toContain("guests:2");
    expect(guide.price).toMatchObject({ count: 5, owners: 4, median: 120 });

    const view = await getListingPriceGuides(mine, user("host"), { locale: "he" });
    expect(view?.items).toHaveLength(1);
    expect(view?.items[0]).toMatchObject({ roomTypeId: double.id, roomName: "החדר הזוגי שלי", price: 95 });
    expect(view?.items[0].guide.price?.median).toBe(120);
    await db.listing.deleteMany({ where: { id: { in: [...hotels, mine] } } });
  });
});

describe("getListingPriceGuides", () => {
  it("gives a host the guide of their own listing, with the place's names", async () => {
    const view = await getListingPriceGuides(ids.hostListing, user("host"), { locale: "he" });
    expect(view).toMatchObject({ listingId: ids.hostListing, needsCity: false, needsRooms: false, place: { city: "עיר בדיקה", neighborhood: null } });
    expect(view?.items[0]).toMatchObject({ price: 1000, currency: "GEL", period: "NIGHT" });
    expect(view?.items[0].guide.price?.count).toBe(5);
  });

  it("gives nothing for another owner's listing", async () => {
    expect(await getListingPriceGuides(ids.otherListing, user("host"), { locale: "he" })).toBeNull();
  });

  it("asks for a city first", async () => {
    const id = await listing("host", { cityId: null });
    const view = await getListingPriceGuides(id, user("host"), { locale: "en" });
    expect(view).toMatchObject({ needsCity: true, items: [] });
  });
});

describe("the mistake check's price warnings for a hotel (mistake-6)", () => {
  it("loads the comparison data once for all the room types, not once per room type", async () => {
    const { getListingMistakes } = await import("@/lib/listing/mistake-check-server");
    const hotel = await listing("host", { dealType: "HOTEL_ROOM", propertyType: "HOTEL", status: "DRAFT", price: null, bedrooms: null });
    for (const [i, price] of [90, 100, 110].entries()) {
      await db.roomType.create({
        data: { listingId: hotel, names: { ...names, he: `חדר ${i}` }, price, currency: "GEL", pricePeriod: "NIGHT", maxGuests: 2, bedsDouble: 1, quantity: 1, active: true },
      });
    }
    const spy = vi.spyOn(db.roomType, "findMany");
    try {
      await getListingMistakes(hotel);
      // The candidates' query is the one that reads other listings' room types.
      const candidateLoads = spy.mock.calls.filter(([args]) => !!(args as { where?: { listing?: unknown } } | undefined)?.where?.listing).length;
      expect(candidateLoads).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
});
