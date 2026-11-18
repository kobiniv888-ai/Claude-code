import "server-only";
import type { AppLocale } from "@/config/site";
import { getJewishPlaces } from "@/lib/jewish-life/queries";
import { COMMUNITY_PLACE_TYPES, toCommunityPlace, type CommunityPlace } from "./community";

/**
 * The places of the map's "Jewish community" layer: active synagogues, Chabad houses and kosher
 * places — demo ones only while the "demo data visible" setting is on (getJewishPlaces decides).
 */
export async function getCommunityPlaces(locale: AppLocale): Promise<CommunityPlace[]> {
  const records = await getJewishPlaces({ types: COMMUNITY_PLACE_TYPES });
  return records.map((record) => toCommunityPlace(record, locale)).filter((place): place is CommunityPlace => place !== null);
}
