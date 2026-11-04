/**
 * The visitor's last search (round 3, brief 4), shown on the home page as one tap:
 * "בטומי · 12–15 בדצמ׳ · 2 אורחים". Kept on the device only ("bayit:last-search", with cookie
 * consent; logging out clears it). Pure and client-safe; the search page builds the draft with
 * lastSearchDraft() (./last-search-draft, server side) and the browser stamps and stores it.
 *
 * It stops showing 30 days after the search, or once its check-in day has passed.
 */
import { formatDate } from "@/lib/format";
import { compactStay } from "./search-card";

export const LAST_SEARCH_STORAGE_KEY = "bayit:last-search";
export const LAST_SEARCH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** What the search page knows about the search (no times yet). */
export type LastSearchDraft = {
  /** The search address's query string, without the page and the map area ("deal=short-stay&city=batumi…"). */
  query: string;
  /** The deal filter ("short-stay", "monthly", "buy", "hotels", "rent") or null. */
  deal: string | null;
  city: string | null;
  neighborhood: string | null;
  q: string | null;
  /** "YYYY-MM-DD" */
  checkIn: string | null;
  checkOut: string | null;
  guests: number | null;
  /** The place as the search page named it, in `placeLocale`. */
  place: string | null;
  placeLocale: string | null;
};

export type LastSearch = LastSearchDraft & {
  v: 1;
  /** When it was searched (epoch ms). */
  at: number;
  /** When it stops being shown (epoch ms). */
  exp: number;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9-]{1,80}$/;

/** Local midnight after a "YYYY-MM-DD" day (the device's time zone). */
function endOfDay(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d + 1).getTime();
}

/** 30 days after the search, or the end of the check-in day if that comes first. */
export function lastSearchExpiry(at: number, checkIn: string | null): number {
  const maxAge = at + LAST_SEARCH_MAX_AGE_MS;
  return checkIn && DATE.test(checkIn) ? Math.min(maxAge, endOfDay(checkIn)) : maxAge;
}

/** Worth offering again: it names a place or has dates (not just "all short stays"). */
export function isWorthRemembering(draft: LastSearchDraft): boolean {
  return Boolean(draft.city || draft.q || draft.checkIn);
}

/** The draft stamped with its time, or null when it is not worth remembering or already over. */
export function stampLastSearch(draft: LastSearchDraft, now: number): LastSearch | null {
  if (!isWorthRemembering(draft)) return null;
  const exp = lastSearchExpiry(now, draft.checkIn);
  if (exp <= now) return null;
  return { v: 1, ...draft, at: now, exp };
}

const str = (value: unknown, max = 200): string | null =>
  typeof value === "string" && value.trim() !== "" && value.length <= max ? value : null;

/** Reads a stored value; null when it is malformed or no longer shown. */
export function parseLastSearch(value: unknown, now: number): LastSearch | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (r.v !== 1 || typeof r.at !== "number" || !Number.isFinite(r.at)) return null;
  const query = typeof r.query === "string" && r.query.length <= 2000 ? r.query : null;
  if (query === null) return null;
  const checkIn = str(r.checkIn, 10);
  const checkOut = str(r.checkOut, 10);
  const guests = typeof r.guests === "number" && Number.isSafeInteger(r.guests) && r.guests > 0 ? r.guests : null;
  const draft: LastSearchDraft = {
    query,
    deal: str(r.deal, 20),
    city: str(r.city, 80),
    neighborhood: str(r.neighborhood, 80),
    q: str(r.q),
    checkIn: checkIn && DATE.test(checkIn) ? checkIn : null,
    checkOut: checkOut && DATE.test(checkOut) ? checkOut : null,
    guests,
    place: str(r.place),
    placeLocale: str(r.placeLocale, 5),
  };
  if ((draft.city && !SLUG.test(draft.city)) || (draft.neighborhood && !SLUG.test(draft.neighborhood))) return null;
  // Never trust a stored expiry beyond the rule (it is recomputed from the search time).
  const exp = Math.min(typeof r.exp === "number" ? r.exp : Number.POSITIVE_INFINITY, lastSearchExpiry(r.at, draft.checkIn));
  if (exp <= now || r.at > now + 60_000 || !isWorthRemembering(draft)) return null;
  return { v: 1, ...draft, at: r.at, exp };
}

/** Where the one tap goes. */
export function lastSearchHref(search: Pick<LastSearch, "query">): string {
  return search.query ? `/search?${search.query}` : "/search";
}

/**
 * The parts of the one-tap line, in order: the place (or the deal when there is none), the dates,
 * the guests, and the deal when it is not a short stay ("בטומי · חודשי").
 *   ["בטומי", "12–15 בדצמ׳", "2 אורחים"]
 */
export function lastSearchParts(
  search: LastSearch,
  {
    locale,
    cityName,
    dealLabel,
    guestsLabel,
  }: {
    locale: string;
    /** The city's name in this language (from the home page's cities), if known. */
    cityName: string | null;
    /** The deal's name in this language, if it has one ("חודשי"). */
    dealLabel: string | null;
    guestsLabel: (count: number) => string;
  },
): string[] {
  const sameLanguage = search.placeLocale === locale;
  let place: string | null = null;
  if (search.neighborhood && search.place && sameLanguage) place = search.place;
  else if (search.city) place = cityName ?? (sameLanguage ? search.place : null) ?? search.place ?? null;
  else if (search.q) place = search.q;

  const parts: string[] = [];
  if (place) parts.push(place);
  if (search.checkIn && search.checkOut && search.checkOut > search.checkIn) {
    parts.push(compactStay(search.checkIn, search.checkOut, locale));
  } else if (search.checkIn) {
    parts.push(formatDate(search.checkIn, locale, { day: "numeric", month: "short" }));
  }
  if (search.guests && search.guests > 0) parts.push(guestsLabel(search.guests));
  if (dealLabel && (search.deal !== "short-stay" || parts.length === 0)) {
    if (place) parts.splice(1, 0, dealLabel);
    else parts.unshift(dealLabel);
  }
  return parts;
}
