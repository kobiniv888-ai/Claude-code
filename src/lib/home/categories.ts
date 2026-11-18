/**
 * The home page category chips (brief round 2, 5.2): small icon chips that open the search with a
 * filter. They replace round 1's big photo tiles. Pure and client-safe.
 *
 * "kosherShabbat" is the Jewish quick filter ("כשר ושבת", `?kosherShabbat=1`), the same one as the
 * results page's "כשר ושבת" chip: a kosher kitchen, Shabbat-friendly, or kosher meals at a hotel.
 */
import type { SearchFilters } from "@/lib/listing/search-params";

export const HOME_CATEGORY_KEYS = ["apartments", "houses", "rooms", "hotels", "forSale", "kosherShabbat"] as const;
export type HomeCategoryKey = (typeof HOME_CATEGORY_KEYS)[number];

/** The Jewish quick filter ("כשר ושבת"). */
export const JEWISH_QUICK_FILTER: Partial<SearchFilters> = { kosherShabbat: true };

export const HOME_CATEGORY_FILTERS: Record<HomeCategoryKey, Partial<SearchFilters>> = {
  apartments: { propertyTypes: ["APARTMENT", "STUDIO", "PENTHOUSE"] },
  houses: { propertyTypes: ["HOUSE", "VILLA", "COTTAGE"] },
  rooms: { propertyTypes: ["ROOM"] },
  hotels: { deal: "hotels" },
  forSale: { deal: "buy" },
  kosherShabbat: JEWISH_QUICK_FILTER,
};
