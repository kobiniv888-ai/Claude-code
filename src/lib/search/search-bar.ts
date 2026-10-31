/**
 * The search bar's state ⇄ search filters (pure; shared by the home hero and the bar on /search).
 *
 *   searchBarFilters({ deal: "monthly", place: { kind: "city", citySlug: "tbilisi", … }, moveIn: "2026-12-01" })
 *     → { deal: "monthly", city: "tbilisi", neighborhood: null, q: null, checkIn: "2026-12-01", checkOut: null, guests: null }
 */
import type { DealFilter, SearchFilters } from "@/lib/listing/search-params";

/** The deals offered in the search bar (the "Rent" tab covers short stays and monthly). */
export const SEARCH_BAR_DEALS = ["short-stay", "monthly", "buy", "hotels"] as const satisfies readonly DealFilter[];
export type SearchBarDeal = (typeof SEARCH_BAR_DEALS)[number];

export const MAX_GUESTS = 16;

/** Where: a city, a neighborhood, or free text (searched in all five languages). */
export type PlaceValue =
  | { kind: "city"; citySlug: string; label: string }
  | { kind: "neighborhood"; citySlug: string; neighborhoodSlug: string; label: string }
  | { kind: "text"; text: string; label: string };

export type SearchBarState = {
  /** The home bar always has one of SEARCH_BAR_DEALS; on /search it keeps whatever is in the URL. */
  deal: DealFilter | null;
  place: PlaceValue | null;
  /** "YYYY-MM-DD" check-in (or the move-in date for monthly rentals). */
  checkIn: string | null;
  /** "YYYY-MM-DD" check-out (short stays and hotels only). */
  checkOut: string | null;
  /** 0 = any number of guests. */
  guests: number;
};

export function isSearchBarDeal(value: unknown): value is SearchBarDeal {
  return (SEARCH_BAR_DEALS as readonly unknown[]).includes(value);
}

/** Whether the deal uses a single move-in date instead of a stay. */
export function usesMoveInDate(deal: DealFilter | null): boolean {
  return deal === "monthly";
}

/** Whether the deal has dates and guests at all (not for buying). */
export function usesDatesAndGuests(deal: DealFilter | null): boolean {
  return deal !== "buy";
}

/** The filters the search bar sets. Everything else is left to the caller (merge with withFilters). */
export function searchBarFilters(state: SearchBarState): Pick<
  SearchFilters,
  "deal" | "city" | "neighborhood" | "q" | "checkIn" | "checkOut" | "guests"
> {
  const { deal, place } = state;
  const stay = usesDatesAndGuests(deal);
  const checkIn = stay ? state.checkIn : null;
  const checkOut = stay && !usesMoveInDate(deal) && checkIn && state.checkOut && state.checkOut > checkIn ? state.checkOut : null;
  const guests = stay && state.guests > 0 ? Math.min(state.guests, MAX_GUESTS) : null;
  const text = place?.kind === "text" ? place.text.trim() : "";
  return {
    deal,
    city: place && place.kind !== "text" ? place.citySlug : null,
    neighborhood: place?.kind === "neighborhood" ? place.neighborhoodSlug : null,
    q: text ? text : null,
    checkIn,
    checkOut,
    guests,
  };
}

/** The search bar's starting state on /search (labels come from the server: city/neighborhood names). */
export function searchBarStateFrom(
  filters: SearchFilters,
  labels: { city?: string | null; neighborhood?: string | null } = {},
): SearchBarState {
  const { deal } = filters;
  let place: PlaceValue | null = null;
  if (filters.city && filters.neighborhood) {
    place = {
      kind: "neighborhood",
      citySlug: filters.city,
      neighborhoodSlug: filters.neighborhood,
      label: [labels.neighborhood, labels.city].filter(Boolean).join(", ") || filters.neighborhood,
    };
  } else if (filters.city) {
    place = { kind: "city", citySlug: filters.city, label: labels.city || filters.city };
  } else if (filters.q) {
    place = { kind: "text", text: filters.q, label: filters.q };
  }
  return {
    deal,
    place,
    checkIn: filters.checkIn,
    checkOut: filters.checkOut,
    guests: filters.guests ?? 0,
  };
}
