import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEAL_TYPES } from "@/lib/listing/fields";
import { DEAL_FILTER_TYPES, parseSearchParams } from "@/lib/listing/search-params";
import {
  CITY_PAGE_DEALS,
  CITY_PAGE_TYPES,
  CITY_PAGE_TYPE_KEYS,
  REAL_LISTINGS_TO_INDEX,
  cityListingsState,
  cityOverviewPath,
  cityPageBookingMode,
  cityPageDeal,
  cityPageDealTypes,
  cityPageFilters,
  cityPagePath,
  cityPageSearchPath,
  cityPageTypeForDeal,
  cityPageTypeForDealType,
  cityTypeCounts,
  indexableCityOverviews,
  RESERVED_CITY_SLUGS,
  isCityPageSlug,
  isCityPageType,
  isCitySlugShape,
  isIndexable,
  isOverviewIndexable,
  laterDate,
  type CityPageEntry,
} from "./core";

describe("city page types", () => {
  it("are the four URL slugs of the contract, in this order", () => {
    expect(CITY_PAGE_TYPES).toEqual(["short-stays", "monthly", "sale", "hotels"]);
  });

  it("map to the search's deal filters", () => {
    expect(cityPageDeal("short-stays")).toBe("short-stay");
    expect(cityPageDeal("monthly")).toBe("monthly");
    expect(cityPageDeal("sale")).toBe("buy");
    expect(cityPageDeal("hotels")).toBe("hotels");
    for (const type of CITY_PAGE_TYPES) expect(DEAL_FILTER_TYPES[CITY_PAGE_DEALS[type]]).toBeDefined();
  });

  it("map to exactly one listing deal type each, and every deal type has its page", () => {
    expect(cityPageDealTypes("short-stays")).toEqual(["SHORT_STAY"]);
    expect(cityPageDealTypes("monthly")).toEqual(["MONTHLY_RENT"]);
    expect(cityPageDealTypes("sale")).toEqual(["SALE"]);
    expect(cityPageDealTypes("hotels")).toEqual(["HOTEL_ROOM"]);
    const covered = CITY_PAGE_TYPES.flatMap((type) => cityPageDealTypes(type));
    expect([...covered].sort()).toEqual([...DEAL_TYPES].sort());
    for (const dealType of DEAL_TYPES) expect(cityPageDealTypes(cityPageTypeForDealType(dealType))).toContain(dealType);
  });

  it("go back from a deal filter (none for 'rent', which is two types)", () => {
    for (const type of CITY_PAGE_TYPES) expect(cityPageTypeForDeal(cityPageDeal(type))).toBe(type);
    expect(cityPageTypeForDeal("rent")).toBeNull();
    expect(cityPageTypeForDeal(null)).toBeNull();
    expect(cityPageTypeForDeal(undefined)).toBeNull();
  });

  it("have message keys without dashes", () => {
    for (const type of CITY_PAGE_TYPES) expect(CITY_PAGE_TYPE_KEYS[type]).toMatch(/^[a-zA-Z]+$/);
    expect(new Set(Object.values(CITY_PAGE_TYPE_KEYS)).size).toBe(CITY_PAGE_TYPES.length);
  });

  it("book instantly for short stays and hotels, by contacting the owner for monthly rentals and sales", () => {
    expect(cityPageBookingMode("short-stays")).toBe("instant");
    expect(cityPageBookingMode("hotels")).toBe("instant");
    expect(cityPageBookingMode("monthly")).toBe("contact");
    expect(cityPageBookingMode("sale")).toBe("contact");
  });
});

describe("unknown slugs", () => {
  it("only the four types are page types", () => {
    for (const type of CITY_PAGE_TYPES) expect(isCityPageType(type)).toBe(true);
    for (const value of ["short-stay", "rent", "buy", "Sale", "hotels/", "", " monthly", null, undefined, 3]) {
      expect(isCityPageType(value)).toBe(false);
    }
  });

  it("city slugs must look like slugs before any lookup", () => {
    for (const slug of ["batumi", "tbilisi", "old-tbilisi", "e2e-city-1a2b"]) expect(isCitySlugShape(slug)).toBe(true);
    for (const slug of ["Batumi", "batumi ", "bat umi", "-batumi", "batumi-", "bat--umi", "בטומי", "a%20b", "../etc", "", "a".repeat(61), null, 7]) {
      expect(isCitySlugShape(slug)).toBe(false);
    }
  });
});

describe("what a city page shows (brief 10: empty state and the post call)", () => {
  it("shows the empty state only with no places at all", () => {
    expect(cityListingsState(0, 0)).toBe("empty");
    expect(cityListingsState(Number.NaN, 0)).toBe("empty");
  });
  it("keeps the cards and adds the post call below 3 real places (demo only, or 1–2 real)", () => {
    expect(cityListingsState(5, 0)).toBe("invite");
    expect(cityListingsState(2, 2)).toBe("invite");
    expect(cityListingsState(7, 2)).toBe("invite");
  });
  it("shows only the cards from 3 real places (the page is indexed)", () => {
    expect(cityListingsState(3, 3)).toBe("listings");
    expect(cityListingsState(9, 4)).toBe("listings");
  });
});

describe("reserved city slugs (seo-6)", () => {
  /** The fixed segments directly under /<locale>/: folders and files, route groups looked into. */
  function fixedSegments(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.isDirectory()) {
        if (/^\(.+\)$/.test(entry.name)) return fixedSegments(path.join(dir, entry.name));
        return entry.name.startsWith("[") || entry.name.startsWith("_") ? [] : [entry.name];
      }
      // Metadata files are addresses too: opengraph-image.tsx → /he/opengraph-image.
      const route = /^(opengraph-image|twitter-image|icon|apple-icon|sitemap)\.[a-z]+$/.exec(entry.name);
      return route ? [route[1]] : [];
    });
  }

  it("list every fixed address under /<locale>/, so a city can never take one", () => {
    const segments = fixedSegments(path.resolve(__dirname, "../../app/[locale]"));
    expect(segments).toEqual(expect.arrayContaining(["admin", "hotels", "search", "post", "opengraph-image"]));
    for (const segment of segments) expect(RESERVED_CITY_SLUGS.has(segment), segment).toBe(true);
  });

  it("give no city pages to a reserved or overlong slug", () => {
    for (const slug of ["batumi", "old-tbilisi", "hotels-batumi", "a".repeat(60)]) expect(isCityPageSlug(slug), slug).toBe(true);
    for (const slug of ["hotels", "rent", "buy", "search", "post", "help", "admin", "opengraph-image", "a".repeat(61), "Batumi", null]) {
      expect(isCityPageSlug(slug), String(slug)).toBe(false);
    }
  });
});

describe("paths", () => {
  it("are built without the locale", () => {
    expect(cityPagePath("batumi", "short-stays")).toBe("/batumi/short-stays");
    expect(cityPagePath("tbilisi", "sale")).toBe("/tbilisi/sale");
    expect(cityOverviewPath("kutaisi")).toBe("/kutaisi");
  });

  it("the page's filters are its deal and city only, and its search link finds the same listings", () => {
    const filters = cityPageFilters("batumi", "sale");
    expect(filters.deal).toBe("buy");
    expect(filters.city).toBe("batumi");
    expect(filters.page).toBe(1);
    expect(filters.amenities).toEqual([]);
    const path = cityPageSearchPath("batumi", "sale");
    expect(path).toBe("/search?deal=buy&city=batumi");
    const parsed = parseSearchParams(new URLSearchParams(path.split("?")[1]));
    expect(parsed).toEqual(filters);
  });
});

describe("indexing", () => {
  it(`needs at least ${REAL_LISTINGS_TO_INDEX} real listings`, () => {
    expect(REAL_LISTINGS_TO_INDEX).toBe(3);
    expect(isIndexable(0)).toBe(false);
    expect(isIndexable(1)).toBe(false);
    expect(isIndexable(2)).toBe(false);
    expect(isIndexable(3)).toBe(true);
    expect(isIndexable(40)).toBe(true);
    expect(isIndexable(Number.NaN)).toBe(false);
    expect(isIndexable(-5)).toBe(false);
  });

  it("demo listings are shown while the demo data is on, but never count as real", () => {
    const rows = [
      { dealType: "SHORT_STAY" as const, isDemo: true, count: 5 },
      { dealType: "SHORT_STAY" as const, isDemo: false, count: 2 },
      { dealType: "SALE" as const, isDemo: false, count: 3 },
      { dealType: "HOTEL_ROOM" as const, isDemo: true, count: 1 },
    ];
    const shown = cityTypeCounts(rows, true);
    expect(shown["short-stays"]).toEqual({ count: 7, realCount: 2 });
    expect(shown.sale).toEqual({ count: 3, realCount: 3 });
    expect(shown.hotels).toEqual({ count: 1, realCount: 0 });
    expect(shown.monthly).toEqual({ count: 0, realCount: 0 });
    expect(isIndexable(shown["short-stays"].realCount)).toBe(false);
    expect(isIndexable(shown.sale.realCount)).toBe(true);

    const hidden = cityTypeCounts(rows, false);
    expect(hidden["short-stays"]).toEqual({ count: 2, realCount: 2 });
    expect(hidden.hotels).toEqual({ count: 0, realCount: 0 });
  });

  it("ignores broken counts", () => {
    const counts = cityTypeCounts([{ dealType: "MONTHLY_RENT", isDemo: false, count: Number.NaN }, { dealType: "MONTHLY_RENT", isDemo: false, count: -2 }], true);
    expect(counts.monthly).toEqual({ count: 0, realCount: 0 });
  });

  it("the overview is indexed when any of its types is", () => {
    const few = cityTypeCounts([{ dealType: "SHORT_STAY", isDemo: false, count: 2 }, { dealType: "SALE", isDemo: true, count: 9 }], true);
    expect(isOverviewIndexable(few)).toBe(false);
    const enough = cityTypeCounts([{ dealType: "HOTEL_ROOM", isDemo: false, count: 3 }], true);
    expect(isOverviewIndexable(enough)).toBe(true);
  });

  it("lists the overviews to index with their newest date", () => {
    const d1 = new Date("2026-10-01T00:00:00Z");
    const d2 = new Date("2026-11-01T00:00:00Z");
    const page = (citySlug: string, type: CityPageEntry["type"], realCount: number, updatedAt: Date | null): CityPageEntry => ({
      citySlug,
      type,
      realCount,
      indexable: isIndexable(realCount),
      updatedAt,
    });
    const overviews = indexableCityOverviews([
      page("batumi", "short-stays", 3, d1),
      page("batumi", "sale", 4, d2),
      page("batumi", "hotels", 1, new Date("2026-12-01T00:00:00Z")),
      page("tbilisi", "monthly", 2, d2),
      page("kutaisi", "hotels", 3, null),
    ]);
    expect(overviews).toEqual([
      { citySlug: "batumi", updatedAt: d2 },
      { citySlug: "kutaisi", updatedAt: null },
    ]);
  });

  it("laterDate picks the later of two optional dates", () => {
    const a = new Date("2026-01-01T00:00:00Z");
    const b = new Date("2026-02-01T00:00:00Z");
    expect(laterDate(a, b)).toBe(b);
    expect(laterDate(b, a)).toBe(b);
    expect(laterDate(null, a)).toBe(a);
    expect(laterDate(a, undefined)).toBe(a);
    expect(laterDate(null, null)).toBeNull();
  });
});
