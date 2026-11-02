import "server-only";
import { cache } from "react";
import type { JewishPlaceRecord } from "@/lib/jewish-life/places";
import { getCitiesWithPlaces, getJewishPlaces, type CityWithPlaces } from "@/lib/jewish-life/queries";

/** The page's Jewish places, loaded once per request (the photo cards count them; the map and list show them). */
export const loadPlaces = cache(async (): Promise<{ records: JewishPlaceRecord[]; cities: CityWithPlaces[] }> => {
  const [records, cities] = await Promise.all([getJewishPlaces(), getCitiesWithPlaces()]);
  return { records, cities };
});
