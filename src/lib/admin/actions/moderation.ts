"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action";
import { MODERATION_REASONS } from "@/lib/listing/fields";
import { approveListing, rejectListing, requestChanges, restoreHiddenListing } from "@/lib/listing/lifecycle";
import { ADMIN_TEXT_LIMITS } from "../reasons";
import { runStaffAction } from "../server/common";
import { nextInReview } from "../server/moderation";

/**
 * Moderation queue actions (staff with the "moderation" permission). The lifecycle functions
 * write the audit entries ("listing.approve", "listing.request_changes", "listing.reject",
 * "listing.restore") and email the owner in their own language.
 */

type Result = ActionResult<{ status: string; changed: boolean; next: { id: string; publicId: number } | null }>;

const idSchema = z.object({ listingId: z.string().min(1).max(64) });
const decisionSchema = idSchema.extend({
  reason: z.enum(MODERATION_REASONS),
  note: z
    .string()
    .trim()
    .max(ADMIN_TEXT_LIMITS.note)
    .optional()
    .transform((v) => v || null),
});

export async function approveListingAction(input: unknown): Promise<Result> {
  return runStaffAction("moderation", "listing.approve", async (staff) => {
    const parsed = idSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const result = await approveListing(parsed.data.listingId, staff.id);
    return ok({ ...result, next: await nextInReview(parsed.data.listingId) });
  });
}

export async function requestChangesAction(input: unknown): Promise<Result> {
  return runStaffAction("moderation", "listing.request_changes", async (staff) => {
    const parsed = decisionSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const { listingId, reason, note } = parsed.data;
    const result = await requestChanges(listingId, staff.id, reason, note);
    return ok({ ...result, next: await nextInReview(listingId) });
  });
}

export async function rejectListingAction(input: unknown): Promise<Result> {
  return runStaffAction("moderation", "listing.reject", async (staff) => {
    const parsed = decisionSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const { listingId, reason, note } = parsed.data;
    const result = await rejectListing(listingId, staff.id, reason, note);
    return ok({ ...result, next: await nextInReview(listingId) });
  });
}

export async function restoreListingAction(input: unknown): Promise<Result> {
  return runStaffAction("moderation", "listing.restore", async (staff) => {
    const parsed = idSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const result = await restoreHiddenListing(parsed.data.listingId, staff.id);
    return ok({ ...result, next: null });
  });
}
