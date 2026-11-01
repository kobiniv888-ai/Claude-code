import "server-only";
import type { AppLocale } from "@/config/site";
import type { CommunityPlace } from "@/lib/map/community";
import { getCommunityPlaces } from "@/lib/map/community-queries";
import { placesNear } from "./helpers";

export type NearbyCommunityPlace = CommunityPlace & { meters: number; minutes: number };

/** How far around the listing's approximate point the map shows synagogues and kosher places. */
const RADIUS_METERS = 2500;
const LIMIT = 12;

/**
 * Synagogues, Chabad houses and kosher places near the listing's PUBLIC (approximate) point, for
 * the location map. Public data only (the Jewish-life places); demo places only while demo data
 * is visible (getJewishPlaces decides). Never throws: the map just shows the area without them.
 */
export async function getCommunityPlacesNear(
  point: { lat: number; lng: number } | null,
  locale: AppLocale,
): Promise<NearbyCommunityPlace[]> {
  if (!point) return [];
  try {
    const places = await getCommunityPlaces(locale);
    return placesNear(places, point, { radiusMeters: RADIUS_METERS, limit: LIMIT });
  } catch (error) {
    console.error("[listing] community places failed", error);
    return [];
  }
}
