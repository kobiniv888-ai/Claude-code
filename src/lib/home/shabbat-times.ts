import "server-only";
import type { AppLocale } from "@/config/site";
import { getShabbatTimes, type GeoPoint, type ShabbatTimes } from "@/lib/hebcal";

/**
 * This week's Shabbat times per place, computed once a day (and again after Havdalah, when the
 * coming Shabbat changes). The home city cards and the Shabbat countdown card read it on every
 * request, so it must not run @hebcal/core each time.
 *
 *   const times = await cachedShabbatTimes("tbilisi", city, locale);
 */
const cache = new Map<string, { day: string; times: ShabbatTimes }>();
const MAX_ENTRIES = 200;

export async function cachedShabbatTimes(
  key: string,
  place: GeoPoint,
  locale: AppLocale,
  now: Date = new Date(),
): Promise<ShabbatTimes> {
  const day = now.toISOString().slice(0, 10);
  const cacheKey = `${key}:${locale}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.day === day && !(hit.times.havdalah && now.getTime() >= hit.times.havdalah.getTime())) {
    return hit.times;
  }
  const times = await getShabbatTimes(place, locale, now);
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(cacheKey, { day, times });
  return times;
}
