import "server-only";
import { db } from "@/lib/db";
import { publicListingWhere } from "@/lib/listing/where";

/**
 * Does another live, public, real listing in the same city have the same title (ignoring case and
 * surrounding spaces)? Then the listing's <title> adds its public ID (listingMetaTitle, seo-10).
 * One count on the indexed (status, cityId) columns; false if the query fails, so the page's
 * metadata never breaks over it.
 */
export async function sameTitleInCity(listing: { id: string; citySlug: string; title: string }): Promise<boolean> {
  const title = listing.title.trim();
  if (!title) return false;
  try {
    const others = await db.listing.count({
      where: {
        AND: [
          publicListingWhere({ demoVisible: false }),
          { id: { not: listing.id }, city: { slug: listing.citySlug }, title: { equals: title, mode: "insensitive" } },
        ],
      },
    });
    return others > 0;
  } catch (error) {
    console.error("[listing] same-title check failed", error);
    return false;
  }
}
