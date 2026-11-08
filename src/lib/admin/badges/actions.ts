"use server";

import { flattenError } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action";
import { audit, auditOrThrow } from "@/lib/audit";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";
import { runStaffAction } from "../server/common";
import {
  canSetVisited,
  clearVisitSchema,
  setVisitSchema,
  visitDateErrorCode,
  visitDateProblem,
  visitRefusal,
} from "./rules";
import { latestVisitSnapshot, VISIT_CLEAR_ACTION, VISIT_SET_ACTION, visitSnapshot, visitTodayFor } from "./server";

/**
 * Admin → Badges: set or clear "ביקרנו במקום" (round 3, brief 8.3). ADMIN only (moderators see
 * the page read-only); demo listings are refused; every change is audited with the previous
 * values. The internal note goes to Listing.visitedNote and the audit entry, both staff-only.
 *
 * Saving the same visit date again is an EDIT (a typo in the note): the place is not visited
 * again, so the snapshot of the visit is copied (the "changed since the visit" warning stays) and
 * an old visit can still be edited (only a new date must be within the last two years).
 */

const LIMIT = { limit: 60, windowSeconds: 60 };

const dayString = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

export async function setVisitedAction(input: unknown): Promise<ActionResult<{ visitedOn: string }>> {
  return runStaffAction<{ visitedOn: string }>(
    "moderation",
    "listing.visited",
    async (staff) => {
      if (!canSetVisited(staff.role)) throw new ForbiddenError("Only an admin sets the visited badge");
      const parsed = setVisitSchema.safeParse(input);
      if (!parsed.success) return fail("invalid_input", flattenError(parsed.error).fieldErrors);
      const { listingId, visitedOn, note } = parsed.data;

      const listing = await db.listing.findUnique({
        where: { id: listingId },
        select: {
          id: true,
          publicId: true,
          isDemo: true,
          deletedAt: true,
          status: true,
          countryCode: true,
          visitedAt: true,
          visitedNote: true,
          visitedById: true,
          owner: { select: { isDemo: true } },
        },
      });
      const refusal = visitRefusal(listing);
      if (refusal || !listing) return fail(refusal ?? "listing_not_found");
      const edit = !!listing.visitedAt && dayString(listing.visitedAt) === visitedOn;
      const problem = visitDateProblem(visitedOn, visitTodayFor(listing.countryCode));
      if (problem && !(edit && problem === "too_old")) return fail(visitDateErrorCode(problem));

      const snapshot = (edit ? await latestVisitSnapshot(listing.id) : null) ?? (await visitSnapshot(listing.id));
      await db.listing.update({
        where: { id: listing.id },
        data: { visitedAt: new Date(`${visitedOn}T00:00:00.000Z`), visitedNote: note, visitedById: staff.id },
      });
      await audit({
        actorId: staff.id,
        action: VISIT_SET_ACTION,
        targetType: "Listing",
        targetId: listing.id,
        details: {
          publicId: listing.publicId,
          visitedOn,
          note,
          previous: listing.visitedAt
            ? { visitedOn: dayString(listing.visitedAt), note: listing.visitedNote, enteredById: listing.visitedById }
            : null,
          snapshot,
          ...(edit ? { edit: true } : {}),
        },
      });
      return ok({ visitedOn });
    },
    LIMIT,
  );
}

export async function clearVisitedAction(input: unknown): Promise<ActionResult<{ cleared: boolean }>> {
  return runStaffAction<{ cleared: boolean }>(
    "moderation",
    "listing.visited",
    async (staff) => {
      if (!canSetVisited(staff.role)) throw new ForbiddenError("Only an admin clears the visited badge");
      const parsed = clearVisitSchema.safeParse(input);
      if (!parsed.success) return fail("invalid_input", flattenError(parsed.error).fieldErrors);
      const { listingId, note } = parsed.data;

      const listing = await db.listing.findUnique({
        where: { id: listingId },
        select: { id: true, publicId: true, visitedAt: true, visitedNote: true, visitedById: true },
      });
      if (!listing) return fail("listing_not_found");
      if (!listing.visitedAt) return ok({ cleared: false });

      // Removing the badge (Q13): the change and its audit row (with the previous values) commit
      // together, or not at all.
      await db.$transaction(async (tx) => {
        await tx.listing.update({ where: { id: listing.id }, data: { visitedAt: null, visitedNote: null, visitedById: null } });
        await auditOrThrow(
          {
            actorId: staff.id,
            action: VISIT_CLEAR_ACTION,
            targetType: "Listing",
            targetId: listing.id,
            details: {
              publicId: listing.publicId,
              note: note || null,
              previous: { visitedOn: dayString(listing.visitedAt), note: listing.visitedNote, enteredById: listing.visitedById },
            },
          },
          tx,
        );
      });
      return ok({ cleared: true });
    },
    LIMIT,
  );
}
