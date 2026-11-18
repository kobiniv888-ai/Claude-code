/** Pages that show a skeleton while a tapped link loads (layout/navigation-skeleton.tsx). */
export type SkeletonKind = "listing" | "booking";

/**
 * Which skeleton a link to `pathname` gets: a listing page (/he/listing/89-…), its booking review
 * (/he/listing/89-…/book), or none.
 */
export function skeletonKindOf(pathname: string): SkeletonKind | null {
  if (/^(?:\/[a-z]{2})?\/listing\/[^/]+\/?$/.test(pathname)) return "listing";
  if (/^(?:\/[a-z]{2})?\/listing\/[^/]+\/book\/?$/.test(pathname)) return "booking";
  return null;
}
