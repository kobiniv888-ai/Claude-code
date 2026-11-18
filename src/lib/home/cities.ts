import "server-only";
import { cache } from "react";
import type { AppLocale } from "@/config/site";
import { pickLocalized } from "@/i18n/locale";
import { getCities } from "@/lib/places";
import { getCityListingCounts } from "@/lib/search/home";
import { citiesWithListings } from "./recommended";

/** A small city card of "Where to?": photo, name and the real number of public listings. */
export type HomeCity = {
  slug: string;
  name: string;
  /** The city photo from the database (used when the photo registry has none for the slug). */
  photoUrl: string | null;
  /** Public (LIVE) listings in the city. */
  count: number;
};

/**
 * The popular cities (all active cities when none is marked popular), in the admins' order, with
 * their real listing counts. Cities without a public listing are left out (their card would open
 * an empty results page). No Shabbat times here (brief round 2, 4): they live on /jewish-life.
 */
export const getHomeCities = cache(async (locale: AppLocale): Promise<HomeCity[]> => {
  const [cities, counts] = await Promise.all([getCities(), getCityListingCounts()]);
  const popular = cities.filter((city) => city.isPopular);
  const list = [...(popular.length > 0 ? popular : cities)].sort((a, b) => a.sortOrder - b.sortOrder);
  return citiesWithListings(
    list.map((city) => ({
      slug: city.slug,
      name: pickLocalized(city.names, locale),
      photoUrl: city.photoUrl,
      count: counts.get(city.id) ?? 0,
    })),
  );
});
