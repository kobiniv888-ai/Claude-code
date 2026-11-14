import "server-only";
import type { AppLocale } from "@/config/site";
import { pickLocalized } from "@/i18n/locale";
import { db } from "@/lib/db";
import { getCities } from "@/lib/places";
import type { ViewedItem } from "@/lib/recently-viewed/core";
import { getAccountViews } from "@/lib/recently-viewed/server";

/**
 * What the server knows for "המשך מאיפה שעצרתם" (round 3, brief 4). For a signed-in visitor: the
 * account's recently viewed places (newest first) and how many places they saved. Guests' history
 * lives on their device, so for them it is empty and the browser fills the block.
 */
export async function getContinueData(userId: string | null): Promise<{ recent: ViewedItem[] | null; savedCount: number }> {
  if (!userId) return { recent: null, savedCount: 0 };
  const [recent, savedCount] = await Promise.all([
    getAccountViews(userId),
    // Every saved place, like the saved page (which also lists the ones no longer available).
    db.favorite.count({ where: { userId } }),
  ]);
  return { recent, savedCount };
}

/** City names in this language by slug (the last search names its city in the page's language). */
export async function getCityNames(locale: AppLocale): Promise<Record<string, string>> {
  const cities = await getCities();
  return Object.fromEntries(cities.map((city) => [city.slug, pickLocalized(city.names, locale)]));
}
