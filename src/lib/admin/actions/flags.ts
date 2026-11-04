"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { bookingFlagKind, FLAG_NOTE_MAX } from "../flags";
import { AdminActionError, runStaffAction } from "../server/common";
import { hostFlagSummary } from "../server/flags";

/**
 * Admin → Flags: "mark reviewed" with a note ("moderation" permission). A booking flag stores
 * Booking.flagReviewedAt / flagReviewedById; a host's report flag stores User.hostFlagReviewedAt
 * (it opens again when a new report arrives). The note is kept in the audit log only.
 *
 * Nobody reviews a flag about themselves (their own booking as host or guest, their own host
 * flag), ADMIN included: a flag is about trust. And "mark host reviewed" covers only the reports
 * the staff member saw: `seenLatest` is the newest report on their page, and a newer one refuses.
 */

const note = z.string().trim().min(2).max(FLAG_NOTE_MAX);
const bookingSchema = z.object({ bookingId: z.string().min(1).max(64), note });
const hostSchema = z.object({ userId: z.string().min(1).max(64), note, seenLatest: z.iso.datetime().nullable().optional() });

export async function markBookingFlagReviewedAction(input: unknown): Promise<ActionResult<{ changed: boolean }>> {
  return runStaffAction<{ changed: boolean }>(
    "moderation",
    "flags.booking_reviewed",
    async (staff) => {
      const parsed = bookingSchema.safeParse(input);
      if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
      const booking = await db.booking.findUnique({
        where: { id: parsed.data.bookingId },
        select: { id: true, code: true, status: true, flaggedForReview: true, flagReviewedAt: true, hostUserId: true, guestUserId: true },
      });
      if (!booking) throw new AdminActionError("booking_not_found", 404);
      if (booking.hostUserId === staff.id || booking.guestUserId === staff.id) throw new AdminActionError("not_allowed_on_self", 403);
      const kind = bookingFlagKind(booking);
      if (!kind) throw new AdminActionError("not_flagged", 409);
      if (booking.flagReviewedAt) return ok({ changed: false });
      const { count } = await db.booking.updateMany({
        where: { id: booking.id, flagReviewedAt: null },
        data: { flagReviewedAt: new Date(), flagReviewedById: staff.id },
      });
      if (count === 0) return ok({ changed: false });
      await audit({
        actorId: staff.id,
        action: "flag.booking_reviewed",
        targetType: "Booking",
        targetId: booking.id,
        details: { code: booking.code, kind, hostUserId: booking.hostUserId, note: parsed.data.note },
      });
      return ok({ changed: true });
    },
    { limit: 60, windowSeconds: 60 },
  );
}

export async function markHostFlagReviewedAction(input: unknown): Promise<ActionResult<{ changed: boolean }>> {
  return runStaffAction<{ changed: boolean }>(
    "moderation",
    "flags.host_reviewed",
    async (staff) => {
      const parsed = hostSchema.safeParse(input);
      if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
      const user = await db.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true, hostFlagReviewedAt: true } });
      if (!user) throw new AdminActionError("user_not_found", 404);
      if (user.id === staff.id) throw new AdminActionError("not_allowed_on_self", 403);
      // Only an open report flag (or a report sanction) can be marked reviewed (a booking flag is
      // reviewed per booking).
      const summary = await hostFlagSummary(user.id);
      if (!summary || !(summary.reportFlagOpen || summary.sanctioned)) throw new AdminActionError("not_flagged", 409);
      // A report that arrived after the staff member's page was opened: they look again first.
      const seen = parsed.data.seenLatest ? new Date(parsed.data.seenLatest) : null;
      if (summary.latestReportAt && (!seen || summary.latestReportAt.getTime() > seen.getTime())) {
        throw new AdminActionError("changed_since_view", 409);
      }
      const now = new Date();
      await db.user.update({ where: { id: user.id }, data: { hostFlagReviewedAt: now } });
      await audit({
        actorId: staff.id,
        action: "flag.host_reviewed",
        targetType: "User",
        targetId: user.id,
        details: {
          note: parsed.data.note,
          previousReviewAt: user.hostFlagReviewedAt,
          reports: summary.countingReports,
          turnedAway: summary.turnedAway,
          sanctioned: summary.sanctioned,
        },
      });
      return ok({ changed: true });
    },
    { limit: 60, windowSeconds: 60 },
  );
}
