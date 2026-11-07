/**
 * City pages (round 3, brief 10): "/he/batumi/short-stays" = "דירות לטווח קצר בבטומי".
 * The pure part (client-safe, unit-tested): the four page types and their deal filters, the
 * paths, the indexing rule and the counts per type. The database part is ./server.ts.
 *
 *   cityPagePath("batumi", "short-stays")   → "/batumi/short-stays"   (Link / pageMetadata add the locale)
 *   cityPageDeal("sale")                     → "buy"                    (the search's deal filter)
 *   isIndexable(2)                           → false                    (REAL_LISTINGS_TO_INDEX = 3)
 *
 * A page may be indexed by search engines only when it has at least REAL_LISTINGS_TO_INDEX real
 * listings: LIVE, public, NOT demo. Demo listings may be shown (with their demo label, while the
 * "demo data" setting is on) but never count.
 */
import type { DealType } from "@/generated/prisma/enums";
import { DEAL_FILTER_TYPES, emptyFilters, type DealFilter, type SearchFilters } from "@/lib/listing/search-params";
import { searchPath } from "@/lib/listing/urls";

/** The URL slugs of the four page types, in the order the pages list them. */
export const CITY_PAGE_TYPES = ["short-stays", "monthly", "sale", "hotels"] as const;
export type CityPageType = (typeof CITY_PAGE_TYPES)[number];

/** A page is indexed only with at least this many real (non-demo, live, public) listings. */
export const REAL_LISTINGS_TO_INDEX = 3;

/** Each page type is one of the search's deal filters (src/lib/listing/search-params.ts). */
export const CITY_PAGE_DEALS: Record<CityPageType, DealFilter> = {
  "short-stays": "short-stay",
  monthly: "monthly",
  sale: "buy",
  hotels: "hotels",
};

/**
 * Message keys of the types (ICU keys and next-intl paths stay plain: no "-").
 * messages/<locale>/cityPages.json → types.shortStays, title.shortStays…
 */
export const CITY_PAGE_TYPE_KEYS: Record<CityPageType, "shortStays" | "monthly" | "sale" | "hotels"> = {
  "short-stays": "shortStays",
  monthly: "monthly",
  sale: "sale",
  hotels: "hotels",
};
export type CityPageTypeKey = (typeof CITY_PAGE_TYPE_KEYS)[CityPageType];

/**
 * How a guest gets the place: "instant" (choose dates, book on the site, pay the host on arrival:
 * short stays and hotels) or "contact" (write to the owner: monthly rentals and sales).
 */
export type CityPageBookingMode = "instant" | "contact";

export function cityPageBookingMode(type: CityPageType): CityPageBookingMode {
  return type === "short-stays" || type === "hotels" ? "instant" : "contact";
}

export function isCityPageType(value: unknown): value is CityPageType {
  return typeof value === "string" && (CITY_PAGE_TYPES as readonly string[]).includes(value);
}

/** The search's deal filter of a page type: "sale" → "buy". */
export function cityPageDeal(type: CityPageType): DealFilter {
  return CITY_PAGE_DEALS[type];
}

/** The listing deal types a page type shows: "short-stays" → ["SHORT_STAY"]. */
export function cityPageDealTypes(type: CityPageType): readonly DealType[] {
  return DEAL_FILTER_TYPES[CITY_PAGE_DEALS[type]];
}

/** The page type of a search deal filter, or null for one without a page ("rent" = two types). */
export function cityPageTypeForDeal(deal: DealFilter | null | undefined): CityPageType | null {
  if (!deal) return null;
  return CITY_PAGE_TYPES.find((type) => CITY_PAGE_DEALS[type] === deal) ?? null;
}

/** The page type a listing of this deal type appears on. */
export function cityPageTypeForDealType(dealType: DealType): CityPageType {
  return CITY_PAGE_TYPES.find((type) => cityPageDealTypes(type).includes(dealType)) ?? "short-stays";
}

export { MAX_CITY_SLUG_LENGTH, RESERVED_CITY_SLUGS, isCityPageSlug, isCitySlugShape } from "./slugs";

/** "/batumi/short-stays": the page path without the locale (Link and pageMetadata add it). */
export function cityPagePath(citySlug: string, type: CityPageType): string {
  return `${cityOverviewPath(citySlug)}/${type}`;
}

/** "/batumi": the city overview (the four types with their counts). */
export function cityOverviewPath(citySlug: string): string {
  return `/${citySlug}`;
}

/** The search filters of a page: its deal and its city, nothing else. */
export function cityPageFilters(citySlug: string, type: CityPageType): SearchFilters {
  return { ...emptyFilters(), deal: cityPageDeal(type), city: citySlug };
}

/** The same listings on the search page (more filters, dates, the full map): "/search?deal=short-stay&city=batumi". */
export function cityPageSearchPath(citySlug: string, type: CityPageType): string {
  return searchPath({ deal: cityPageDeal(type), city: citySlug });
}

/** May search engines index a page with this many real listings? */
export function isIndexable(realCount: number): boolean {
  return Number.isFinite(realCount) && realCount >= REAL_LISTINGS_TO_INDEX;
}

/**
 * What a city page shows above its "about" text (brief 10; the founder's rule as recorded in
 * docs/round-3/PLAN.md): "empty" — no places to show at all: "עדיין אין כאן מקומות · פרסמו את
 * שלכם"; "invite" — places to show (demo ones, or 1–2 real) but fewer than REAL_LISTINGS_TO_INDEX
 * real ones: the cards, then a "פרסמו את שלכם" band (the empty title would be false); "listings" —
 * enough real places: the cards only.
 */
export type CityListingsState = "empty" | "invite" | "listings";

export function cityListingsState(shown: number, realCount: number): CityListingsState {
  if (!(shown > 0)) return "empty";
  return isIndexable(realCount) ? "listings" : "invite";
}

/** Listings of one type in one city: `count` is what visitors see now (demo included while shown), `realCount` never counts demo. */
export type CityTypeCount = { count: number; realCount: number };
export type CityTypeCounts = Record<CityPageType, CityTypeCount>;

/** A row of `groupBy(["dealType", "isDemo"])` over the city's public listings (demo rows included). */
export type CityCountRow = { dealType: DealType; isDemo: boolean; count: number };

/**
 * The counts per type from the grouped rows. Demo rows add to `count` only while the demo data is
 * shown (`demoVisible`), and never to `realCount`.
 */
export function cityTypeCounts(rows: readonly CityCountRow[], demoVisible: boolean): CityTypeCounts {
  const counts = Object.fromEntries(CITY_PAGE_TYPES.map((type) => [type, { count: 0, realCount: 0 }])) as CityTypeCounts;
  for (const row of rows) {
    const n = Number.isFinite(row.count) && row.count > 0 ? Math.trunc(row.count) : 0;
    const entry = counts[cityPageTypeForDealType(row.dealType)];
    if (!row.isDemo) entry.realCount += n;
    if (!row.isDemo || demoVisible) entry.count += n;
  }
  return counts;
}

/** The city overview is indexed when any of its four pages is. */
export function isOverviewIndexable(counts: CityTypeCounts): boolean {
  return CITY_PAGE_TYPES.some((type) => isIndexable(counts[type].realCount));
}

/** One city page for the sitemap (contract (1) of round 3, phase 6). */
export type CityPageEntry = {
  citySlug: string;
  type: CityPageType;
  /** LIVE, public, non-demo listings of that city and type. */
  realCount: number;
  /** realCount >= REAL_LISTINGS_TO_INDEX. */
  indexable: boolean;
  /** When the newest of those listings was published or last changed; null without listings. */
  updatedAt: Date | null;
};

/**
 * The city overviews (/batumi) to index, from listCityPages(): a city whose pages include at least
 * one indexable page, with the newest `updatedAt` of its indexable pages.
 */
export function indexableCityOverviews(pages: readonly CityPageEntry[]): { citySlug: string; updatedAt: Date | null }[] {
  const out = new Map<string, Date | null>();
  for (const page of pages) {
    if (!page.indexable) continue;
    out.set(page.citySlug, laterDate(out.get(page.citySlug), page.updatedAt));
  }
  return [...out].map(([citySlug, updatedAt]) => ({ citySlug, updatedAt }));
}

/** The later of two dates (either may be missing). */
export function laterDate(a: Date | null | undefined, b: Date | null | undefined): Date | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a > b ? a : b;
}
