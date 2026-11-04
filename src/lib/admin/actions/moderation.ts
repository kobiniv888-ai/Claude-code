"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action";
import { db } from "@/lib/db";
import { MODERATION_REASONS } from "@/lib/listing/fields";
import { approveListing, rejectListing, requestChanges, restoreHiddenListing } from "@/lib/listing/lifecycle";
import { ADMIN_TEXT_LIMITS } from "../reasons";
import { AdminActionError, assertNotOwnItem, runStaffAction } from "../server/common";
import { nextInReview } from "../server/moderation";

/**
 * Moderation queue actions (staff with the "moderation" permission). The lifecycle functions
 * write the audit entries ("listing.approve", "listing.request_changes", "listing.reject",
 * "listing.restore") and email the owner in their own language.
 *
 * Staff other than an ADMIN never decide about their own listing. Approve and restore send the
 * listing's contentUpdatedAt as the page showed it: when the host saved a change since, the
 * answer is "content_changed" and the moderator looks again (the lifecycle also re-runs the
 * automatic checks when the content changed since they last ran).
 */

type Result = ActionResult<{ status: string; changed: boolean; next: { id: string; publicId: number } | null }>;

const idSchema = z.object({ listingId: z.string().min(1).max(64) });
const seenSchema = idSchema.extend({ contentUpdatedAt: z.iso.datetime() });
const decisionSchema = idSchema.extend({
  reason: z.enum(MODERATION_REASONS),
  note: z
    .string()
    .trim()
    .max(ADMIN_TEXT_LIMITS.note)
    .optional()
    .transform((v) => v || null),
});

/** Refuses a decision on the staff member's own listing (ADMIN excepted). */
async function assertNotOwnListing(staff: Parameters<typeof assertNotOwnItem>[0], listingId: string) {
  const listing = await db.listing.findUnique({ where: { id: listingId }, select: { ownerId: true } });
  if (!listing) throw new AdminActionError("listing_not_found", 404);
  assertNotOwnItem(staff, [listing.ownerId]);
}

export async function approveListingAction(input: unknown): Promise<Result> {
  return runStaffAction("moderation", "listing.approve", async (staff) => {
    const parsed = seenSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    await assertNotOwnListing(staff, parsed.data.listingId);
    const result = await approveListing(parsed.data.listingId, staff.id, { contentUpdatedAt: new Date(parsed.data.contentUpdatedAt) });
    return ok({ ...result, next: await nextInReview(parsed.data.listingId) });
  });
}

export async function requestChangesAction(input: unknown): Promise<Result> {
  return runStaffAction("moderation", "listing.request_changes", async (staff) => {
    const parsed = decisionSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const { listingId, reason, note } = parsed.data;
    await assertNotOwnListing(staff, listingId);
    const result = await requestChanges(listingId, staff.id, reason, note);
    return ok({ ...result, next: await nextInReview(listingId) });
  });
}

export async function rejectListingAction(input: unknown): Promise<Result> {
  return runStaffAction("moderation", "listing.reject", async (staff) => {
    const parsed = decisionSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const { listingId, reason, note } = parsed.data;
    await assertNotOwnListing(staff, listingId);
    const result = await rejectListing(listingId, staff.id, reason, note);
    return ok({ ...result, next: await nextInReview(listingId) });
  });
}

export async function restoreListingAction(input: unknown): Promise<Result> {
  return runStaffAction("moderation", "listing.restore", async (staff) => {
    const parsed = seenSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    await assertNotOwnListing(staff, parsed.data.listingId);
    const result = await restoreHiddenListing(parsed.data.listingId, staff.id, { contentUpdatedAt: new Date(parsed.data.contentUpdatedAt) });
    return ok({ ...result, next: null });
  });
}
