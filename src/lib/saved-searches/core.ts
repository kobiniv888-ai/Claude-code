/**
 * Saved searches and their daily email ("שמירת חיפוש", round 3, brief 7.4): the pure rules.
 * Unit-tested in ./core.test.ts; the database side is ./server.ts and the daily run ./run.ts.
 *
 * - **What is saved:** the search's URL parameters, normalized with the search page's own parser
 *   (src/lib/listing/search-params.ts): the city, the deal type, the property types, every filter
 *   and the dates when chosen. Sort, view and page are left out (they change how results are
 *   shown, not which ones match). The display currency is saved next to them, because a price
 *   range is typed in it. Stored in SavedSearch.filters as { v: 1, query, currency }.
 * - **What is "new":** a listing first published (Listing.publishedAt) after the search was saved
 *   and after its last check (minus a few minutes, so a listing that was being published while
 *   the cron read the table is not lost); never further back than MAX_LOOKBACK_DAYS. A listing
 *   already sent for this search (SavedSearch.lastMatchIds) is never sent again.
 * - **When:** at most one email a day per user, grouping all of their searches (the claim key
 *   below), in the morning Israel time and never on Shabbat or Yom Tov: the founder's daily
 *   summary window (src/lib/alerts/summary-schedule.ts).
 * - **Dates that have passed:** a search whose check-in (or move-in) day is already over sends
 *   nothing (no place can be booked for it any more); the account page says so.
 */
import { currencyCodes, type CurrencyCode } from "@/config/site";
import { summaryDue, type SummaryDecision } from "@/lib/alerts/summary-schedule";
import {
  DEFAULT_SORT,
  DEFAULT_VIEW,
  parseSearchParams,
  serializeSearchQuery,
  type SearchFilters,
  type SearchParamsInput,
} from "@/lib/listing/search-params";

/** Code points in a saved search's name. */
export const SAVED_SEARCH_NAME_MAX = 80;
/** Saved searches per account (each one is checked every day). */
export const MAX_SAVED_SEARCHES = 20;
/** Listing ids remembered per search (the newest first): never the same listing twice. */
export const MATCH_IDS_CAP = 500;
/** Listings shown per search in the email; the rest are "and N more" with a link to the search. */
export const MAX_LISTINGS_PER_SEARCH = 5;
/** Searches shown in one email (the ones with the most new places first). */
export const MAX_SEARCHES_PER_EMAIL = 10;
/** The check window starts this much before the last check (a listing published during it). */
export const MATCH_WINDOW_OVERLAP_MS = 10 * 60 * 1000;
/** Never look back further than this (a cron that did not run for weeks sends one week, not all). */
export const MAX_LOOKBACK_DAYS = 7;
/** Candidates read per search and run (more than one email can show). */
export const MAX_CANDIDATES_PER_SEARCH = 50;

const DAY_MS = 86_400_000;

// ─── Filters ──────────────────────────────────────────────────

/** SavedSearch.filters. `query` is "deal=short-stay&city=batumi&…" (normalized, no sort/view/page). */
export type StoredSearchFilters = { v: 1; query: string; currency: CurrencyCode };

export type SavedSearchCriteria = { filters: SearchFilters; query: string; currency: CurrencyCode };

/** The search's filters without sort, view and page (they do not change which listings match). */
export function matchingFilters(filters: SearchFilters): SearchFilters {
  return { ...filters, sort: DEFAULT_SORT, view: DEFAULT_VIEW, page: 1 };
}

/**
 * The normalized form of a search: parsed leniently by the search page's parser (unknown or
 * invalid values are dropped), then written back in the stable URL order. Equal searches give
 * equal queries, whatever order or spelling the URL had.
 */
export function normalizeSearch(input: SearchParamsInput | string | null | undefined): { filters: SearchFilters; query: string } {
  const source = typeof input === "string" ? new URLSearchParams(input.replace(/^\?/, "")) : input;
  const filters = matchingFilters(parseSearchParams(source));
  const query = serializeSearchQuery(filters);
  // Round-trip once more: the stored query parses to exactly these filters.
  return { filters: matchingFilters(parseSearchParams(new URLSearchParams(query))), query };
}

function isCurrency(value: unknown): value is CurrencyCode {
  return typeof value === "string" && (currencyCodes as readonly string[]).includes(value);
}

export function toStoredFilters(query: string, currency: CurrencyCode): StoredSearchFilters {
  return { v: 1, query: normalizeSearch(query).query, currency };
}

/** SavedSearch.filters (any shape) → the search, or null when it cannot be read. */
export function readStoredFilters(value: unknown): SavedSearchCriteria | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.v !== 1 || typeof row.query !== "string" || row.query.length > 4000) return null;
  const currency = isCurrency(row.currency) ? row.currency : "USD";
  const { filters, query } = normalizeSearch(row.query);
  return { filters, query, currency };
}

/**
 * Two saves of the same search (the button tapped twice, or the same URL again): the same
 * normalized query, and the same currency when a price range makes it matter.
 */
export function isSameSearch(a: SavedSearchCriteria, b: SavedSearchCriteria): boolean {
  if (a.query !== b.query) return false;
  const priced = a.filters.priceMin !== null || a.filters.priceMax !== null;
  return !priced || a.currency === b.currency;
}

/** The search page path of a saved search ("/search?city=batumi"). */
export function savedSearchPath(query: string): string {
  return query ? `/search?${query}` : "/search";
}

/** The check-in (or move-in) day is over in Georgia: no place can be booked for it any more. */
export function datesPassed(filters: Pick<SearchFilters, "checkIn">, today: string): boolean {
  return filters.checkIn !== null && filters.checkIn < today;
}

// ─── Names ────────────────────────────────────────────────────

export type SearchNameError = "name_required" | "name_too_long";

/** Bidi controls, zero-width characters and the BOM: invisible, and a way to disguise text. */
const INVISIBLE = /[\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u00AD]/g;
// Control characters (tabs and line breaks become spaces first).
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** "  בטומי \n באוגוסט\u200F " → "בטומי באוגוסט" (NFC, one space between words, no hidden characters). */
export function normalizeSearchName(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[\t\r\n\u2028\u2029]+/g, " ")
    .replace(CONTROL, "")
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateSearchName(raw: unknown): { ok: true; name: string } | { ok: false; error: SearchNameError } {
  if (typeof raw !== "string") return { ok: false, error: "name_required" };
  const name = normalizeSearchName(raw);
  if (!name) return { ok: false, error: "name_required" };
  if ([...name].length > SAVED_SEARCH_NAME_MAX) return { ok: false, error: "name_too_long" };
  return { ok: true, name };
}

/** Cuts a (generated) name to SAVED_SEARCH_NAME_MAX code points, with "…" when cut. */
export function clipSearchName(name: string, max = SAVED_SEARCH_NAME_MAX): string {
  const clean = normalizeSearchName(name);
  const chars = [...clean];
  return chars.length > max ? `${chars.slice(0, max - 1).join("").trim()}…` : clean;
}

/** Which prefilled name a search gets (the text comes from the alerts.defaultName messages). */
export type DefaultNameParts = {
  /** "any" without a deal type. */
  deal: "any" | "rent" | "shortStay" | "monthly" | "buy" | "hotels";
  /** The city (and neighborhood) in the page language, or null for all of Georgia. */
  place: string | null;
  /** The free text, when there is no place. */
  text: string | null;
  /** Check-in and check-out ("YYYY-MM-DD"), or the move-in day alone. */
  checkIn: string | null;
  checkOut: string | null;
};

const DEAL_KEYS = { rent: "rent", "short-stay": "shortStay", monthly: "monthly", buy: "buy", hotels: "hotels" } as const;

export function defaultNameParts(filters: SearchFilters, place: string | null): DefaultNameParts {
  return {
    deal: filters.deal ? DEAL_KEYS[filters.deal] : "any",
    place,
    text: place ? null : filters.q,
    checkIn: filters.checkIn,
    checkOut: filters.checkIn ? filters.checkOut : null,
  };
}

// ─── Matching ─────────────────────────────────────────────────

export type SearchClock = { createdAt: Date; lastCheckedAt: Date | null };

/**
 * Listings first published after this moment are new for the search: the last check (or the
 * save) minus a short overlap, never before the save itself and never more than
 * MAX_LOOKBACK_DAYS before `now`.
 */
export function matchWindowStart(search: SearchClock, now: Date): Date {
  const last = search.lastCheckedAt ?? search.createdAt;
  const withOverlap = last.getTime() - (search.lastCheckedAt ? MATCH_WINDOW_OVERLAP_MS : 0);
  const floor = now.getTime() - MAX_LOOKBACK_DAYS * DAY_MS;
  return new Date(Math.max(withOverlap, search.createdAt.getTime(), floor));
}

/** The candidates not sent before for this search, in the given order. */
export function newMatches<T extends { id: string }>(candidates: readonly T[], alreadySent: readonly string[]): T[] {
  const sent = new Set(alreadySent);
  const seen = new Set<string>();
  return candidates.filter((item) => {
    if (sent.has(item.id) || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/** SavedSearch.lastMatchIds after sending `sentIds`: the newest first, capped at MATCH_IDS_CAP. */
export function mergeMatchIds(previous: readonly string[], sentIds: readonly string[], cap = MATCH_IDS_CAP): string[] {
  const fresh = [...new Set(sentIds)];
  const keep = previous.filter((id) => !fresh.includes(id));
  return [...fresh, ...keep].slice(0, cap);
}

// ─── Schedule and once a day ──────────────────────────────────

/** The founder's daily summary window: 08:00–11:59 Israel time, never on Shabbat or Yom Tov. */
export function savedAlertsDue(now: Date, isRestTime: (at: Date) => boolean): SummaryDecision {
  return summaryDue(now, isRestTime);
}

export const DAILY_CLAIM_PREFIX = "saved-search-alerts:";

/** The RateLimit row that makes the saved-search email once a day per user (Israel day). */
export function dailyClaimKey(day: string, userId: string): string {
  return `${DAILY_CLAIM_PREFIX}${day}:${userId}`;
}

// ─── The email ────────────────────────────────────────────────

export type DigestSearch<L> = { id: string; name: string; query: string; matches: L[] };

/**
 * What one email shows: the searches with new places (most new places first, then by name),
 * up to MAX_SEARCHES_PER_EMAIL, each with up to MAX_LISTINGS_PER_SEARCH places and the number
 * left out. Every place of a shown search counts as sent (the email links to all of them through
 * the search); places of searches left out stay new for the next email.
 */
export function buildDigest<L extends { id: string }>(
  searches: readonly DigestSearch<L>[],
): { shown: (DigestSearch<L> & { more: number; total: number })[]; moreSearches: number; totalPlaces: number } {
  const withMatches = searches
    .filter((s) => s.matches.length > 0)
    .sort((a, b) => b.matches.length - a.matches.length || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const kept = withMatches.slice(0, MAX_SEARCHES_PER_EMAIL);
  const shown = kept.map((search) => ({
    ...search,
    matches: search.matches.slice(0, MAX_LISTINGS_PER_SEARCH),
    more: Math.max(0, search.matches.length - MAX_LISTINGS_PER_SEARCH),
    total: search.matches.length,
  }));
  // A place new for two searches counts once in the subject line.
  const places = new Set(kept.flatMap((s) => s.matches.map((m) => m.id)));
  return { shown, moreSearches: withMatches.length - kept.length, totalPlaces: places.size };
}
