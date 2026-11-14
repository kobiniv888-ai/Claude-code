/**
 * Search result pages for search engines (pure): the title key, the canonical address and when a
 * results page may be indexed (round 3, brief 10; the founder's rule for city pages: "let Google
 * index a page only when it has at least 3 real listings").
 *
 *   /search, /search?deal=hotels          indexed with at least 3 real listings of that deal
 *   /search?deal=monthly&city=tbilisi     the "landing" of the city page /tbilisi/monthly: canonical
 *                                          to that page while it is indexed, else noindex
 *   /search?city=batumi                   canonical to the city overview /batumi while it is indexed
 *   /search?deal=rent&city=batumi         its own page (no city page has both deals)
 *   …&page=3, …&sort=newest, …&view=map,  noindex; canonical to the landing without them
 *   …&bedrooms=2, a neighborhood, dates,
 *   a free-text query, a map area
 *
 * Real listings: LIVE, public, never demo (listCityPages() of src/lib/city-pages, contract 1).
 */
import {
  cityOverviewPath,
  cityPageDealTypes,
  cityPagePath,
  cityPageTypeForDeal,
  isIndexable,
  type CityPageEntry,
} from "@/lib/city-pages/core";
import {
  DEAL_FILTERS,
  DEAL_FILTER_TYPES,
  DEFAULT_SORT,
  DEFAULT_VIEW,
  activeFilterChips,
  emptyFilters,
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

/** Filters that make a results page different: the deal plus every chip (sort, view and page do not count). */
export function seoFilterCount(filters: SearchFilters): number {
  return (filters.deal ? 1 : 0) + activeFilterChips(filters).length;
}

/** A landing page of the search: a deal, a city, both or neither, and nothing else. */
export type SearchLanding = { deal: DealFilter | null; city: string | null };

function landingFilters(landing: SearchLanding): SearchFilters {
  return { ...emptyFilters(), deal: landing.deal, city: landing.city };
}

/** The landing a results page belongs to: its deal and city, without every other filter. */
export function landingOf(filters: SearchFilters): SearchLanding {
  return { deal: filters.deal, city: filters.city };
}

/**
 * Is this results page a landing itself (only a deal and/or a city; page 1, the default sort and
 * view, no dates, neighborhood, text, map area or other filter)?
 */
export function isSearchLanding(filters: SearchFilters): boolean {
  return serializeSearchQuery(filters) === serializeSearchQuery(landingFilters(landingOf(filters)));
}

/**
 * Keep the page out of search results whatever the counts: every variant that is not a landing
 * (filters, a neighborhood, dates, sort, view, a page after the first, a text query, a map area).
 */
export function searchNoIndex(filters: SearchFilters): boolean {
  return !isSearchLanding(filters);
}

/** The canonical query: the landing's deal and city only. */
export function canonicalSearchQuery(filters: SearchFilters): string {
  return serializeSearchQuery({ ...landingFilters(landingOf(filters)), sort: DEFAULT_SORT, view: DEFAULT_VIEW });
}

/** "/search?deal=monthly&city=tbilisi" — the landing's path without the locale. */
export function canonicalSearchPath(filters: SearchFilters): string {
  const query = canonicalSearchQuery(filters);
  return query ? `/search?${query}` : "/search";
}

/** Real listings a landing shows: the city pages of its city (all cities without one) and its deal's types. */
export function landingRealCount(landing: SearchLanding, pages: readonly CityPageEntry[]): number {
  const dealTypes = landing.deal ? DEAL_FILTER_TYPES[landing.deal] : null;
  return pages
    .filter((page) => landing.city === null || page.citySlug === landing.city)
    .filter((page) => dealTypes === null || cityPageDealTypes(page.type).every((type) => dealTypes.includes(type)))
    .reduce((sum, page) => sum + Math.max(0, page.realCount), 0);
}

/**
 * The city page a city landing duplicates: /batumi/short-stays for short stays in Batumi, the
 * overview /batumi for every deal in Batumi; null for "rent" (two types) or without a city.
 */
export function landingCityPage(landing: SearchLanding): { path: string; indexable: (pages: readonly CityPageEntry[]) => boolean } | null {
  const city = landing.city;
  if (!city) return null;
  if (!landing.deal) {
    return {
      path: cityOverviewPath(city),
      indexable: (pages) => pages.some((page) => page.citySlug === city && page.indexable),
    };
  }
  const type = cityPageTypeForDeal(landing.deal);
  if (!type) return null;
  return {
    path: cityPagePath(city, type),
    indexable: (pages) => pages.some((page) => page.citySlug === city && page.type === type && page.indexable),
  };
}

export type SearchIndexing = {
  /** Keep this results page out of search results. */
  noIndex: boolean;
  /** The page path (without the locale) for rel=canonical and hreflang. */
  canonicalPath: string;
};

/**
 * Index or not, and the canonical address, from the city pages' real counts (listCityPages()).
 * A city landing never stands on its own next to its city page: while that page is indexed, the
 * landing points to it as canonical; otherwise the landing is noindex (it has fewer than 3 real
 * listings too). Without city pages (they could not be loaded): noindex.
 */
export function searchIndexing(filters: SearchFilters, pages: readonly CityPageEntry[]): SearchIndexing {
  const landing = landingOf(filters);
  const ownCanonical = canonicalSearchPath(filters);
  const cityPage = landingCityPage(landing);
  if (cityPage) {
    const indexable = cityPage.indexable(pages);
    return {
      noIndex: !isSearchLanding(filters) || !indexable,
      canonicalPath: indexable && isSearchLanding(filters) ? cityPage.path : ownCanonical,
    };
  }
  return {
    noIndex: !isSearchLanding(filters) || !isIndexable(landingRealCount(landing, pages)),
    canonicalPath: ownCanonical,
  };
}

/**
 * The results pages to list in the sitemap: indexed landings that are their own canonical page
 * (/search, /search?deal=…, /search?deal=rent&city=…). City landings with a city page are left to
 * that page.
 */
export function indexableSearchPaths(pages: readonly CityPageEntry[]): string[] {
  const cities = [...new Set(pages.map((page) => page.citySlug))];
  const deals: (DealFilter | null)[] = [null, ...DEAL_FILTERS];
  const candidates = [null, ...cities].flatMap((city) => deals.map((deal) => landingFilters({ deal, city })));
  return candidates
    .map((filters) => ({ own: canonicalSearchPath(filters), ...searchIndexing(filters, pages) }))
    .filter((result) => !result.noIndex && result.canonicalPath === result.own)
    .map((result) => result.own);
}
