/**
 * Fixed account paths, in a module of their own: client components that only need one of these
 * (the heart, the compare buttons) would otherwise bring ./urls.ts and with it the whole search
 * query serializer (./search-params.ts) into every page that shows a listing card.
 */

/** The visitor's saved listings. */
export const FAVORITES_PATH = "/account/favorites";
/** Side-by-side comparison of the compare list (up to siteConfig.listings.compareMax). */
export const COMPARE_PATH = "/account/compare";
