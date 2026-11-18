import { describe, expect, it } from "vitest";
import { FALLBACK_RATES } from "@/lib/currency/convert";
import { emptyFilters, parseSearchParams, type SearchFilters } from "@/lib/listing/search-params";
import { dealRedirectQuery } from "@/lib/search/deal-query";
import { filterVisibility, propertyTypesFor, sectionActiveCount } from "@/lib/search/filter-sections";
import { addMonthsToDay, toHolidayMarks } from "@/lib/search/holiday-marks";
import { paginationItems } from "@/lib/search/pagination";
import { fromSliderValue, niceStep, priceSliderConfig, sliderValue } from "@/lib/search/price-range";
import { searchBarFilters, searchBarStateFrom } from "@/lib/search/search-bar";
import { canonicalSearchPath, dealTitleKey, searchNoIndex, seoFilterCount } from "@/lib/search/seo";

const filters = (patch: Partial<SearchFilters>): SearchFilters => ({ ...emptyFilters(), ...patch });

describe("paginationItems", () => {
  it("lists every page when there are few", () => {
    expect(paginationItems(1, 1)).toEqual([1]);
    expect(paginationItems(2, 4)).toEqual([1, 2, 3, 4]);
    expect(paginationItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("shows gaps around the current page", () => {
    expect(paginationItems(6, 20)).toEqual([1, "gap", 5, 6, 7, "gap", 20]);
  });

  it("never hides a single page behind a gap near the edges", () => {
    expect(paginationItems(4, 20)).toEqual([1, 2, 3, 4, 5, "gap", 20]);
    expect(paginationItems(17, 20)).toEqual([1, "gap", 16, 17, 18, 19, 20]);
  });

  it("clamps the current page", () => {
    expect(paginationItems(99, 3)).toEqual([1, 2, 3]);
    expect(paginationItems(0, 0)).toEqual([1]);
  });
});

describe("price slider", () => {
  it("picks round steps", () => {
    expect(niceStep(7)).toBe(5);
    expect(niceStep(16)).toBe(20);
    expect(niceStep(270)).toBe(200);
    expect(niceStep(0)).toBe(1);
  });

  it("needs a deal and scales with the currency", () => {
    expect(priceSliderConfig(null, "USD", FALLBACK_RATES)).toBeNull();
    const usd = priceSliderConfig("short-stay", "USD", FALLBACK_RATES)!;
    const gel = priceSliderConfig("short-stay", "GEL", FALLBACK_RATES)!;
    expect(usd.max).toBe(600);
    expect(gel.max).toBeGreaterThan(usd.max);
    expect(gel.max % gel.step).toBe(0);
    expect(priceSliderConfig("buy", "USD", FALLBACK_RATES)!.max).toBe(1_000_000);
  });

  it("maps filter values to thumbs and back", () => {
    const config = { min: 0 as const, max: 1000, step: 10 };
    expect(sliderValue(null, null, config)).toEqual([0, 1000]);
    expect(sliderValue(200, 5000, config)).toEqual([200, 1000]);
    expect(fromSliderValue([0, 1000], config)).toEqual({ priceMin: null, priceMax: null });
    expect(fromSliderValue([100, 400], config)).toEqual({ priceMin: 100, priceMax: 400 });
  });
});

describe("filter sections", () => {
  it("offers the property types of the deal", () => {
    expect(propertyTypesFor("hotels")).toEqual(["HOTEL", "GUESTHOUSE", "HOSTEL"]);
    expect(propertyTypesFor("buy")).not.toContain("ROOM");
    expect(propertyTypesFor(null)).toHaveLength(10);
  });

  it("hides filters that cannot match the deal, unless they are set", () => {
    const sale = filterVisibility(filters({ deal: "buy" }));
    expect(sale.dates).toBe(false);
    expect(sale.guests).toBe(false);
    expect(sale.hotel).toBe(false);
    expect(sale.price).toBe(true);
    expect(filterVisibility(filters({ deal: "buy", bigFamily: true })).bigFamily).toBe(true);
    expect(filterVisibility(filters({ deal: "monthly" })).moveIn).toBe(true);
    expect(filterVisibility(filters({})).price).toBe(false);
    expect(filterVisibility(filters({ priceMax: 100 })).price).toBe(true);
    expect(filterVisibility(filters({ deal: "hotels" })).propertyDetails).toBe(false);
  });

  it("counts the active filters of a section", () => {
    const f = filters({ shabbatFriendly: true, jewish: ["mezuzot", "sukkah_space"], verifiedOnly: true });
    expect(sectionActiveCount(f, "jewish")).toBe(3);
    expect(sectionActiveCount(f, "owner")).toBe(1);
    expect(sectionActiveCount(f, "price")).toBe(0);
  });
});

describe("search bar", () => {
  it("turns a city, a stay and guests into filters", () => {
    expect(
      searchBarFilters({
        deal: "short-stay",
        place: { kind: "city", citySlug: "batumi", label: "Batumi" },
        checkIn: "2026-12-01",
        checkOut: "2026-12-05",
        guests: 3,
      }),
    ).toEqual({
      deal: "short-stay",
      city: "batumi",
      neighborhood: null,
      q: null,
      checkIn: "2026-12-01",
      checkOut: "2026-12-05",
      guests: 3,
    });
  });

  it("uses a single move-in date for monthly rentals and no dates for buying", () => {
    const monthly = searchBarFilters({ deal: "monthly", place: null, checkIn: "2026-12-01", checkOut: "2027-01-01", guests: 0 });
    expect(monthly.checkIn).toBe("2026-12-01");
    expect(monthly.checkOut).toBeNull();
    expect(monthly.guests).toBeNull();
    const buy = searchBarFilters({ deal: "buy", place: null, checkIn: "2026-12-01", checkOut: null, guests: 4 });
    expect(buy.checkIn).toBeNull();
    expect(buy.guests).toBeNull();
  });

  it("searches typed text and neighborhoods", () => {
    expect(searchBarFilters({ deal: "hotels", place: { kind: "text", text: " vake ", label: "vake" }, checkIn: null, checkOut: null, guests: 0 }).q).toBe("vake");
    const n = searchBarFilters({
      deal: "short-stay",
      place: { kind: "neighborhood", citySlug: "tbilisi", neighborhoodSlug: "vake", label: "Vake, Tbilisi" },
      checkIn: null,
      checkOut: null,
      guests: 0,
    });
    expect([n.city, n.neighborhood]).toEqual(["tbilisi", "vake"]);
  });

  it("starts from the filters in the URL", () => {
    const state = searchBarStateFrom(parseSearchParams({ deal: "rent", city: "tbilisi", guests: "2" }), { city: "Tbilisi" });
    expect(state.deal).toBe("rent");
    expect(state.place).toEqual({ kind: "city", citySlug: "tbilisi", label: "Tbilisi" });
    expect(state.guests).toBe(2);
  });
});

describe("search SEO", () => {
  it("names the deal for titles", () => {
    expect(dealTitleKey("short-stay")).toBe("shortStay");
    expect(dealTitleKey(null)).toBe("any");
  });

  it("keeps page, sort and view variants out of the index, canonical to the deal + city landing", () => {
    const f = parseSearchParams({ deal: "monthly", city: "tbilisi", page: "3", sort: "newest", view: "map" });
    expect(seoFilterCount(f)).toBe(2);
    expect(searchNoIndex(f)).toBe(true);
    expect(searchNoIndex(parseSearchParams({ deal: "monthly", city: "tbilisi" }))).toBe(false);
    expect(canonicalSearchPath(f)).toBe("/search?deal=monthly&city=tbilisi");
  });

  it("keeps filtered, text and map-area pages out of the index", () => {
    expect(searchNoIndex(parseSearchParams({ deal: "buy", city: "batumi", bedrooms: "2" }))).toBe(true);
    expect(searchNoIndex(parseSearchParams({ q: "sea view" }))).toBe(true);
    expect(searchNoIndex(parseSearchParams({ bounds: "41.8,41.6,44.9,44.7" }))).toBe(true);
  });
});

describe("holiday marks", () => {
  it("merges holidays on one day and skips modern ones", () => {
    const marks = toHolidayMarks([
      { date: "2026-10-03", name: "Simchat Torah", isYomTov: true, category: "major" },
      { date: "2026-10-02", name: "Shemini Atzeret", isYomTov: true, category: "major" },
      { date: "2026-10-02", name: "Erev Simchat Torah", isYomTov: false, category: "major" },
      { date: "2027-05-12", name: "Yom HaAtzmaut", isYomTov: false, category: "modern" },
    ]);
    expect(marks).toEqual([
      { date: "2026-10-02", name: "Shemini Atzeret · Erev Simchat Torah", isYomTov: true },
      { date: "2026-10-03", name: "Simchat Torah", isYomTov: true },
    ]);
  });

  it("adds months to a calendar day", () => {
    expect(addMonthsToDay("2026-10-31", 18)).toBe("2028-04-30");
    expect(addMonthsToDay("2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("deal shortcuts", () => {
  it("replaces the deal and keeps the other parameters", () => {
    expect(dealRedirectQuery("buy", { city: "batumi", deal: "rent", amenities: ["wifi", "pool"] })).toBe(
      "deal=buy&city=batumi&amenities=wifi&amenities=pool",
    );
    expect(dealRedirectQuery("hotels", {})).toBe("deal=hotels");
  });
});
