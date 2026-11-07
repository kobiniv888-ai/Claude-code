/**
 * City slugs (round 3, phase 6), on their own with no imports so the admin's city form can use them
 * without loading the search code. Re-exported by ./core.ts.
 */

/** City slugs are lower-case Latin words joined by single dashes ("batumi", "old-tbilisi"). */
const CITY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** The longest city slug (the admin's city form allows no longer one: admin/content/schemas.ts). */
export const MAX_CITY_SLUG_LENGTH = 60;

/**
 * Names a city slug can never take: every fixed segment directly under /<locale>/ (src/app/[locale]
 * and its (site) group). "/he/hotels" is the static route, so a city "hotels" would have a broken
 * overview, and "/he/post/short-stays" would land on the private post form. A unit test keeps this
 * list in step with the folders (core.test.ts).
 */
export const RESERVED_CITY_SLUGS: ReadonlySet<string> = new Set([
  // src/app/[locale]
  "admin",
  "dev",
  "opengraph-image",
  // src/app/[locale]/(site)
  "about",
  "account",
  "buy",
  "contact",
  "help",
  "hotels",
  "how-it-works",
  "jewish-life",
  "legal",
  "listing",
  "lists",
  "login",
  "owner",
  "photo-credits",
  "post",
  "rent",
  "safety",
  "saved",
  "search",
  "two-factor",
  "unsubscribe",
  "verify-phone",
]);

/** Cheap shape check before any lookup: "/he/WHATEVER" or "/he/a%20b" never reach the database. */
export function isCitySlugShape(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_CITY_SLUG_LENGTH && CITY_SLUG.test(value);
}

/**
 * A slug that can have city pages: the right shape and not a reserved name. Cities without one
 * (only an admin could give it) get no pages, no sitemap entry and no footer link (seo-6).
 */
export function isCityPageSlug(value: unknown): value is string {
  return isCitySlugShape(value) && !RESERVED_CITY_SLUGS.has(value);
}
