import { describe, expect, it } from "vitest";
import { CITY_PAGE_TYPES, isIndexable, type CityPageEntry, type CityPageType } from "@/lib/city-pages/core";
import { parseSearchParams } from "@/lib/listing/search-params";
import { canonicalSearchPath, indexableSearchPaths, isSearchLanding, landingRealCount, searchIndexing, searchNoIndex } from "./seo";

/** listCityPages() rows: `real` = real listings per "city:type". */
function pages(real: Record<string, number>, cities = ["batumi", "tbilisi"]): CityPageEntry[] {
  return cities.flatMap((citySlug) =>
    CITY_PAGE_TYPES.map((type: CityPageType) => {
      const realCount = real[`${citySlug}:${type}`] ?? 0;
      return { citySlug, type, realCount, indexable: isIndexable(realCount), updatedAt: null };
    }),
  );
}

const f = (query: Record<string, string>) => parseSearchParams(query);

describe("search landings", () => {
  it("are a deal and/or a city and nothing else", () => {
    expect(isSearchLanding(f({}))).toBe(true);
    expect(isSearchLanding(f({ deal: "hotels" }))).toBe(true);
    expect(isSearchLanding(f({ city: "batumi" }))).toBe(true);
    expect(isSearchLanding(f({ deal: "monthly", city: "tbilisi" }))).toBe(true);
    const variants: Record<string, string>[] = [
      { deal: "monthly", city: "tbilisi", page: "2" },
      { deal: "monthly", sort: "newest" },
      { deal: "monthly", view: "map" },
      { deal: "buy", bedrooms: "2" },
      { city: "batumi", neighborhood: "old-batumi" },
      { deal: "short-stay", checkIn: "2027-03-01", checkOut: "2027-03-04" },
      { q: "sea view" },
      { bounds: "41.8,41.6,44.9,44.7" },
      { kosherShabbat: "1" },
    ];
    for (const query of variants) {
      expect(isSearchLanding(f(query)), JSON.stringify(query)).toBe(false);
      expect(searchNoIndex(f(query)), JSON.stringify(query)).toBe(true);
    }
  });

  it("canonicalize every variant to the landing without its other parameters", () => {
    expect(canonicalSearchPath(f({ deal: "buy", city: "batumi", bedrooms: "2", sort: "newest", page: "4", view: "map" }))).toBe("/search?deal=buy&city=batumi");
    expect(canonicalSearchPath(f({ city: "batumi", neighborhood: "old-batumi" }))).toBe("/search?city=batumi");
    expect(canonicalSearchPath(f({ q: "sea" }))).toBe("/search");
  });
});

describe("searchIndexing (3 real listings, like the city pages)", () => {
  it("indexes /search and a deal only with at least 3 real listings", () => {
    expect(searchIndexing(f({}), pages({ "batumi:short-stays": 2 }))).toEqual({ noIndex: true, canonicalPath: "/search" });
    expect(searchIndexing(f({}), pages({ "batumi:short-stays": 2, "tbilisi:sale": 1 }))).toEqual({ noIndex: false, canonicalPath: "/search" });
    // Two cities add up for a deal without a city.
    expect(searchIndexing(f({ deal: "hotels" }), pages({ "batumi:hotels": 2, "tbilisi:hotels": 1 })).noIndex).toBe(false);
    expect(searchIndexing(f({ deal: "hotels" }), pages({ "batumi:hotels": 2, "tbilisi:short-stays": 5 })).noIndex).toBe(true);
    // "rent" = short stays + monthly.
    expect(searchIndexing(f({ deal: "rent" }), pages({ "batumi:short-stays": 2, "batumi:monthly": 1 })).noIndex).toBe(false);
    expect(searchIndexing(f({ deal: "rent" }), pages({ "batumi:short-stays": 2, "batumi:sale": 9 })).noIndex).toBe(true);
  });

  it("points a city + deal landing to its city page while that page is indexed, else noindex", () => {
    const three = pages({ "batumi:short-stays": 3 });
    expect(searchIndexing(f({ deal: "short-stay", city: "batumi" }), three)).toEqual({ noIndex: false, canonicalPath: "/batumi/short-stays" });
    expect(searchIndexing(f({ deal: "buy", city: "batumi" }), pages({ "batumi:sale": 3 }))).toEqual({ noIndex: false, canonicalPath: "/batumi/sale" });
    expect(searchIndexing(f({ deal: "short-stay", city: "batumi" }), pages({ "batumi:short-stays": 2 }))).toEqual({
      noIndex: true,
      canonicalPath: "/search?deal=short-stay&city=batumi",
    });
    // Other cities' listings never count.
    expect(searchIndexing(f({ deal: "short-stay", city: "tbilisi" }), three).noIndex).toBe(true);
  });

  it("points a city landing to the city overview while any of its pages is indexed", () => {
    expect(searchIndexing(f({ city: "batumi" }), pages({ "batumi:monthly": 3 }))).toEqual({ noIndex: false, canonicalPath: "/batumi" });
    // 2 + 2 real listings, but no single page is indexed: the overview isn't either.
    expect(searchIndexing(f({ city: "batumi" }), pages({ "batumi:monthly": 2, "batumi:sale": 2 })).noIndex).toBe(true);
  });

  it("keeps \"rent\" in a city as its own page (no city page has both deals)", () => {
    expect(searchIndexing(f({ deal: "rent", city: "batumi" }), pages({ "batumi:short-stays": 2, "batumi:monthly": 1 }))).toEqual({
      noIndex: false,
      canonicalPath: "/search?deal=rent&city=batumi",
    });
  });

  it("never indexes a filtered, sorted or paged variant, even of an indexed landing", () => {
    const many = pages({ "batumi:short-stays": 50 });
    const variants: Record<string, string>[] = [
      { deal: "short-stay", city: "batumi", page: "2" },
      { deal: "short-stay", city: "batumi", sort: "price_asc" },
      { deal: "short-stay", city: "batumi", guests: "4" },
      { deal: "short-stay", sort: "newest" },
    ];
    for (const query of variants) {
      const result = searchIndexing(f(query), many);
      expect(result.noIndex, JSON.stringify(query)).toBe(true);
      expect(result.canonicalPath.startsWith("/search"), JSON.stringify(query)).toBe(true);
    }
  });

  it("is noindex when the city pages could not be loaded, and for an unknown city", () => {
    expect(searchIndexing(f({}), []).noIndex).toBe(true);
    expect(searchIndexing(f({ deal: "monthly", city: "atlantis" }), pages({ "batumi:monthly": 9 })).noIndex).toBe(true);
  });

  it("counts real listings only from the matching city pages", () => {
    const rows = pages({ "batumi:short-stays": 2, "batumi:hotels": 4, "tbilisi:short-stays": 1 });
    expect(landingRealCount({ deal: null, city: null }, rows)).toBe(7);
    expect(landingRealCount({ deal: "short-stay", city: null }, rows)).toBe(3);
    expect(landingRealCount({ deal: null, city: "batumi" }, rows)).toBe(6);
    expect(landingRealCount({ deal: "hotels", city: "tbilisi" }, rows)).toBe(0);
  });
});

describe("indexableSearchPaths (sitemap)", () => {
  it("lists only indexed landings that are their own canonical page", () => {
    const rows = pages({ "batumi:short-stays": 3, "batumi:monthly": 1, "tbilisi:hotels": 1 });
    expect(indexableSearchPaths(rows).sort()).toEqual(["/search", "/search?deal=rent", "/search?deal=rent&city=batumi", "/search?deal=short-stay"].sort());
    expect(indexableSearchPaths(pages({}))).toEqual([]);
  });
});
