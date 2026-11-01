import { describe, expect, it } from "vitest";
import { emptyFilters, parseSearchParams, serializeSearchQuery, type SearchFilters } from "@/lib/listing/search-params";
import { chipLabel, loosenLabel } from "@/lib/search/chip-label";
import { loosenCandidates, rankLoosen, MAX_LOOSEN_CANDIDATES } from "@/lib/search/loosen";
import { barHeights, barInRange, bucketPrices } from "@/lib/search/price-histogram";
import { NEAR_SYNAGOGUE_MINUTES, QUICK_CHIPS, quickChipActive, toggleQuickChip } from "@/lib/search/quick-chips";

const filters = (patch: Partial<SearchFilters>): SearchFilters => ({ ...emptyFilters(), ...patch });

describe("bucketPrices", () => {
  it("counts prices into equal buckets, with max+ in the last one", () => {
    expect(bucketPrices([120, 480, 950], 1000, 4)).toEqual([1, 1, 0, 1]);
    expect(bucketPrices([0, 249.9, 250, 1000, 5000], 1000, 4)).toEqual([2, 1, 0, 2]);
  });

  it("ignores negative and invalid prices and a bad range", () => {
    expect(bucketPrices([-5, Number.NaN, 10], 100, 2)).toEqual([1, 0]);
    expect(bucketPrices([10], 0, 3)).toEqual([0, 0, 0]);
  });
});

describe("barHeights", () => {
  it("scales to the tallest bar and keeps tiny bars visible", () => {
    expect(barHeights([0, 50, 100])).toEqual([0, 0.5, 1]);
    expect(barHeights([1, 100])[0]).toBeCloseTo(0.06);
    expect(barHeights([0, 0])).toEqual([0, 0]);
  });
});

describe("barInRange", () => {
  it("marks the bars that overlap the selected range", () => {
    const inRange = (range: [number, number]) => [0, 1, 2, 3].map((i) => barInRange(i, 4, 1000, range));
    expect(inRange([0, 1000])).toEqual([true, true, true, true]);
    expect(inRange([300, 600])).toEqual([false, true, true, false]);
    // A range that ends below the top excludes the max+ bar.
    expect(inRange([0, 400])).toEqual([true, true, false, false]);
  });
});

describe("quick chips", () => {
  it("toggles the existing filters, so URLs stay the same", () => {
    const base = filters({});
    expect(toggleQuickChip(base, "kosher")).toEqual({ kitchen: "kosher" });
    expect(toggleQuickChip(base, "shabbat")).toEqual({ shabbatFriendly: true });
    expect(toggleQuickChip(base, "synagogue")).toEqual({ synagogueMaxWalk: NEAR_SYNAGOGUE_MINUTES });
    expect(toggleQuickChip(base, "hebrew")).toEqual({ jewish: ["host_speaks_hebrew"] });
    for (const chip of QUICK_CHIPS) expect(quickChipActive(base, chip)).toBe(false);
  });

  it("turns off whatever variant of the filter is set", () => {
    const set = filters({ kitchen: "kosher_or_kasherable", synagogueMaxWalk: 5, jewish: ["mezuzot", "host_speaks_hebrew"] });
    expect(quickChipActive(set, "kosher")).toBe(true);
    expect(toggleQuickChip(set, "kosher")).toEqual({ kitchen: null });
    expect(toggleQuickChip(set, "synagogue")).toEqual({ synagogueMaxWalk: null });
    expect(toggleQuickChip(set, "hebrew")).toEqual({ jewish: ["mezuzot"] });
  });

  it("means kosher meals for hotels", () => {
    const hotels = filters({ deal: "hotels" });
    expect(toggleQuickChip(hotels, "kosher")).toEqual({ hotel: ["kosher_meals"] });
    expect(quickChipActive(filters({ deal: "hotels", hotel: ["kosher_breakfast"] }), "kosher")).toBe(true);
    expect(toggleQuickChip(filters({ deal: "hotels", hotel: ["kosher_breakfast", "separate_swimming"] }), "kosher")).toEqual({
      hotel: ["separate_swimming"],
    });
  });

  it("round-trips through the URL", () => {
    const next = { ...filters({}), ...toggleQuickChip(filters({}), "synagogue") };
    expect(parseSearchParams(new URLSearchParams(serializeSearchQuery(next))).synagogueMaxWalk).toBe(NEAR_SYNAGOGUE_MINUTES);
  });
});

describe("loosenCandidates", () => {
  it("offers removing each filter, then the dates, then a wider area", () => {
    const f = filters({
      city: "tbilisi",
      neighborhood: "vake",
      checkIn: "2026-12-12",
      checkOut: "2026-12-15",
      kitchen: "kosher",
      jewish: ["host_speaks_hebrew"],
    });
    const ids = loosenCandidates(f).map((c) => c.id);
    expect(ids).toEqual(["remove:kitchen:kosher", "remove:jewish:host_speaks_hebrew", "dates", "area:neighborhood"]);
    const area = loosenCandidates(f).at(-1)!;
    expect(area.filters.city).toBe("tbilisi");
    expect(area.filters.neighborhood).toBeNull();
    expect(area.filters.kitchen).toBe("kosher");
  });

  it("widens a map area first, then a city to all of Georgia", () => {
    expect(loosenCandidates(filters({ city: "batumi", bounds: { south: 41, west: 41, north: 42, east: 42 } })).map((c) => c.id)).toEqual([
      "area:mapArea",
    ]);
    expect(loosenCandidates(filters({ city: "batumi" })).map((c) => c.id)).toEqual(["area:city"]);
    expect(loosenCandidates(filters({}))).toEqual([]);
  });

  it("caps the number of candidates", () => {
    const many = filters({
      amenities: ["wifi", "air_conditioning", "heating", "washing_machine", "dryer", "dishwasher", "full_kitchen", "workspace", "tv"],
      kitchen: "kosher",
      shabbatFriendly: true,
      bigFamily: true,
      verifiedOnly: true,
    });
    expect(loosenCandidates(many)).toHaveLength(MAX_LOOSEN_CANDIDATES);
  });
});

describe("rankLoosen", () => {
  it("keeps the fixes with results, most results first", () => {
    const candidates = loosenCandidates(filters({ city: "tbilisi", kitchen: "kosher", shabbatFriendly: true }));
    const ranked = rankLoosen(candidates, [0, 3, 9], 4);
    expect(ranked.map((r) => [r.id, r.count])).toEqual([
      ["area:city", 9],
      ["remove:shabbatFriendly:", 3],
    ]);
    expect(rankLoosen(candidates, [5, 5, 5], 2).map((r) => r.id)).toEqual(["remove:kitchen:kosher", "remove:shabbatFriendly:"]);
  });
});

describe("chip and fix labels", () => {
  const t = (key: string, values?: Record<string, string | number>) => `${key}${values ? JSON.stringify(values) : ""}`;
  const ctx = { t, f: t, fx: t, locale: "en", currency: "USD" as const, placeNames: { city: "Tbilisi", neighborhood: null } };

  it("labels chips with their value", () => {
    const f = filters({ bedrooms: 3, kitchen: "kosher" });
    expect(chipLabel({ key: "bedrooms", value: "3" }, f, ctx)).toBe('minBedrooms{"value":"3"}');
    expect(chipLabel({ key: "kitchen", value: "kosher" }, f, ctx)).toBe("kitchenFilter.kosher");
    expect(chipLabel({ key: "city", value: "tbilisi" }, f, ctx)).toBe("Tbilisi");
  });

  it("labels the fixes", () => {
    const f = filters({ kitchen: "kosher" });
    expect(loosenLabel({ kind: "remove", chip: { key: "kitchen", value: "kosher" } }, f, ctx)).toBe(
      'remove{"label":"kitchenFilter.kosher"}',
    );
    expect(loosenLabel({ kind: "dates" }, f, ctx)).toBe("dates");
    expect(loosenLabel({ kind: "area", scope: "city" }, f, ctx)).toBe("allGeorgia");
    expect(loosenLabel({ kind: "area", scope: "neighborhood" }, f, ctx)).toBe("widerArea");
  });
});
