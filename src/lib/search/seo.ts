/**
 * Search result pages for search engines (pure): the title key, the canonical query and when a
 * results page should stay out of the index.
 *
 *   /search?deal=monthly&city=tbilisi          → "Monthly rentals in Tbilisi", indexed
 *   /search?deal=monthly&city=tbilisi&page=3   → canonical /search?deal=monthly&city=tbilisi
 *   /search?deal=buy&city=batumi&bedrooms=2&elevator=1 → noindex (more than 2 filters)
 */
import {
  DEFAULT_SORT,
  DEFAULT_VIEW,
  activeFilterChips,
  serializeSearchQuery,
  type DealFilter,
  type SearchFilters,
} from "@/lib/listing/search-params";

/** Message key for a deal in titles and headings (ICU keys cannot contain "-"). */
export type DealTitleKey = "any" | "rent" | "shortStay" | "monthly" | "buy" | "hotels";

const DEAL_TITLE_KEYS: Record<DealFilter, DealTitleKey> = {
  rent: "rent",
  "short-stay": "shortStay",
  monthly: "monthly",
  buy: "buy",
  hotels: "hotels",
};

export function dealTitleKey(deal: DealFilter | null): DealTitleKey {
  return deal ? DEAL_TITLE_KEYS[deal] : "any";
}

/** Indexed result pages have at most this many filters (the deal counts as one, so does the city). */
export const MAX_INDEXED_FILTERS = 2;

/** Filters that make a results page different: the deal plus every chip (sort, view and page do not count). */
export function seoFilterCount(filters: SearchFilters): number {
  return (filters.deal ? 1 : 0) + activeFilterChips(filters).length;
}

/** Keep the page out of search results: more than two filters, a map area or a free-text query. */
export function searchNoIndex(filters: SearchFilters): boolean {
  return filters.bounds !== null || filters.q !== null || seoFilterCount(filters) > MAX_INDEXED_FILTERS;
}

/** The canonical query: the same filters without the page, sort, view and map area. */
export function canonicalSearchQuery(filters: SearchFilters): string {
  return serializeSearchQuery({ ...filters, page: 1, sort: DEFAULT_SORT, view: DEFAULT_VIEW, bounds: null });
}

/** "/search?deal=monthly&city=tbilisi" — the canonical path without the locale. */
export function canonicalSearchPath(filters: SearchFilters): string {
  const query = canonicalSearchQuery(filters);
  return query ? `/search?${query}` : "/search";
}
