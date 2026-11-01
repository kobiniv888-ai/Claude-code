/**
 * The home search card's state → search filters (pure, client-safe).
 *
 * Short stays and hotels ask "When?" and "How many guests?"; monthly rentals and buying ask for
 * rooms and a budget instead. The result goes through searchPath() (serializeSearchQuery).
 *
 *   homeSearchFilters({ deal: "buy", place: null, checkIn: null, checkOut: null, guests: 2, rooms: 3, budget: 250000 })
 *     → { deal: "buy", city: null, …, guests: null, rooms: 3, priceMax: 250000 }
 */
import type { SearchFilters } from "@/lib/listing/search-params";
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
