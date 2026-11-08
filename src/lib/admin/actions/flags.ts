"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action";
import { auditOrThrow } from "@/lib/audit";
import { clearNoShow } from "@/lib/booking/service";
import { db } from "@/lib/db";
import { bookingFlagKind, FLAG_NOTE_MAX } from "../flags";
import { AdminActionError, runStaffAction } from "../server/common";
import { hostFlagSummary } from "../server/flags";
import { GUEST_FLAG_REVIEWED_ACTION, guestFlagSummary, LONG_STAY_REVIEWED_ACTION, longStayReview } from "../server/guest-flags";

/**
 * Admin → Flags: "mark reviewed" with a note ("moderation" permission). A booking flag stores
 * Booking.flagReviewedAt / flagReviewedById; a host's report flag stores User.hostFlagReviewedAt
 * (it opens again when a new report arrives). The note is kept in the audit log only.
 *
 * Nobody reviews a flag about themselves (their own booking as host or guest, their own host
 * flag), ADMIN included: a flag is about trust. And "mark host reviewed" covers only the reports
 * the staff member saw: `seenLatest` is the newest report on their page, and a newer one refuses.
 *
 * "Clear the no-show report" (round 3 phase-5 hardening): a host's "didn't arrive" that was wrong
 * (the guest stayed and wrote to us) is undone from the booking's admin page — the booking is
 * CONFIRMED / COMPLETED again, so the guest can review the stay. Same rules, with a note, logged as
 * booking.no_show_cleared.
 *
 * Guest flags (founder's decision 7, Q14; src/lib/admin/server/guest-flags.ts): "mark reviewed" on
 * a long stay or on a guest with repeated cancellations / no-shows writes ONLY an audit entry
 * (D11 a): it changes nothing for the guest, it just moves the row to the reviewed list. A new
 * counting event reopens a guest's flag; `seenLatest` refuses like the host flag.
 *
 * Every "mark reviewed" is written with its audit row in one transaction, or not at all (Q13,
 * src/lib/audit.ts auditOrThrow); for the guest flags the audit row IS the marker.
 */

const note = z.string().trim().min(2).max(FLAG_NOTE_MAX);
const bookingSchema = z.object({ bookingId: z.string().min(1).max(64), note });
const hostSchema = z.object({ userId: z.string().min(1).max(64), note, seenLatest: z.iso.datetime().nullable().optional() });
const guestSchema = hostSchema;

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
      const changed = await db.$transaction(async (tx) => {
        const { count } = await tx.booking.updateMany({
          where: { id: booking.id, flagReviewedAt: null },
          data: { flagReviewedAt: new Date(), flagReviewedById: staff.id },
        });
        if (count === 0) return false;
        await auditOrThrow(
          {
            actorId: staff.id,
            action: "flag.booking_reviewed",
            targetType: "Booking",
            targetId: booking.id,
            details: { code: booking.code, kind, hostUserId: booking.hostUserId, note: parsed.data.note },
          },
          tx,
        );
        return true;
      });
      return ok({ changed });
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
      await db.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { hostFlagReviewedAt: now } });
        await auditOrThrow(
          {
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
          },
          tx,
        );
      });
      return ok({ changed: true });
    },
    { limit: 60, windowSeconds: 60 },
  );
}

export async function clearNoShowAction(input: unknown): Promise<ActionResult<{ status: "CONFIRMED" | "COMPLETED" }>> {
  return runStaffAction<{ status: "CONFIRMED" | "COMPLETED" }>(
    "moderation",
    "flags.no_show_cleared",
    async (staff) => {
      const parsed = bookingSchema.safeParse(input);
      if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
      const booking = await db.booking.findUnique({
        where: { id: parsed.data.bookingId },
        select: { id: true, code: true, status: true, hostUserId: true, guestUserId: true },
      });
      if (!booking) throw new AdminActionError("booking_not_found", 404);
      if (booking.hostUserId === staff.id || booking.guestUserId === staff.id) throw new AdminActionError("not_allowed_on_self", 403);
      if (booking.status !== "NO_SHOW") throw new AdminActionError("not_flagged", 409);
      // Q13: the change and its audit row commit together, or not at all.
      const result = await clearNoShow({
        bookingId: booking.id,
        staffId: staff.id,
        inTransaction: (tx, cleared) =>
          auditOrThrow(
            {
              actorId: staff.id,
              action: "booking.no_show_cleared",
              targetType: "Booking",
              targetId: booking.id,
              details: { code: booking.code, status: cleared.status, reportedAt: cleared.reportedAt, hostUserId: booking.hostUserId, note: parsed.data.note },
            },
            tx,
          ),
      });
      return ok({ status: result.status });
    },
    { limit: 60, windowSeconds: 60 },
  );
}

export async function markLongStayReviewedAction(input: unknown): Promise<ActionResult<{ changed: boolean }>> {
  return runStaffAction<{ changed: boolean }>(
    "moderation",
    "flags.long_stay_reviewed",
    async (staff) => {
      const parsed = bookingSchema.safeParse(input);
      if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
      const booking = await db.booking.findUnique({
        where: { id: parsed.data.bookingId },
        select: { id: true, code: true, nights: true, hostUserId: true, guestUserId: true },
      });
      if (!booking) throw new AdminActionError("booking_not_found", 404);
      if (booking.hostUserId === staff.id || booking.guestUserId === staff.id) throw new AdminActionError("not_allowed_on_self", 403);
      const state = await longStayReview(booking.id);
      if (!state) throw new AdminActionError("not_flagged", 409);
      if (state.reviewedAt) return ok({ changed: false });
      // The audit row is the "reviewed" marker (D11 a): no row, no review.
      await auditOrThrow({
        actorId: staff.id,
        action: LONG_STAY_REVIEWED_ACTION,
        targetType: "Booking",
        targetId: booking.id,
        details: { code: booking.code, nights: booking.nights, guestUserId: booking.guestUserId, hostUserId: booking.hostUserId, note: parsed.data.note },
      });
      return ok({ changed: true });
    },
    { limit: 60, windowSeconds: 60 },
  );
}

export async function markGuestFlagReviewedAction(input: unknown): Promise<ActionResult<{ changed: boolean }>> {
  return runStaffAction<{ changed: boolean }>(
    "moderation",
    "flags.guest_reviewed",
    async (staff) => {
      const parsed = guestSchema.safeParse(input);
      if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
      if (parsed.data.userId === staff.id) throw new AdminActionError("not_allowed_on_self", 403);
      const summary = await guestFlagSummary(parsed.data.userId);
      if (!summary) throw new AdminActionError("not_flagged", 409);
      if (!summary.open) return ok({ changed: false });
      // A cancellation or no-show that arrived after the page was opened: look again first.
      const seen = parsed.data.seenLatest ? new Date(parsed.data.seenLatest) : null;
      if (summary.latestAt && (!seen || summary.latestAt.getTime() > seen.getTime())) throw new AdminActionError("changed_since_view", 409);
      await auditOrThrow({
        actorId: staff.id,
        action: GUEST_FLAG_REVIEWED_ACTION,
        targetType: "User",
        targetId: summary.id,
        details: { note: parsed.data.note, cancellations: summary.cancellations, noShows: summary.noShows, reasons: summary.reasons, previousReviewAt: summary.reviewedAt },
      });
      return ok({ changed: true });
    },
    { limit: 60, windowSeconds: 60 },
  );
}
