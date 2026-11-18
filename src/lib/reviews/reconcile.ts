import "server-only";
import { db } from "@/lib/db";
import { recountListingReviews } from "./service";

/** Listings repaired per run (the next run goes on). */
const RECONCILE_BATCH = 200;

/**
 * The daily repair of Listing.reviewCount / ratingSum (reviews-5; GET /api/cron/cleanup). They
 * change in the same transaction as each review, but a review can still disappear without them:
 * a hard-deleted account cascades its reviews (Review.guest / Review.host, onDelete: Cascade).
 * Finds the listings whose counters differ from their visible reviews — including listings with
 * counters and no review left — and recounts each (recountListingReviews, under the listing's
 * lock). No schema change: one grouped query.
 */
export async function reconcileReviewCounters(limit = RECONCILE_BATCH): Promise<{ checked: number; fixed: number }> {
  const drifted = await db.$queryRaw<{ id: string }[]>`
    SELECT l."id" FROM "Listing" l
    LEFT JOIN (
      SELECT "listingId", count(*)::int AS "n", coalesce(sum("rating"), 0)::int AS "s"
      FROM "Review" WHERE "hidden" = false GROUP BY "listingId"
    ) r ON r."listingId" = l."id"
    WHERE l."reviewCount" <> coalesce(r."n", 0) OR l."ratingSum" <> coalesce(r."s", 0)
    LIMIT ${limit}`;
  for (const row of drifted) await recountListingReviews(row.id);
  if (drifted.length > 0) console.warn(`[reviews] repaired the review counters of ${drifted.length} listing(s)`);
  return { checked: drifted.length, fixed: drifted.length };
}
