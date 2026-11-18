/**
 * Which towns get "≈ 5 דק׳ הליכה לים" / "למעליות" (round 3, brief 7.3) and the thresholds, without
 * the map data: pure and tiny, so client code (filters, card tags) can import it. The walking
 * times themselves come from ./walk-targets (server only; it carries the OpenStreetMap points).
 *
 * Founder's answer 10: sea distances cover Batumi (with Gonio and Makhinjauri, which are Batumi
 * neighborhoods here) and Kobuleti. Ski lifts: Gudauri, Bakuriani and Mestia (Hatsvali, Tetnuldi).
 * Other coastal towns (Ureki, Shekvetili, Anaklia…) are not cities on the site yet.
 */

/** City slugs (City.slug) whose listings get a walking time to the nearest beach. */
export const SEA_TOWNS = ["batumi", "kobuleti"] as const;
/** City slugs whose listings get a walking time to the nearest ski lift. */
export const SKI_TOWNS = ["gudauri", "bakuriani", "mestia"] as const;

export type SeaTown = (typeof SEA_TOWNS)[number];
export type SkiTown = (typeof SKI_TOWNS)[number];

/** The card tag and the "קרוב לים" / "קרוב למעליות" filter: this many minutes or less. */
export const NEAR_WALK_MINUTES = 15;
/**
 * Beyond this many minutes the walking time is not stored (null): a longer walk is not a reason
 * to choose a place, and the straight-line estimate gets worse with distance.
 */
export const WALK_CAP_MINUTES = 30;

export function isSeaTown(citySlug: string | null | undefined): citySlug is SeaTown {
  return !!citySlug && (SEA_TOWNS as readonly string[]).includes(citySlug);
}

export function isSkiTown(citySlug: string | null | undefined): citySlug is SkiTown {
  return !!citySlug && (SKI_TOWNS as readonly string[]).includes(citySlug);
}

/** True when a stored walking time earns the card tag / matches the filter (≤ 15 minutes). */
export function isNearWalk(minutes: number | null | undefined): minutes is number {
  return typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0 && minutes <= NEAR_WALK_MINUTES;
}

/** The host's own "Near the sea" amenity (src/lib/listing/fields.ts). */
export const NEAR_SEA_AMENITY = "near_sea";

/**
 * The amenities to show for a listing (brief 7.3): once the listing has a pin, the computed walk
 * to the sea replaces the host's "Near the sea" tick, so the manual one is never shown (nor
 * filtered by, see where.ts). Without a pin the host's answer stays.
 */
export function displayAmenities<T extends string>(amenities: readonly T[], hasPin: boolean): T[] {
  return hasPin ? amenities.filter((key) => key !== NEAR_SEA_AMENITY) : [...amenities];
}
