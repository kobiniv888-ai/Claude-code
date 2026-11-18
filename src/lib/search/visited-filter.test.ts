/**
 * The "ביקרנו במקום" search filter (round 3, brief 8.3): `?visited=1`, a server-side where clause
 * that never matches demo listings, a removable chip, and its place in the filters sheet.
 */
import { describe, expect, it } from "vitest";
import { FALLBACK_RATES } from "@/lib/currency/convert";
import {
  activeFilterChips,
  clearFilters,
  emptyFilters,
  parseSearchParams,
  removeFilter,
  serializeSearchQuery,
  withFilters,
} from "@/lib/listing/search-params";
import { buildListingWhere, publicListingWhere, VISITED_WHERE } from "@/lib/listing/where";
import { chipLabel } from "./chip-label";
import { SECTION_CHIPS, sectionActiveCount } from "./filter-sections";
import { loosenCandidates } from "./loosen";

const now = new Date("2026-11-04T12:00:00.000Z");
const ctx = { currency: "USD" as const, rates: FALLBACK_RATES, demoVisible: true, now };

describe("?visited=1", () => {
  it("is read from the URL and written back", () => {
    expect(parseSearchParams({ visited: "1" }).visited).toBe(true);
    expect(parseSearchParams({ visited: "true" }).visited).toBe(true);
    expect(parseSearchParams({ visited: "0" }).visited).toBe(false);
    expect(parseSearchParams({}).visited).toBe(false);
    expect(serializeSearchQuery({ visited: true })).toBe("visited=1");
    expect(serializeSearchQuery({ visited: false })).toBe("");
    expect(serializeSearchQuery({ deal: "short-stay", city: "batumi", visited: true })).toBe("deal=short-stay&city=batumi&visited=1");
  });

  it("goes back to page 1 when toggled", () => {
    const filters = { ...emptyFilters(), page: 3 };
    expect(withFilters(filters, { visited: true })).toMatchObject({ visited: true, page: 1 });
  });
});

describe("the where clause", () => {
  it("adds nothing when off", () => {
    const where = buildListingWhere(emptyFilters(), ctx);
    expect(where.AND).toEqual([publicListingWhere(ctx)]);
  });

  it("asks for a visit date and a real (non-demo) listing, even while demo data is shown", () => {
    const where = buildListingWhere({ ...emptyFilters(), visited: true }, ctx);
    expect(where.AND).toEqual([publicListingWhere(ctx), VISITED_WHERE]);
    expect(VISITED_WHERE).toEqual({ visitedAt: { not: null }, isDemo: false });
    // Only the date column: never the staff-only note.
    expect(JSON.stringify(where)).not.toContain("visitedNote");
  });
});

describe("the chip and the sheet", () => {
  const t = (key: string) => `search.chips.${key}`;
  const f = (key: string) => `listingFields.${key}`;
  const label = { t, f, locale: "he", currency: "ILS" as const, placeNames: { city: null, neighborhood: null } };

  it("shows a removable chip with its own label", () => {
    const filters = { ...emptyFilters(), visited: true };
    const chips = activeFilterChips(filters);
    expect(chips).toEqual([{ key: "visited" }]);
    expect(chipLabel(chips[0], filters, label)).toBe("search.chips.visited");
    expect(removeFilter(filters, "visited").visited).toBe(false);
    expect(clearFilters(filters).visited).toBe(false);
  });

  it("lives in the listing section of the sheet, which counts it", () => {
    expect(SECTION_CHIPS.listing).toContain("visited");
    expect(sectionActiveCount({ ...emptyFilters(), visited: true }, "listing")).toBe(1);
  });

  it("is one of the one-tap fixes when nothing matches", () => {
    const fixes = loosenCandidates({ ...emptyFilters(), visited: true });
    expect(fixes.some((c) => c.fix.kind === "remove" && c.fix.chip.key === "visited" && c.filters.visited === false)).toBe(true);
  });
});
