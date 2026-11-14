/**
 * Pure helpers for the home page (client-safe, no database).
 *
 * "Recommended places" (brief round 2, 5.2; round 3, brief 4) is one carousel of the selected tab's
 * deal type: the promoted listings first (paid or hand-picked, in the admins' order), then the
 * newest ones, without duplicates.
 *
 *   mergeRecommended([a, b], [b, c, d], 3) → [a, b, c]
 */

import type { SearchBarDeal } from "@/lib/search/search-bar";

/** Cards in "Recommended places". Each card is ~15–18 KB of HTML; "All" opens the search. */
export const HOME_RECOMMENDED_CARDS = 6;

/**
 * The home tab the page opens on (round 3, brief 3 and 4): "Recommended places" shows only the
 * selected tab's type, so no sale listing sits among nightly stays. The server renders this tab's
 * row; the others load when the visitor switches.
 */
export const HOME_DEFAULT_DEAL: SearchBarDeal = "short-stay";

export function mergeRecommended<T extends { id: string }>(promoted: T[], newest: T[], limit = HOME_RECOMMENDED_CARDS): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const item of [...promoted, ...newest]) {
    if (merged.length >= limit) break;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

/** Cities that have at least one public listing, in the given order. */
export function citiesWithListings<T extends { count: number }>(cities: T[]): T[] {
  return cities.filter((city) => city.count > 0);
}
