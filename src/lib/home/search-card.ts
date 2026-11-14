/**
 * The home search card's state → search filters (pure, client-safe).
 *
 * Short stays and hotels ask "When?" and "How many guests?"; monthly rentals and buying ask for
 * rooms and a budget instead. The result goes through searchPath() (serializeSearchQuery).
 *
 *   homeSearchFilters({ deal: "buy", place: null, checkIn: null, checkOut: null, guests: 2, rooms: 3, budget: 250000 })
 *     → { deal: "buy", city: null, …, guests: null, rooms: 3, priceMax: 250000 }
 */
import { formatDate, formatNumber } from "@/lib/format";
import type { SearchFilters } from "@/lib/listing/search-params";
import { formatStay } from "@/lib/search/format-stay";
import { searchBarFilters, type SearchBarDeal, type SearchBarState } from "@/lib/search/search-bar";

export type HomeSearchState = Omit<SearchBarState, "deal"> & {
  deal: SearchBarDeal;
  /** Minimum rooms (0 = any). Monthly rentals and buying only. */
  rooms: number;
  /** Maximum price in the visitor's display currency (null = no limit). Monthly rentals and buying only. */
  budget: number | null;
};

/** The room choices: "Any · 1+ · 2+ · 3+ · 4+". */
export const HOME_ROOM_OPTIONS = [0, 1, 2, 3, 4] as const;

/** Whether the deal asks for dates and guests (short stays, hotels) or rooms and budget (monthly, buy). */
export function asksForDates(deal: SearchBarDeal): boolean {
  return deal === "short-stay" || deal === "hotels";
}

/** Digits only, as a positive whole number, or null ("" / "0" / "abc" → null). */
export function parseBudget(input: string): number | null {
  const digits = input.replace(/\D/g, "").slice(0, 10);
  const value = Number(digits);
  return digits && Number.isFinite(value) && value > 0 ? value : null;
}

export function homeSearchFilters(state: HomeSearchState): Partial<SearchFilters> {
  if (asksForDates(state.deal)) {
    return searchBarFilters(state);
  }
  // Monthly and buy: place + rooms + budget (no dates, no guests).
  const base = searchBarFilters({ ...state, checkIn: null, checkOut: null, guests: 0 });
  return {
    ...base,
    guests: null,
    rooms: state.rooms > 0 ? state.rooms : null,
    priceMax: state.budget && state.budget > 0 ? state.budget : null,
  };
}

/**
 * A stay, short: within one month the check-out date with the day turned into a range, in the
 * language's own order ("12–15 בדצמ׳", "Dec 12–15", "12–15 дек."); else the shared
 * "11 Nov – 2 Dec". Two formatDate calls, never Intl's formatRange (see formatStay).
 */
export function compactStay(checkIn: string, checkOut: string, locale: string): string {
  if (checkIn.slice(0, 7) !== checkOut.slice(0, 7)) return formatStay(checkIn, checkOut, locale);
  const outDay = formatNumber(Number(checkOut.slice(8, 10)), locale);
  const inDay = formatNumber(Number(checkIn.slice(8, 10)), locale);
  const out = formatDate(checkOut, locale, { day: "numeric", month: "short" });
  const at = out.indexOf(outDay);
  if (at === -1) return formatStay(checkIn, checkOut, locale);
  return `${out.slice(0, at)}${inDay}–${outDay}${out.slice(at + outDay.length)}`;
}
