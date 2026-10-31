/**
 * Link to a listing linked to a ticket. Follows the "/listing/<publicId>-<slug>" shape of
 * listingPath() in @/lib/listing/urls; the listing page redirects any slug to its canonical one.
 * (Private helper: the shared URL module did not exist yet when the help center was built.)
 */
export function ticketListingPath(publicId: number, title?: string | null): string {
  const slug = (title ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug ? `/listing/${publicId}-${slug}` : `/listing/${publicId}`;
}
