"use server";

/**
 * Staff decisions about a review (round 3, brief 8.1), from Admin → Reports → "ביקורות": staff
 * with the "reports" permission (ADMIN, MODERATOR; SUPPORT only views) may HIDE a review that
 * breaks the rules — never edit it — with a reason code and a note, and show it again (with a
 * note). Both are written to the audit log (the review's entry, and "report.review_hidden" on each
 * report hiding it closed); the listing's counters change in the same transaction; the guest and
 * the host get an email naming the reason, never the note. Staff other than an ADMIN never decide
 * about a review they wrote or one about their own place. Rate-limited per staff member
 * (runStaffAction).
 */
import { after } from "next/server";
import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action";
import { AdminActionError, assertNotOwnItem, runStaffAction } from "@/lib/admin/server/common";
import { audit } from "@/lib/audit";
import { NotFoundError } from "@/lib/errors";
import { notifyReviewVisibility } from "./notify";
import { hideReviewSchema, showReviewSchema } from "./schemas";
import { hideReview, reviewParties, showReview } from "./service";

async function partiesOrThrow(reviewId: string) {
  const parties = await reviewParties(reviewId);
  if (!parties) throw new NotFoundError();
  return parties;
}

export async function hideReviewAction(input: unknown): Promise<ActionResult<{ hidden: boolean }>> {
  return runStaffAction("reports", "review.hide", async (staff) => {
    const parsed = hideReviewSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const { reviewId, reason, note } = parsed.data;
    const parties = await partiesOrThrow(reviewId);
    assertNotOwnItem(staff, [parties.guestUserId, parties.hostUserId]);
    if (parties.hidden) throw new AdminActionError("already_decided");
    const result = await hideReview({ staffId: staff.id, reviewId, reason, note });
    await audit({
      actorId: staff.id,
      action: "review.hide",
      targetType: "Review",
      targetId: reviewId,
      details: { reason, note, listingId: result.listingId, reports: result.closedReports },
    });
    for (const reportId of result.closedReports) {
      await audit({ actorId: staff.id, action: "report.review_hidden", targetType: "Report", targetId: reportId, details: { reviewId, reason, closed: true } });
    }
    after(() => notifyReviewVisibility(reviewId, "hidden"));
    return ok({ hidden: true });
  });
}

export async function showReviewAction(input: unknown): Promise<ActionResult<{ hidden: boolean }>> {
  return runStaffAction("reports", "review.show", async (staff) => {
    const parsed = showReviewSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const { reviewId, note } = parsed.data;
    const parties = await partiesOrThrow(reviewId);
    assertNotOwnItem(staff, [parties.guestUserId, parties.hostUserId]);
    if (!parties.hidden) throw new AdminActionError("already_decided");
    const result = await showReview({ reviewId });
    await audit({ actorId: staff.id, action: "review.show", targetType: "Review", targetId: reviewId, details: { note, listingId: result.listingId } });
    after(() => notifyReviewVisibility(reviewId, "shown"));
    return ok({ hidden: false });
  });
}
