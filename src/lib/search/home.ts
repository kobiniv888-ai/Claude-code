import "server-only";
import { cache } from "react";
import type { AppLocale } from "@/config/site";
import { db } from "@/lib/db";
import { DEFAULT_TIME_ZONE } from "@/lib/format";
import { pickLocalized } from "@/i18n/locale";
import { getHolidaysInRange } from "@/lib/hebcal";
import { todayIn } from "@/lib/jewish-life/calendar";
import { publicListingWhere } from "@/lib/listing/where";
import { getCities, getCityBySlug, getNeighborhoodBySlug } from "@/lib/places";
import { HOLIDAY_MONTHS_AHEAD, addMonthsToDay, toHolidayMarks, type HolidayMark } from "@/lib/search/holiday-marks";
import { getSettings } from "@/lib/settings";

/**
 * Server data for the home page and the search bar: popular cities with their live listing
 * counts, the holidays the date picker marks, and place names for a search.
 */

export type PopularCity = {
  slug: string;
  name: string;
  photoUrl: string | null;
  /** Public (LIVE) listings in the city. */
  count: number;
};

/** Public listings per city id. */
export const getCityListingCounts = cache(async (): Promise<Map<string, number>> => {
  const settings = await getSettings();
  const rows = await db.listing.groupBy({
    by: ["cityId"],
    where: publicListingWhere({ demoVisible: settings.demoDataVisible, now: new Date() }),
    _count: { _all: true },
  });
  return new Map(rows.flatMap((row) => (row.cityId ? [[row.cityId, row._count._all] as const] : [])));
});

/** Cities marked "popular" by the admins, in their order, with names in `locale`. */
export const getPopularCities = cache(async (locale: AppLocale): Promise<PopularCity[]> => {
  const [cities, counts] = await Promise.all([getCities(), getCityListingCounts()]);
  return cities
    .filter((city) => city.isPopular)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((city) => ({
      slug: city.slug,
      name: pickLocalized(city.names, locale),
      photoUrl: city.photoUrl,
      count: counts.get(city.id) ?? 0,
    }));
});

/** Holidays for the next 18 months, one mark per day, for the date pickers. */
export const getHolidayMarks = cache(async (locale: AppLocale): Promise<HolidayMark[]> => {
  const start = todayIn(DEFAULT_TIME_ZONE);
  try {
    const holidays = await getHolidaysInRange(start, addMonthsToDay(start, HOLIDAY_MONTHS_AHEAD), locale);
    return toHolidayMarks(holidays);
  } catch (error) {
    console.error("[search] could not list holidays:", error);
    return [];
  }
});

/** City and neighborhood names (in `locale`) for the place in a search, or nulls. */
export async function getPlaceNames(
  citySlug: string | null,
  neighborhoodSlug: string | null,
  locale: AppLocale,
): Promise<{ city: string | null; neighborhood: string | null }> {
  if (!citySlug) return { city: null, neighborhood: null };
  const [city, neighborhood] = await Promise.all([
    getCityBySlug(citySlug),
    neighborhoodSlug ? getNeighborhoodBySlug(citySlug, neighborhoodSlug) : Promise.resolve(null),
  ]);
  return {
    city: city ? pickLocalized(city.names, locale) : null,
    neighborhood: neighborhood ? pickLocalized(neighborhood.names, locale) : null,
  };
}
