/**
 * Pure helpers for the home page (client-safe, no database).
 *
 * "Recommended places" (brief round 2, 5.2) is one carousel: the promoted listings first (paid or
 * hand-picked, in the admins' order), then the newest ones, without duplicates.
 *
 *   mergeRecommended([a, b], [b, c, d], 3) → [a, b, c]
 */

/** Cards in "Recommended places". Each card is ~15–18 KB of HTML; "All" opens the search. */
export const HOME_RECOMMENDED_CARDS = 6;

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
