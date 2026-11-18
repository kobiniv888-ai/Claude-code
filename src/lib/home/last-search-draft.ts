/**
 * The search page's half of "the last search" (./last-search): what to remember about the search
 * on screen. Kept apart from ./last-search so the home page's browser code never loads the whole
 * filter serializer.
 */
import { serializeSearchQuery, type SearchFilters } from "@/lib/listing/search-params";
import { isWorthRemembering, type LastSearchDraft } from "./last-search";

/** The draft for these filters, or null when there is nothing worth offering again. */
export function lastSearchDraft(filters: SearchFilters, place: string | null, locale: string): LastSearchDraft | null {
  const draft: LastSearchDraft = {
    // The same search, from its first page and without the map area the visitor panned to.
    query: serializeSearchQuery({ ...filters, page: 1, bounds: null }),
    deal: filters.deal,
    city: filters.city,
    neighborhood: filters.city ? filters.neighborhood : null,
    q: filters.q,
    checkIn: filters.checkIn,
    checkOut: filters.checkIn ? filters.checkOut : null,
    guests: filters.guests,
    place,
    placeLocale: place ? locale : null,
  };
  return isWorthRemembering(draft) ? draft : null;
}
