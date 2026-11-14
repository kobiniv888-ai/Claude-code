/**
 * City pages (round 3, brief 10) — contract (1) of phase 6:
 *
 *   CITY_PAGE_TYPES            ["short-stays", "monthly", "sale", "hotels"] (URL slugs)
 *   cityPagePath(slug, type)   "/batumi/short-stays" (without the locale)
 *   REAL_LISTINGS_TO_INDEX     3
 *   listCityPages()            every city × type with realCount, indexable, updatedAt (server-only)
 *
 * Also: cityOverviewPath(slug) ("/batumi") and indexableCityOverviews(pages) for the overview
 * pages, which are indexed when any of the city's four pages is.
 *
 * This barrel includes the server part. Client components import from "@/lib/city-pages/core".
 */
export * from "./core";
export { findCityPageCity, getCityPageCities, getCityTypeCounts, listCityPages } from "./server";
