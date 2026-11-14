import { describe, expect, it } from "vitest";
import {
  GUIDE_RULES,
  bathroomsKey,
  bedroomsKey,
  complementOk,
  computeGuide,
  differencesSafe,
  guestsKey,
  guideAsked,
  guidePeriodFor,
  guideWidening,
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
  type Criterion,
  type GuideCandidate,
  type GuideQuery,
  type GuideResult,
} from "./guide";
import { guidePageHref, parseGuidePageQuery } from "./page-params";
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

describe("the privacy rule against comparing two answers", () => {
  const sea: Criterion = { key: "sea", value: "yes", test: (c) => c.seaView };
  const fresh: Criterion = { key: "building", value: "new", test: (c) => c.newBuilding === true };

  it("accepts a group when every wider group adds nothing or a safe group", () => {
    const rows = [...Array.from({ length: 5 }, () => place(80, { seaView: true })), ...Array.from({ length: 5 }, () => place(50))];
    expect(differencesSafe(rows, [])).toBe(true);
    expect(differencesSafe(rows, [sea])).toBe(true);
  });

  it("refuses a group that a wider group differs from by one or two places, at any width", () => {
    // Sea view and new: 5. Sea view: 10. New: 6 (one without a sea view): new minus (sea and new) = 1 place.
    const rows = [
      ...Array.from({ length: 5 }, () => place(80, { seaView: true, newBuilding: true })),
      ...Array.from({ length: 5 }, () => place(70, { seaView: true, newBuilding: false })),
      place(55, { seaView: false, newBuilding: true }),
      ...Array.from({ length: 9 }, () => place(50, { seaView: false, newBuilding: false })),
    ];
    expect(differencesSafe(rows, [sea])).toBe(true);
    expect(differencesSafe(rows, [fresh])).toBe(true);
    expect(differencesSafe(rows, [sea, fresh])).toBe(false);
  });

  it("does not use a neighborhood whose other sizes are a single place (its all-sizes answer would differ by one)", () => {
    const vakeTwo = [100, 110, 120, 130, 140].map((p) => place(p, { neighborhoodId: "vake" }));
    const vakeThree = place(400, { neighborhoodId: "vake", bedrooms: 3 });
    const isani = [
      ...[40, 50, 60, 70, 80].map((p) => place(p, { neighborhoodId: "isani" })),
      ...[90, 95, 100, 105, 110].map((p) => place(p, { neighborhoodId: "isani", bedrooms: 3 })),
    ];
    const all = [...vakeTwo, vakeThree, ...isani];
    const twoBedrooms = computeGuide(all, { ...Q, neighborhoodId: "vake" }, CTX);
    expect(twoBedrooms.scope.level).toBe("city");
    expect(twoBedrooms.price?.count).toBe(10);
    // A draft with no bedrooms stops at the first missing condition (the size): the whole city.
    const anySize = computeGuide(all, { ...Q, bedrooms: null, neighborhoodId: "vake" }, CTX);
    expect(anySize.scope.level).toBe("city_all_sizes");
    expect(anySize.status).toBe("widened");
    expect(anySize.price?.count).toBe(16);
  });

  it("stops at a later criterion when its wider group would isolate a place, and never skips to the next", () => {
    const v = { neighborhoodId: "vake" };
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => place(80 + i, { ...v, seaView: true, newBuilding: true })),
      ...Array.from({ length: 5 }, (_, i) => place(70 + i, { ...v, seaView: true, newBuilding: false })),
      place(55, { ...v, seaView: false, newBuilding: true }),
      ...Array.from({ length: 9 }, (_, i) => place(50 + i, { ...v, seaView: false, newBuilding: false })),
    ];
    const q = { ...Q, ...v, bathrooms: 1, hasKitchen: true };
    const both = computeGuide(rows, { ...q, seaView: true, newBuilding: true, sizeSqm: 70 }, CTX);
    expect(both.scope.matched).toContain("sea:yes");
    expect(both.scope.matched).not.toContain("building:new");
    // The size band comes after the building in the chain: not tried once the building failed.
    expect(both.scope.matched).not.toContain("size:60-80");
    expect(both.price?.count).toBe(10);
    // Without a sea view given, the chain stops there: the building is never compared on its own.
    const newOnly = computeGuide(rows, { ...q, newBuilding: true }, CTX);
    expect(newOnly.scope.matched).not.toContain("building:new");
    expect(newOnly.price?.count).toBe(20);
  });

  it("can't be made to differ by one place with two queries whose criteria aren't nested (prefix rule)", () => {
    // Every 1-bathroom place has a kitchen; F (kitchen, 2 bathrooms) is the only other kitchen.
    const mk = (id: string, owner: string, bathrooms: number, kitchen: boolean, price: number) =>
      place(price, { listingId: id, ownerId: owner, neighborhoodId: "n1", bathrooms, hasKitchen: kitchen, newBuilding: null, sizeSqm: null });
    const rows = [
      mk("A", "o1", 1, true, 50),
      mk("B", "o2", 1, true, 52),
      mk("C", "o3", 1, true, 54),
      mk("D", "o1", 1, true, 56),
      mk("E", "o2", 1, true, 58),
      mk("F", "o9", 2, true, 200),
      ...["G", "H", "I", "J", "K"].map((id, i) => mk(id, ["o4", "o5", "o6", "o4", "o5"][i], 2, false, 60 + i)),
    ];
    const q = { ...Q, neighborhoodId: "n1" };
    // Draft 1: 1 bathroom, kitchen not ticked. Draft 2: 3+ bathrooms (no data), kitchen ticked.
    const q1 = computeGuide(rows, { ...q, bathrooms: 1, hasKitchen: null }, CTX);
    const q2 = computeGuide(rows, { ...q, bathrooms: 3, hasKitchen: true }, CTX);
    expect(q1.scope.matched).toContain("bathrooms:1");
    expect(q1.price?.count).toBe(5);
    // Draft 2 stops at the bathrooms it can't compare: it never goes on to the kitchen.
    expect(q2.scope.matched).not.toContain("kitchen:yes");
    expect(q2.price?.count).toBe(11);
    expect(Math.abs((q2.price?.count ?? 0) - (q1.price?.count ?? 0))).toBeGreaterThanOrEqual(GUIDE_RULES.minPlaces);
  });

  it("counts a hotel already in the group once: its other room types are not places a wider group adds", () => {
    const room = (id: string, owner: string, guests: number, price: number) =>
      place(price, { listingId: id, ownerId: owner, guests, bedrooms: null, bathrooms: null, hasKitchen: false, newBuilding: null, sizeSqm: null });
    const owners = ["o1", "o2", "o3", "o1", "o2"];
    const hotels = [100, 110, 120, 130, 140].flatMap((p, i) => [room(`H${i + 1}`, owners[i], 2, p), room(`H${i + 1}`, owners[i], 3, p)]);
    const all = [...hotels, room("H6", "o9", 3, 500)];
    const two: Criterion = { key: "guests", value: "2", test: (c) => guestsKey(c.guests) === "2" };
    // The all-sizes group adds only H6 to the 2-guest group: one place of one owner.
    expect(differencesSafe(all, [two])).toBe(false);
    const hotelQ = { dealType: "HOTEL_ROOM", propertyType: "HOTEL" } as const;
    const g = computeGuide(all, { ...hotelQ, guests: 2 }, CTX);
    const any = computeGuide(all, { ...hotelQ, guests: null }, CTX);
    expect(g.scope.level).toBe("city_all_sizes");
    expect(g.price).toEqual(any.price);
    // Five more hotels of three owners with only a 3-guest room: the difference is a safe group.
    const more = ["x1", "x2", "x3", "x4", "x5"].map((id, i) => room(id, `ox${i % 3}`, 3, 150 + i * 10));
    const wide = computeGuide([...all, ...more], { ...hotelQ, guests: 2 }, CTX);
    expect(wide.scope.level).toBe("city");
    expect(wide.price?.count).toBe(5);
  });

  it("applies the rule to the places with a weekend price too", () => {
    // Bedrooms 2: 6 places, 5 with a weekend price. All sizes adds 5 places, only 1 with a weekend price.
    const two = [60, 70, 80, 90, 100].map((p) => place(p, { weekendPrice: p + 20 }));
    const others = [place(60, { bedrooms: 3, weekendPrice: 99 }), ...[50, 55, 65, 75].map((p) => place(p, { bedrooms: 3 }))];
    const g = computeGuide([...two, place(65), ...others], Q, CTX);
    expect(g.scope.level).toBe("city");
    expect(g.price?.count).toBe(6);
    expect(g.weekend).toBeUndefined();
  });

  it("gives every place one value, so one hotel's many room types can't set the middle price", () => {
    const big = Array.from({ length: 10 }, () => place(500, { listingId: "big", ownerId: "o-big", guests: 2 }));
    const small = [100, 110, 120, 130].map((p, i) => place(p, { listingId: `s${i}`, ownerId: `o-s${i}`, guests: 2 }));
    const stats = statsOf([...big, ...small].map((r) => ({ ...r, value: r.price })));
    expect(stats).toMatchObject({ count: 5, owners: 5, median: 120, p25: 110, p75: 130 });
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
    const sea = Array.from({ length: 6 }, (_, i) => place(100 + i * 10, { neighborhoodId: "old-batumi", seaView: true, sizeSqm: 50 }));
    const noSea = Array.from({ length: 6 }, (_, i) => place(50 + i * 5, { neighborhoodId: "old-batumi", seaView: false, sizeSqm: 50 }));
    const q = { ...Q, neighborhoodId: "old-batumi", bathrooms: 1, hasKitchen: true, seaView: true, newBuilding: true, sizeSqm: 55 };
    const g = computeGuide([...sea, ...noSea], q, CTX);
    expect(g.status).toBe("ok");
    expect(g.scope.level).toBe("neighborhood");
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

describe("what the guide widened past", () => {
  const ok = (level: GuideResult["scope"]["level"], status: GuideResult["status"] = "widened"): GuideResult => ({
    status,
    unit: "night",
    currency: "GEL",
    scope: { level, cityId: "c", matched: [] },
    references: [],
  });

  it("names the neighborhood and the size it dropped", () => {
    expect(guideWidening(ok("neighborhood", "ok"), { neighborhood: true, size: true })).toEqual([]);
    expect(guideWidening(ok("city"), { neighborhood: true, size: true })).toEqual(["neighborhood"]);
    expect(guideWidening(ok("city_all_sizes"), { neighborhood: true, size: true })).toEqual(["neighborhood", "size"]);
    expect(guideWidening(ok("city_all_sizes"), { neighborhood: false, size: true })).toEqual(["size"]);
    expect(guideWidening(ok("city_all_sizes", "ok"), { neighborhood: false, size: false })).toEqual([]);
    expect(guideWidening(ok("city_all_sizes", "not_enough"), { neighborhood: true, size: true })).toEqual([]);
  });

  it("reads what a query asks for (hotels by guests)", () => {
    expect(guideAsked({ dealType: "SHORT_STAY", neighborhoodId: "n", bedrooms: 2 })).toEqual({ neighborhood: true, size: true });
    expect(guideAsked({ dealType: "SALE", bedrooms: null })).toEqual({ neighborhood: false, size: false });
    expect(guideAsked({ dealType: "HOTEL_ROOM", bedrooms: 3, guests: null })).toEqual({ neighborhood: false, size: false });
    expect(guideAsked({ dealType: "HOTEL_ROOM", guests: 2 })).toEqual({ neighborhood: false, size: true });
  });
});

describe("the price guide page's address", () => {
  it("reads one of the host's listings first", () => {
    expect(parseGuidePageQuery({ listing: "clx123abc", city: "batumi" })).toEqual({ mode: "listing", listingId: "clx123abc" });
    expect(parseGuidePageQuery({})).toEqual({ mode: "listing", listingId: null });
    expect(parseGuidePageQuery({ listing: "../etc" })).toEqual({ mode: "listing", listingId: null });
  });

  it("reads a custom question and falls back on anything unknown", () => {
    expect(parseGuidePageQuery({ city: "Batumi", deal: "SALE", type: "VILLA", size: "3" })).toEqual({
      mode: "custom",
      citySlug: "batumi",
      dealType: "SALE",
      propertyType: "VILLA",
      size: 3,
    });
    // A hotel type for a short stay is not allowed: the deal type's first type instead; "9" is no size.
    expect(parseGuidePageQuery({ mode: "custom", deal: "SHORT_STAY", type: "HOTEL", size: "9" })).toEqual({
      mode: "custom",
      citySlug: null,
      dealType: "SHORT_STAY",
      propertyType: "APARTMENT",
      size: null,
    });
    expect(parseGuidePageQuery({ city: "a b", deal: "nope", size: "any" })).toMatchObject({ citySlug: null, dealType: "SHORT_STAY", size: null });
    // Hotels: guests from 1, no "0".
    expect(parseGuidePageQuery({ city: "batumi", deal: "HOTEL_ROOM", type: "GUESTHOUSE", size: "0" })).toMatchObject({ propertyType: "GUESTHOUSE", size: null });
    expect(parseGuidePageQuery({ city: "batumi", deal: "HOTEL_ROOM", size: "2" })).toMatchObject({ propertyType: "HOTEL", size: 2 });
  });

  it("builds the same address back", () => {
    const q = parseGuidePageQuery({ city: "batumi", deal: "MONTHLY_RENT", type: "APARTMENT", size: "2" });
    expect(guidePageHref(q)).toEqual({
      pathname: "/account/listings/price-guide",
      query: { mode: "custom", deal: "MONTHLY_RENT", type: "APARTMENT", size: "2", city: "batumi" },
    });
    expect(parseGuidePageQuery(guidePageHref(q).query)).toEqual(q);
    expect(guidePageHref({ mode: "listing", listingId: "x1" }).query).toEqual({ listing: "x1" });
  });
});
