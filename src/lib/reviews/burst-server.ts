import "server-only";
import { db } from "@/lib/db";
import { recordSecurityEvent } from "@/lib/security/events";
import { REVIEW_BURST_HOURS, isReviewBurst, reviewBurstNote } from "./burst";

const HOUR_MS = 3600 * 1000;

/**
 * After a new review (SECURITY_REPORT 14.5.b): when the listing got REVIEW_BURST_COUNT reviews in
 * REVIEW_BURST_HOURS, a `review_burst` security event and one automatic report (no reporter,
 * reason OTHER, Admin → Reports) per listing and window. Best effort: never fails the review.
 * Returns true when it flagged.
 */
export async function checkReviewBurst(listingId: string, now: Date = new Date()): Promise<boolean> {
  try {
    const since = new Date(now.getTime() - REVIEW_BURST_HOURS * HOUR_MS);
    const count = await db.review.count({ where: { listingId, createdAt: { gte: since } } });
    if (!isReviewBurst(count)) return false;
    const open = await db.report.findFirst({
      where: { targetType: "LISTING", listingId, reporterId: null, createdAt: { gte: since }, details: { startsWith: "auto · review_burst" } },
      select: { id: true },
    });
    if (open) return false;
    const listing = await db.listing.findUnique({ where: { id: listingId }, select: { ownerId: true } });
    // The listing's owner, not the last reviewer: the IP of this request says nothing about the burst.
    await recordSecurityEvent({ type: "review_burst", userId: listing?.ownerId ?? null, ip: null, meta: { count, hours: REVIEW_BURST_HOURS } });
    await db.report.create({ data: { targetType: "LISTING", listingId, reporterId: null, reason: "OTHER", details: reviewBurstNote(count), priority: "NORMAL" } });
    return true;
  } catch (error) {
    console.error("[reviews] review burst check failed:", (error as Error)?.name ?? "error");
    return false;
  }
}
