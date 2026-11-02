import "server-only";
import { cache } from "react";
import type { AppLocale } from "@/config/site";
import { pickLocalized } from "@/i18n/locale";
import { formatTime } from "@/lib/format";
import { getCities } from "@/lib/places";
import { getCityListingCounts } from "@/lib/search/home";
import { cachedShabbatTimes } from "./shabbat-times";

/** A city card of "Where to?": live listing count and this week's Shabbat tag. */
export type HomeCity = {
  slug: string;
  name: string;
  /** The city photo from the database (used when the photo registry has none for the slug). */
  photoUrl: string | null;
  /** Public (LIVE) listings in the city. */
  count: number;
  /** "in" = candle lighting ahead; "out" = it is Shabbat now, this is when it ends. */
  shabbat: { kind: "in" | "out"; time: string } | null;
};

/**
 * The popular cities (all active cities when none is marked popular), in the admins' order, with
 * their real listing counts and Shabbat times in the city's own time zone.
 */
export const getHomeCities = cache(async (locale: AppLocale, now: Date = new Date()): Promise<HomeCity[]> => {
  const [cities, counts] = await Promise.all([getCities(), getCityListingCounts()]);
  const popular = cities.filter((city) => city.isPopular);
  const list = [...(popular.length > 0 ? popular : cities)].sort((a, b) => a.sortOrder - b.sortOrder);

  return Promise.all(
    list.map(async (city): Promise<HomeCity> => {
      let shabbat: HomeCity["shabbat"] = null;
      try {
        const times = await cachedShabbatTimes(city.slug, city, locale, now);
        const during = times.candleLighting !== null && times.candleLighting.getTime() <= now.getTime();
        const at = during ? times.havdalah : times.candleLighting;
        if (at) shabbat = { kind: during ? "out" : "in", time: formatTime(at, locale, city.timezone) };
      } catch (error) {
        console.error(`[home] no Shabbat times for ${city.slug}:`, error);
      }
      return {
        slug: city.slug,
        name: pickLocalized(city.names, locale),
        photoUrl: city.photoUrl,
        count: counts.get(city.id) ?? 0,
        shabbat,
      };
    }),
  );
});
