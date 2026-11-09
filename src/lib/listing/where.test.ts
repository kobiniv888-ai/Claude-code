import { describe, expect, it } from "vitest";
import { FALLBACK_RATES } from "@/lib/currency/convert";
import { emptyFilters, parseSearchParams, type SearchFilters } from "./search-params";
import {
  buildListingOrderBy,
  buildListingWhere,
  effectiveSort,
  notPromotedWhere,
  promotedWhere,
  publicListingWhere,
  queryWords,
  type ListingWhereContext,
  sortBySynagogueStep,
} from "./where";

const now = new Date("2026-10-31T12:00:00.000Z");
const ctx: ListingWhereContext = { currency: "USD", rates: FALLBACK_RATES, demoVisible: false, now };

/** The AND parts after the public base. */
function parts(filters: Partial<SearchFilters>, extra: Partial<ListingWhereContext> = {}) {
  const where = buildListingWhere({ ...emptyFilters(), ...filters }, { ...ctx, ...extra });
  const and = where.AND as object[];
  expect(and[0]).toEqual(publicListingWhere({ demoVisible: extra.demoVisible ?? false, now }));
  return and.slice(1);
}

describe("publicListingWhere", () => {
  it("only shows LIVE, undeleted, unexpired listings of active owners", () => {
    expect(publicListingWhere({ demoVisible: false, now })).toEqual({
      status: "LIVE",
      deletedAt: null,
      isDemo: false,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      owner: { deletedAt: null, status: { in: ["ACTIVE", "WARNED"] } },
    });
    expect(publicListingWhere({ demoVisible: true, now })).not.toHaveProperty("isDemo");
  });
});

describe("buildListingWhere", () => {
  it("adds nothing for empty filters", () => {
    expect(parts({})).toEqual([]);
  });

  it("maps deal filters to deal types", () => {
    expect(parts({ deal: "rent" })).toEqual([{ dealType: { in: ["SHORT_STAY", "MONTHLY_RENT"] } }]);
    expect(parts({ deal: "hotels" })).toEqual([{ dealType: { in: ["HOTEL_ROOM"] } }]);
  });

  it("filters by place slugs and every word of the text query", () => {
    expect(parts({ city: "tbilisi", neighborhood: "vake", q: "Sunny  ВАКЕ" })).toEqual([
      { city: { slug: "tbilisi" } },
      { neighborhood: { slug: "vake", city: { slug: "tbilisi" } } },
      { searchText: { contains: "sunny" } },
      { searchText: { contains: "ваке" } },
    ]);
    expect(queryWords("ID 1234")).toEqual(["1234"]);
    expect(queryWords("טביליסי, טביליסי")).toEqual(["טביליסי"]);
  });

  it("excludes listings blocked on the stay dates and too-short stays", () => {
    const [availability, minStay] = parts({ checkIn: "2026-11-10", checkOut: "2026-11-13" });
    expect(availability).toEqual({
      availability: {
        none: { startDate: { lt: new Date("2026-11-13T00:00:00.000Z") }, endDate: { gt: new Date("2026-11-10T00:00:00.000Z") } },
      },
    });
    expect(minStay).toEqual({ OR: [{ minStayNights: null }, { minStayNights: { lte: 3 } }] });
  });

  it("hotels: only a whole-hotel closure hides them, and they need a free room on every night (search-1)", () => {
    const [availability] = parts({ checkIn: "2026-11-10", checkOut: "2026-11-13" }, { freeHotelIds: ["h1", "h2"] });
    const overlap = { startDate: { lt: new Date("2026-11-13T00:00:00.000Z") }, endDate: { gt: new Date("2026-11-10T00:00:00.000Z") } };
    expect(availability).toEqual({
      OR: [
        { dealType: { notIn: ["HOTEL_ROOM"] }, availability: { none: overlap } },
        { dealType: { in: ["HOTEL_ROOM"] }, availability: { none: { ...overlap, roomTypeId: null } }, id: { in: ["h1", "h2"] } },
        // A contact-only hotel (no bookable room type) is searched like a whole place.
        {
          dealType: { in: ["HOTEL_ROOM"] },
          roomTypes: { none: { active: true, pricePeriod: "NIGHT", price: { gt: 0 } } },
          availability: { none: overlap },
        },
      ],
    });
    // No hotel with a free room: hotels are left out, the other places are searched as before.
    const [none] = parts({ checkIn: "2026-11-10", checkOut: "2026-11-13" }, { freeHotelIds: [] });
    expect((none as { OR: { id?: unknown }[] }).OR[1].id).toEqual({ in: [] });
  });

  it("checks the move-in day alone for monthly rentals", () => {
    expect(parts({ deal: "monthly", checkIn: "2026-12-01" })[1]).toEqual({
      availability: {
        none: { startDate: { lt: new Date("2026-12-02T00:00:00.000Z") }, endDate: { gt: new Date("2026-12-01T00:00:00.000Z") } },
      },
    });
  });

  it("converts the price range from the display currency to USD", () => {
    expect(parts({ priceMin: 270, priceMax: 540 }, { currency: "GEL" })).toEqual([{ priceUsd: { gte: 100, lte: 200 } }]);
    expect(parts({ priceMax: 370 }, { currency: "ILS" })).toEqual([{ priceUsd: { lte: 100 } }]);
  });

  it("matches guests on the listing or any room type", () => {
    expect(parts({ guests: 4 })).toEqual([
      { OR: [{ maxGuests: { gte: 4 } }, { roomTypes: { some: { maxGuests: { gte: 4 } } } }] },
    ]);
  });

  it("splits amenity keys from the house-rule filters", () => {
    expect(parts({ amenities: ["wifi", "pool", "pets_allowed", "smoking_allowed"] })).toEqual([
      { amenities: { hasEvery: ["wifi", "pool"] } },
      { petsAllowed: true },
      { smokingAllowed: true },
    ]);
  });

  it("builds the Jewish-friendly filters", () => {
    expect(
      parts({
        kitchen: "kosher_or_kasherable",
        shabbatFriendly: true,
        jewish: ["mezuzot"],
        hotel: ["shabbat_meals"],
        synagogueMaxWalk: 10,
        bigFamily: true,
        sharedRoomFor: "FAMILIES",
      }),
    ).toEqual([
      { kitchenKosher: { in: ["KOSHER", "CAN_KASHER"] } },
      { isShabbatFriendly: true },
      { jewishFeatures: { hasEvery: ["mezuzot"] } },
      { hotelJewishFeatures: { hasEvery: ["shabbat_meals"] } },
      { synagogueWalkMin: { lte: 10 } },
      { maxGuests: { gte: 8 } },
      { sharedRoomFor: "FAMILIES" },
    ]);
    expect(parts({ kitchen: "kosher" })).toEqual([{ kitchenKosher: "KOSHER" }]);
  });

  it("builds trust, media and date filters", () => {
    expect(
      parts({ verifiedOnly: true, ownerType: "business", hasPhotos: true, hasVideo: true, postedWithin: "24h" }),
    ).toEqual([
      // "Verified only" is ignored while there are no document checks (src/config/verification.ts).
      { owner: { accountType: "BUSINESS" } },
      { photos: { some: {} } },
      { videoUrl: { not: null } },
      { NOT: { videoUrl: "" } },
      { publishedAt: { gte: new Date("2026-10-30T12:00:00.000Z") } },
    ]);
  });

  it("builds the Georgian market and size filters", () => {
    const filters = parseSearchParams({
      condition: "white_frame,green_frame",
      heating: "central",
      views: "sea",
      furnished: "1",
      elevator: "1",
      sizeMin: "50",
      floorMax: "5",
      buildingAge: "new",
      bedrooms: "2",
      rooms: "3",
      bathrooms: "1.5",
      propertyTypes: "apartment",
    });
    expect(parts(filters)).toEqual([
      { rooms: { gte: 3 } },
      { bedrooms: { gte: 2 } },
      { bathrooms: { gte: 1.5 } },
      { propertyType: { in: ["APARTMENT"] } },
      { condition: { in: ["WHITE_FRAME", "GREEN_FRAME"] } },
      { heating: { hasSome: ["CENTRAL"] } },
      { views: { hasSome: ["SEA"] } },
      { furnished: true },
      { elevator: true },
      { sizeSqm: { gte: 50 } },
      { floor: { lte: 5 } },
      { buildingAge: "NEW" },
    ]);
  });

  it("limits results to the map area", () => {
    expect(parts({ bounds: { north: 41.8, south: 41.6, east: 44.9, west: 44.7 } })).toEqual([
      { approxLat: { gte: 41.6, lte: 41.8 } },
      { approxLng: { gte: 44.7, lte: 44.9 } },
    ]);
    expect(parts({ bounds: { north: 10, south: 0, east: -170, west: 170 } })[1]).toEqual({
      OR: [{ approxLng: { gte: 170 } }, { approxLng: { lte: -170 } }],
    });
  });

  it("shows demo listings only while the setting is on", () => {
    const where = buildListingWhere(emptyFilters(), { ...ctx, demoVisible: true });
    expect((where.AND as object[])[0]).not.toHaveProperty("isDemo");
  });
});

describe("promoted", () => {
  it("covers paid featured and hand-picked listings, and the opposite without NULL traps", () => {
    expect(promotedWhere(["a"], now)).toEqual({ OR: [{ featuredUntil: { gt: now } }, { id: { in: ["a"] } }] });
    expect(promotedWhere([], now)).toEqual({ OR: [{ featuredUntil: { gt: now } }] });
    expect(notPromotedWhere(["a"], now)).toEqual({
      AND: [{ OR: [{ featuredUntil: null }, { featuredUntil: { lte: now } }] }, { id: { notIn: ["a"] } }],
    });
  });
});

describe("sorting", () => {
  it("falls back to recommended for sorts the deal does not offer", () => {
    expect(effectiveSort({ sort: "rating", deal: null })).toBe("recommended");
    expect(effectiveSort({ sort: "price_sqm", deal: "rent" })).toBe("recommended");
    expect(effectiveSort({ sort: "price_sqm", deal: "buy" })).toBe("price_sqm");
  });

  it("orders with nulls last and a stable tie-breaker", () => {
    expect(buildListingOrderBy("recommended")).toEqual([{ bumpedAt: { sort: "desc", nulls: "last" } }, { publicId: "desc" }]);
    expect(buildListingOrderBy("price_asc")[0]).toEqual({ priceUsd: { sort: "asc", nulls: "last" } });
    expect(buildListingOrderBy("price_desc")[0]).toEqual({ priceUsd: { sort: "desc", nulls: "last" } });
    expect(buildListingOrderBy("price_sqm")[0]).toEqual({ pricePerSqmUsd: { sort: "asc", nulls: "last" } });
    // The synagogue sort never orders by the exact minutes in the database (sortBySynagogueStep).
    expect(JSON.stringify(buildListingOrderBy("synagogue"))).not.toContain("synagogueWalkMin");
    expect(buildListingOrderBy("price_drop")[0]).toEqual({ priceDroppedAt: { sort: "desc", nulls: "last" } });
    expect(buildListingOrderBy("updated")[0]).toEqual({ contentUpdatedAt: "desc" });
    expect(buildListingOrderBy("newest")[0]).toEqual({ publishedAt: { sort: "desc", nulls: "last" } });
    for (const sort of ["newest", "synagogue", "price_drop"] as const) {
      expect(buildListingOrderBy(sort).at(-1)).toEqual({ publicId: "desc" });
    }
  });
});

describe("the nearest-synagogue sort leaks no more than the labels (6.d)", () => {
  const row = (publicId: number, synagogueWalkMin: number | null, bumpedDaysAgo: number | null) => ({
    publicId,
    synagogueWalkMin,
    bumpedAt: bumpedDaysAgo === null ? null : new Date(Date.UTC(2026, 10, 8) - bumpedDaysAgo * 86_400_000),
  });

  it("orders by the shown step, then by the walk-free order, listings without a walk last", () => {
    const sorted = sortBySynagogueStep([row(1, 9, 1), row(2, 6, 3), row(3, 4, 9), row(4, null, 0), row(5, 12, 0), row(6, 10, null)]);
    // Step 5: #3; step 10: #1 (bumped 1 day ago), #2 (3 days), #6 (never bumped); step 15: #5; none: #4.
    expect(sorted.map((r) => r.publicId)).toEqual([3, 1, 2, 6, 5, 4]);
  });

  it("never depends on the exact minutes inside a step", () => {
    const base = [row(11, 6, 2), row(12, 7, 5), row(13, 8, 1), row(14, 10, 4), row(15, 3, 0), row(16, 16, 0)];
    const expected = sortBySynagogueStep(base).map((r) => r.publicId);
    // Every other exact value with the same shown step gives the same order.
    for (let shift = 0; shift < 50; shift++) {
      const shuffled = base.map((r, i) => {
        const shown = Math.ceil(r.synagogueWalkMin! / 5) * 5;
        return { ...r, synagogueWalkMin: shown - ((i + shift) % 5) };
      });
      expect(sortBySynagogueStep([...shuffled].reverse()).map((r) => r.publicId)).toEqual(expected);
    }
  });

  it("breaks full ties by the public ID (stable pages)", () => {
    expect(sortBySynagogueStep([row(7, 8, null), row(9, 7, null), row(8, 9, null)]).map((r) => r.publicId)).toEqual([9, 8, 7]);
  });
});
