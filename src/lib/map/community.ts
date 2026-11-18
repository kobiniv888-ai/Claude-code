import { pickLocalized } from "@/i18n/locale";
import type { JewishPlaceRecord, JewishPlaceType } from "@/lib/jewish-life/places";

/**
 * The "Jewish community" layer of the search map (pure, client-safe): synagogues, Chabad houses
 * and kosher places from the Jewish Life places data. The data comes from GET /api/map/community.
 */

export const COMMUNITY_PLACE_TYPES = [
  "SYNAGOGUE",
  "CHABAD_HOUSE",
  "KOSHER_RESTAURANT",
  "KOSHER_SHOP",
] as const satisfies readonly JewishPlaceType[];

export type CommunityPlaceType = (typeof COMMUNITY_PLACE_TYPES)[number];

/** A community place with its texts already in the visitor's language. */
export type CommunityPlace = {
  id: string;
  type: CommunityPlaceType;
  name: string;
  cityName: string | null;
  lat: number;
  lng: number;
  isDemo: boolean;
};

export function isCommunityPlaceType(type: string): type is CommunityPlaceType {
  return (COMMUNITY_PLACE_TYPES as readonly string[]).includes(type);
}

/** A stored place → what the map needs (null for other types or a place without a usable point). */
export function toCommunityPlace(place: JewishPlaceRecord, locale: string): CommunityPlace | null {
  if (!isCommunityPlaceType(place.type)) return null;
  if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return null;
  const name = pickLocalized(place.names, locale).trim();
  if (!name) return null;
  const cityName = place.city ? pickLocalized(place.city.names, locale).trim() || null : null;
  return { id: place.id, type: place.type, name, cityName, lat: place.lat, lng: place.lng, isDemo: place.isDemo };
}
