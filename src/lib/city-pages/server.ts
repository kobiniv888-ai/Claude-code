import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { publicListingWhere } from "@/lib/listing/where";
import { getCities, getCityBySlug, type CityRecord } from "@/lib/places";
import { getSettings } from "@/lib/settings";
import {
  CITY_PAGE_TYPES,
  cityPageTypeForDealType,
  cityTypeCounts,
  isCityPageSlug,
  isIndexable,
  laterDate,
  type CityPageEntry,
  type CityPageType,
  type CityTypeCounts,
} from "./core";

/**
 * City pages, the database part (server-only). Every count starts from publicListingWhere, the
 * same rule as the search: LIVE, not deleted or expired, owner active. Nothing here is cached
 * across requests, so a listing that goes live (or a test row) counts at once; the city list
 * itself comes from the places cache (src/lib/places.ts, 5 minutes in production).
 */

/**
 * The active city of a page's slug, or null (the page answers 404). The slug is shape-checked first,
 * and a reserved name ("/he/hotels/short-stays") never becomes a city page.
 */
export async function findCityPageCity(slug: unknown): Promise<CityRecord | null> {
  if (!isCityPageSlug(slug)) return null;
  return getCityBySlug(slug);
}

/** The active cities that can have city pages (isCityPageSlug), from the places cache. */
export async function getCityPageCities(): Promise<CityRecord[]> {
  return (await getCities()).filter((city) => isCityPageSlug(city.slug));
}

/**
 * The city's listings per page type: `count` (what visitors see: demo listings included while the
 * demo data is shown) and `realCount` (never demo; decides indexing). One grouped query, once per
 * request.
 */
export const getCityTypeCounts = cache(async (cityId: string): Promise<CityTypeCounts> => {
  const [settings, rows] = await Promise.all([
    getSettings(),
    db.listing.groupBy({
      by: ["dealType", "isDemo"],
      // demoVisible: true = no demo filter here; cityTypeCounts sorts demo rows out of realCount.
      where: { AND: [publicListingWhere({ demoVisible: true }), { cityId }] },
      _count: { _all: true },
    }),
  ]);
  return cityTypeCounts(
    rows.map((row) => ({ dealType: row.dealType, isDemo: row.isDemo, count: row._count._all })),
    settings.demoDataVisible,
  );
});

/**
 * Every city page (each active city × the four types), for the sitemap — contract (1):
 * `realCount` = LIVE, public, non-demo listings of that city and type; `indexable` = realCount >= 3;
 * `updatedAt` = when the newest of them was published or last changed (null without any).
 * In the admins' city order, then CITY_PAGE_TYPES order. Only cities whose slug can have pages.
 */
export async function listCityPages(): Promise<CityPageEntry[]> {
  const cities = await getCityPageCities();
  if (cities.length === 0) return [];
  const rows = await db.listing.groupBy({
    by: ["cityId", "dealType"],
    where: { AND: [publicListingWhere({ demoVisible: false }), { cityId: { in: cities.map((city) => city.id) } }] },
    _count: { _all: true },
    _max: { contentUpdatedAt: true, publishedAt: true },
  });

  const found = new Map<string, { count: number; updatedAt: Date | null }>();
  for (const row of rows) {
    if (!row.cityId) continue;
    const key = `${row.cityId}|${cityPageTypeForDealType(row.dealType)}`;
    const prev = found.get(key) ?? { count: 0, updatedAt: null };
    found.set(key, {
      count: prev.count + row._count._all,
      updatedAt: laterDate(prev.updatedAt, laterDate(row._max.contentUpdatedAt, row._max.publishedAt)),
    });
  }

  return cities.flatMap((city) =>
    CITY_PAGE_TYPES.map((type: CityPageType): CityPageEntry => {
      const entry = found.get(`${city.id}|${type}`);
      const realCount = entry?.count ?? 0;
      return { citySlug: city.slug, type, realCount, indexable: isIndexable(realCount), updatedAt: entry?.updatedAt ?? null };
    }),
  );
}
