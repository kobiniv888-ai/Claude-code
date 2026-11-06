import { describe, expect, it } from "vitest";
import {
  GUIDE_RULES,
  bathroomsKey,
  bedroomsKey,
  complementOk,
  computeGuide,
  guestsKey,
  guidePeriodFor,
  isSafeGroup,
  parseMatched,
  percentile,
  positionIn,
  pricePosition,
  roomSleeps,
  roundGuide,
  sizeBand,
  sizeBandBounds,
  statsOf,
  type GuideCandidate,
  type GuideQuery,
  type GuideResult,
} from "./guide";
import { isStaleReference, matchReferencePrices, referenceMonth, type ReferenceRow } from "./reference";

let seq = 0;
/** A candidate place; each gets its own listing and (unless given) its own owner. */
function place(price: number, over: Partial<GuideCandidate> = {}): GuideCandidate {
  seq += 1;
  return {
    listingId: `l${seq}`,
    ownerId: `o${seq}`,
    neighborhoodId: null,
    bedrooms: 2,
    guests: null,
    bathrooms: 1,
    hasKitchen: true,
    seaView: false,
    newBuilding: true,
    sizeSqm: 70,
    price,
    weekendPrice: null,
    converted: false,
    ...over,
  };
}

const CTX = { cityId: "batumi", currency: "GEL" as const };
const Q: GuideQuery = { dealType: "SHORT_STAY", propertyType: "APARTMENT", bedrooms: 2 };

describe("percentile and rounding", () => {
  it("interpolates between ranks (PERCENTILE.INC)", () => {
    const v = [10, 20, 30, 40];
    expect(percentile(v, 0.25)).toBeCloseTo(17.5);
    expect(percentile(v, 0.5)).toBeCloseTo(25);
    expect(percentile(v, 0.75)).toBeCloseTo(32.5);
    expect(percentile([10, 20, 30, 40, 50], 0.5)).toBe(30);
    expect(percentile([7], 0.25)).toBe(7);
    expect(Number.isNaN(percentile([], 0.5))).toBe(true);
  });

  it("rounds to whole units under 100, then 5, 10, 100, 1,000", () => {
    expect(roundGuide(55.4)).toBe(55);
    expect(roundGuide(123)).toBe(125);
    expect(roundGuide(1234)).toBe(1230);
    expect(roundGuide(68_450)).toBe(68_500);
    expect(roundGuide(165_432)).toBe(165_000);
    expect(roundGuide(2_345_678)).toBe(2_350_000);
  });

  it("rounds the lowest price down and the highest up", () => {
    expect(roundGuide(57.2, "down")).toBe(57);
    expect(roundGuide(57.2, "up")).toBe(58);
    expect(roundGuide(1234, "down")).toBe(1230);
    expect(roundGuide(1234, "up")).toBe(1240);
    expect(roundGuide(60, "down")).toBe(60);
    expect(roundGuide(60, "up")).toBe(60);
  });
});

describe("buckets", () => {
  it("groups bedrooms, guests, bathrooms and sizes into fixed buckets", () => {
    expect(bedroomsKey(0)).toBe("0");
    expect(bedroomsKey(3)).toBe("3");
    expect(bedroomsKey(7)).toBe("5+");
    expect(bedroomsKey(null)).toBeNull();
    expect(guestsKey(0)).toBeNull();
    expect(guestsKey(2)).toBe("2");
    expect(guestsKey(9)).toBe("5+");
    expect(bathroomsKey(1.5)).toBe("1");
    expect(bathroomsKey(0)).toBe("0");
    expect(bathroomsKey(4)).toBe("3+");
    expect(sizeBand(29.9)).toBe("0-30");
    expect(sizeBand(45)).toBe("45-60");
    expect(sizeBand(78)).toBe("60-80");
    expect(sizeBand(500)).toBe("230+");
    expect(sizeBand(0)).toBeNull();
    expect(sizeBandBounds("45-60")).toEqual({ min: 45, max: 60 });
    expect(sizeBandBounds("230+")).toEqual({ min: 230, max: null });
    expect(sizeBandBounds("nope")).toBeNull();
  });

  it("counts what a hotel room's beds sleep, else its max guests", () => {
    expect(roomSleeps({ bedsDouble: 1, bedsSofa: 1 })).toBe(4);
    expect(roomSleeps({ bedsSingle: 2 })).toBe(2);
    expect(roomSleeps({ maxGuests: 3 })).toBe(3);
    expect(roomSleeps({})).toBeNull();
  });

  it("reads scope.matched entries", () => {
    expect(parseMatched(["deal:SALE", "size:45-60", "broken"])).toEqual([
      { key: "deal", value: "SALE" },
      { key: "size", value: "45-60" },
    ]);
  });

  it("compares the period that fits the deal type", () => {
    expect(guidePeriodFor("SHORT_STAY")).toBe("NIGHT");
    expect(guidePeriodFor("HOTEL_ROOM")).toBe("NIGHT");
    expect(guidePeriodFor("MONTHLY_RENT")).toBe("MONTH");
    expect(guidePeriodFor("SALE")).toBe("TOTAL");
  });
});

describe("the privacy rule: at least 5 places of at least 3 owners", () => {
  it("needs both numbers", () => {
    expect(GUIDE_RULES).toMatchObject({ minPlaces: 5, minOwners: 3, minPlacesForMinMax: 10 });
    expect(isSafeGroup([place(1), place(2), place(3), place(4), place(5)])).toBe(true);
    expect(isSafeGroup([place(1), place(2), place(3), place(4)])).toBe(false);
    const twoOwners = [1, 2, 3, 4, 5].map((p, i) => place(p, { ownerId: i % 2 ? "a" : "b" }));
    expect(isSafeGroup(twoOwners)).toBe(false);
  });

  it("counts places, not hotel room types", () => {
    // 8 room types in 4 hotels of 4 owners: only 4 places.
    const rooms = [1, 2, 3, 4].flatMap((h) => [place(50, { listingId: `h${h}`, ownerId: `o-h${h}` }), place(60, { listingId: `h${h}`, ownerId: `o-h${h}` })]);
    expect(isSafeGroup(rooms)).toBe(false);
  });

  it("lets a narrower group through only when what it leaves out is nothing or a safe group", () => {
    const parent = Array.from({ length: 7 }, (_, i) => place(50 + i));
    expect(complementOk(parent, parent)).toBe(true);
    expect(complementOk(parent, parent.slice(0, 6))).toBe(false); // leaves 1 place out
    const big = Array.from({ length: 12 }, (_, i) => place(50 + i));
    expect(complementOk(big, big.slice(0, 6))).toBe(true); // leaves 6 places of 6 owners
  });

  it("gives stats only for a safe group, and the lowest/highest only from 10 places", () => {
    expect(statsOf([40, 50, 60, 70].map((v) => ({ ...place(v), value: v })))).toBeUndefined();
    const five = statsOf([40, 50, 60, 70, 80].map((v) => ({ ...place(v), value: v })));
    expect(five).toEqual({ count: 5, owners: 5, median: 60, p25: 50, p75: 70 });
    const ten = statsOf([31, 40, 45, 50, 55, 60, 65, 70, 80, 119].map((v) => ({ ...place(v), value: v })));
    expect(ten).toMatchObject({ count: 10, min: 31, max: 120 });
  });
});

describe("computeGuide", () => {
  it("says not enough with fewer than 5 similar places", () => {
    const g = computeGuide([place(50), place(60), place(70), place(80)], Q, CTX);
    expect(g.status).toBe("not_enough");
    expect(g.price).toBeUndefined();
    expect(g.scope).toEqual({ level: "city_all_sizes", cityId: "batumi", matched: ["deal:SHORT_STAY", "type:APARTMENT"] });
    expect(pricePosition(g, 55, "GEL")).toBeNull();
  });

  it("says not enough with 5 places of only 2 owners", () => {
    const rows = [50, 60, 70, 80, 90].map((p, i) => place(p, { ownerId: i < 3 ? "a" : "b" }));
    expect(computeGuide(rows, Q, CTX).status).toBe("not_enough");
  });

  it("compares the city by bedrooms when there is no neighborhood", () => {
    const rows = [40, 50, 60, 70, 80].map((p) => place(p));
    const g = computeGuide(rows, Q, CTX);
    expect(g.status).toBe("ok");
    expect(g.unit).toBe("night");
    expect(g.currency).toBe("GEL");
    expect(g.scope.level).toBe("city");
    expect(g.scope.matched.slice(0, 3)).toEqual(["deal:SHORT_STAY", "type:APARTMENT", "bedrooms:2"]);
    expect(g.price).toMatchObject({ count: 5, owners: 5, median: 60, p25: 50, p75: 70 });
    expect(g.price?.min).toBeUndefined();
  });

  it("uses the neighborhood when it has enough places and the rest of the city is a safe group too", () => {
    const vake = [100, 110, 120, 130, 140].map((p) => place(p, { neighborhoodId: "vake" }));
    const rest = [40, 50, 60, 70, 80].map((p) => place(p, { neighborhoodId: "isani" }));
    const g = computeGuide([...vake, ...rest], { ...Q, neighborhoodId: "vake" }, CTX);
    expect(g.status).toBe("ok");
    expect(g.scope).toMatchObject({ level: "neighborhood", neighborhoodId: "vake" });
    expect(g.price?.median).toBe(120);
  });

  it("does not use the neighborhood when only one or two places of the city are outside it (they could be isolated)", () => {
    const vake = [100, 110, 120, 130, 140].map((p) => place(p, { neighborhoodId: "vake" }));
    const outside = [place(400, { neighborhoodId: "isani" })];
    const g = computeGuide([...vake, ...outside], { ...Q, neighborhoodId: "vake" }, CTX);
    expect(g.status).toBe("widened");
    expect(g.scope.level).toBe("city");
    expect(g.scope.neighborhoodId).toBeUndefined();
    expect(g.price?.count).toBe(6);
  });

  it("widens to all sizes when the bedrooms group is too small, and says so", () => {
    const rows = [place(50, { bedrooms: 1 }), place(60, { bedrooms: 1 }), place(70, { bedrooms: 3 }), place(80), place(90), place(100)];
    const g = computeGuide(rows, Q, CTX);
    expect(g.status).toBe("widened");
    expect(g.scope.level).toBe("city_all_sizes");
    expect(g.scope.matched).not.toContain("bedrooms:2");
    expect(g.price?.count).toBe(6);
  });

  it("widens to all sizes when one listing of another size would be the only difference", () => {
    const twoBedrooms = [50, 60, 70, 80, 90, 100].map((p) => place(p));
    const g = computeGuide([...twoBedrooms, place(300, { bedrooms: 4 })], Q, CTX);
    expect(g.scope.level).toBe("city_all_sizes");
    expect(g.price?.count).toBe(7);
  });

  it("adds bathrooms, kitchen, sea view, building and size only while the data stays enough and safe", () => {
    const sea = Array.from({ length: 6 }, (_, i) => place(100 + i * 10, { seaView: true, sizeSqm: 50 }));
    const noSea = Array.from({ length: 6 }, (_, i) => place(50 + i * 5, { seaView: false, sizeSqm: 50 }));
    const g = computeGuide([...sea, ...noSea], { ...Q, bathrooms: 1, hasKitchen: true, seaView: true, newBuilding: true, sizeSqm: 55 }, CTX);
    expect(g.status).toBe("ok");
    expect(g.scope.matched).toEqual([
      "deal:SHORT_STAY",
      "type:APARTMENT",
      "bedrooms:2",
      "bathrooms:1",
      "kitchen:yes",
      "sea:yes",
      "building:new",
      "size:45-60",
    ]);
    expect(g.price?.count).toBe(6);
    expect(g.price?.median).toBe(125);
  });

  it("skips a criterion that would leave too few places, or leave out only one or two", () => {
    const rows = Array.from({ length: 7 }, (_, i) => place(60 + i, { seaView: i === 0 }));
    const withSea = computeGuide(rows, { ...Q, seaView: false }, CTX);
    // 6 without a sea view would be a safe group, but the one left out would be isolated.
    expect(withSea.scope.matched).not.toContain("sea:no");
    expect(withSea.price?.count).toBe(7);
    // Asking about the sea or not gives the very same numbers: nothing to subtract.
    expect(computeGuide(rows, Q, CTX).price).toEqual(withSea.price);
    expect(computeGuide(rows, { ...Q, seaView: true }, CTX).price).toEqual(withSea.price);
  });

  it("shows the lowest and highest prices from 10 places", () => {
    const rows = [30, 40, 45, 50, 55, 60, 65, 70, 80, 150].map((p) => place(p));
    const g = computeGuide(rows, Q, CTX);
    expect(g.price).toMatchObject({ count: 10, min: 30, max: 150 });
  });

  it("gives the weekend price only from places that set one, and only for a safe group", () => {
    const withWeekend = [60, 70, 80, 90, 100].map((p) => place(p, { weekendPrice: p + 20 }));
    const g = computeGuide([...withWeekend, place(50), place(55)], Q, CTX);
    expect(g.weekend).toMatchObject({ count: 5, median: 100 });
    const few = computeGuide([...withWeekend.slice(0, 4), place(50), place(55), place(58)], Q, CTX);
    expect(few.price).toBeDefined();
    expect(few.weekend).toBeUndefined();
  });

  it("gives sales the full price and the price per m²", () => {
    const rows = [100_000, 120_000, 140_000, 160_000, 180_000].map((p) => place(p, { sizeSqm: 100 }));
    const g = computeGuide(rows, { dealType: "SALE", propertyType: "APARTMENT", bedrooms: 2 }, CTX);
    expect(g.unit).toBe("total");
    expect(g.price?.median).toBe(140_000);
    expect(g.perSqm).toMatchObject({ count: 5, median: 1400, p25: 1200, p75: 1600 });
    expect(g.weekend).toBeUndefined();
  });

  it("monthly rentals are per month", () => {
    const rows = [500, 600, 700, 800, 900].map((p) => place(p));
    expect(computeGuide(rows, { dealType: "MONTHLY_RENT", propertyType: "APARTMENT", bedrooms: 2 }, CTX).unit).toBe("month");
  });

  it("compares hotel rooms by how many guests they sleep, counting hotels as places", () => {
    const hotelRoom = (listing: string, price: number, guests: number) =>
      place(price, { listingId: listing, ownerId: `o-${listing}`, guests, bedrooms: null, bathrooms: null });
    const rows = [
      ...["a", "b", "c", "d", "e"].map((h, i) => hotelRoom(h, 100 + i * 10, 2)),
      ...["a", "b", "c", "d", "e"].map((h, i) => hotelRoom(h, 200 + i * 10, 4)),
    ];
    const g = computeGuide(rows, { dealType: "HOTEL_ROOM", propertyType: "HOTEL", guests: 2 }, CTX);
    expect(g.scope.matched).toContain("guests:2");
    expect(g.price).toMatchObject({ count: 5, median: 120 });
    // Hotel rooms are not compared by bathrooms or kitchen.
    const k = computeGuide(rows, { dealType: "HOTEL_ROOM", propertyType: "HOTEL", guests: 2, bathrooms: 1, hasKitchen: true }, CTX);
    expect(k.scope.matched.some((m) => m.startsWith("bathrooms") || m.startsWith("kitchen"))).toBe(false);
  });

  it("marks converted numbers", () => {
    const rows = [40, 50, 60, 70, 80].map((p, i) => place(p, { converted: i === 0 }));
    expect(computeGuide(rows, Q, CTX).converted).toBe(true);
    expect(computeGuide(rows.map((r) => ({ ...r, converted: false })), Q, CTX).converted).toBe(false);
  });

  it("never returns a number that is exactly one place's unrounded price when prices are uneven", () => {
    const rows = [41.37, 52.81, 63.29, 74.66, 85.13].map((p) => place(p));
    const g = computeGuide(rows, Q, CTX);
    for (const value of [g.price!.median, g.price!.p25, g.price!.p75]) {
      expect(Number.isInteger(value)).toBe(true);
      expect(rows.map((r) => r.price)).not.toContain(value);
    }
  });
});

describe("pricePosition", () => {
  const guide: GuideResult = {
    status: "ok",
    unit: "night",
    currency: "GEL",
    scope: { level: "city", cityId: "batumi", matched: [] },
    price: { count: 6, owners: 4, median: 60, p25: 50, p75: 70 },
    references: [],
    rates: { USD: 1, GEL: 2.5, ILS: 3.5, EUR: 0.9, GBP: 0.8, AED: 3.67 },
  };

  it("places a price below, inside or above the usual range, and far outside it", () => {
    expect(pricePosition(guide, 24, "GEL")).toBe("far_below"); // more than 50% below 50
    expect(pricePosition(guide, 25, "GEL")).toBe("below");
    expect(pricePosition(guide, 49, "GEL")).toBe("below");
    expect(pricePosition(guide, 50, "GEL")).toBe("typical");
    expect(pricePosition(guide, 70, "GEL")).toBe("typical");
    expect(pricePosition(guide, 71, "GEL")).toBe("above");
    expect(pricePosition(guide, 140, "GEL")).toBe("above");
    expect(pricePosition(guide, 141, "GEL")).toBe("far_above"); // more than 100% above 70
  });

  it("converts a price in another currency with the guide's rates", () => {
    expect(pricePosition(guide, 24, "USD")).toBe("typical"); // $24 ≈ ₾60
    expect(pricePosition(guide, 100, "USD")).toBe("far_above"); // ≈ ₾250
  });

  it("has no answer without data or a price", () => {
    expect(pricePosition({ ...guide, status: "not_enough", price: undefined }, 60, "GEL")).toBeNull();
    expect(pricePosition({ ...guide, price: undefined }, 60, "GEL")).toBeNull();
    expect(pricePosition(guide, 0, "GEL")).toBeNull();
    expect(pricePosition(guide, Number.NaN, "GEL")).toBeNull();
    expect(positionIn(undefined, 50)).toBeNull();
  });
});

describe("reference prices (moved from the admin panel)", () => {
  const row = (over: Partial<ReferenceRow & { id: string }>): ReferenceRow & { id: string } => ({
    id: "r",
    cityId: "c1",
    neighborhoodId: null,
    dealType: "SHORT_STAY",
    propertyType: null,
    bedrooms: null,
    active: true,
    sourceMonth: new Date("2026-06-01T00:00:00Z"),
    ...over,
  });

  it("keeps the fitting active rows, most specific and newest first", () => {
    const rows = [
      row({ id: "city" }),
      row({ id: "type", propertyType: "APARTMENT" }),
      row({ id: "other-type", propertyType: "VILLA" }),
      row({ id: "off", active: false }),
      row({ id: "nb", neighborhoodId: "n1" }),
      row({ id: "other-city", cityId: "c2" }),
      row({ id: "city-new", sourceMonth: new Date("2026-09-01T00:00:00Z") }),
    ];
    const ids = matchReferencePrices(rows, { cityId: "c1", neighborhoodId: "n1", dealType: "SHORT_STAY", propertyType: "APARTMENT", bedrooms: 2 }).map((r) => r.id);
    expect(ids).toEqual(["nb", "type", "city-new", "city"]);
  });

  it("flags reports older than 24 months and reads their month", () => {
    const now = new Date("2026-11-04T10:00:00Z");
    expect(isStaleReference(new Date("2024-11-01T00:00:00Z"), now)).toBe(false);
    expect(isStaleReference(new Date("2024-10-01T00:00:00Z"), now)).toBe(true);
    expect(referenceMonth(new Date("2026-10-01T00:00:00Z"))).toBe("2026-10");
  });
});
