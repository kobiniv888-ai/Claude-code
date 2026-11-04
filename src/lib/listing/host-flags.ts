/**
 * Host flags (round 3, brief 8.2 "automatic flags" and 9 "Flags"): the rules, pure and client-safe
 * so each one is unit-tested. The queries are in ./host-flags-server.ts (the flagged-host check the
 * review rule uses) and src/lib/admin/server/flags.ts (the Admin → Flags lists). They live here,
 * not in src/lib/admin, because the listing lifecycle (reached from public pages) uses them.
 *
 * Three lists:
 *   - host cancellations: Booking.flaggedForReview (the host cancelled within 48 hours of the
 *     booking, or the guest said "the host asked me to cancel"; src/lib/booking/policy.ts);
 *   - no-shows: Booking.status NO_SHOW, reported by the host about the guest. LISTED ONLY: a
 *     no-show never flags the guest or the host (founder's default);
 *   - hosts with several reports: at least HOST_REPORT_FLAG_MIN reports against the host or
 *     their listings in the last HOST_REPORT_WINDOW_DAYS days, dismissed ones left out. Reports
 *     about a review (target REVIEW) are the host's own reports about a guest and never count.
 *
 * A booking flag is open until staff mark it reviewed (Booking.flagReviewedAt). A host's report
 * flag is open while the host has enough counting reports AND at least one of them arrived after
 * staff last marked the host reviewed (User.hostFlagReviewedAt): a new report brings it back.
 *
 * A FLAGGED HOST (an open report flag, or an open host-cancellation flag on one of their bookings)
 * has every NEW listing wait for review (./review-rule.ts).
 */

export const HOST_REPORT_FLAG_MIN = 2;
export const HOST_REPORT_WINDOW_DAYS = 365;
export const FLAG_NOTE_MAX = 1000;

const DAY_MS = 24 * 3600 * 1000;

/** The first moment a report still counts toward a host flag. */
export function hostReportWindowStart(now: Date): Date {
  return new Date(now.getTime() - HOST_REPORT_WINDOW_DAYS * DAY_MS);
}

export type FlagReport = {
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  targetType: "LISTING" | "USER" | "MESSAGE" | "REVIEW";
  createdAt: Date;
};

/** Does this report count toward its host's flag? Not dismissed, not about a review, in the window. */
export function reportCountsForHostFlag(report: FlagReport, now: Date): boolean {
  if (report.status === "DISMISSED" || report.targetType === "REVIEW") return false;
  return report.createdAt >= hostReportWindowStart(now) && report.createdAt <= now;
}

/**
 * Is a host's report flag open? `reportCount` and `latestReportAt` are over the counting reports
 * only (see reportCountsForHostFlag); `reviewedAt` is User.hostFlagReviewedAt.
 */
export function hostReportFlagOpen(input: { reportCount: number; latestReportAt: Date | null; reviewedAt: Date | null }): boolean {
  if (input.reportCount < HOST_REPORT_FLAG_MIN || !input.latestReportAt) return false;
  return !input.reviewedAt || input.latestReportAt > input.reviewedAt;
}

/** The same rule from the report rows themselves. */
export function hostReportFlagFromReports(reports: readonly FlagReport[], reviewedAt: Date | null, now: Date): boolean {
  const counting = reports.filter((r) => reportCountsForHostFlag(r, now));
  const latest = counting.reduce<Date | null>((max, r) => (!max || r.createdAt > max ? r.createdAt : max), null);
  return hostReportFlagOpen({ reportCount: counting.length, latestReportAt: latest, reviewedAt });
}

export type FlagBooking = {
  status: "CONFIRMED" | "CANCELLED_BY_GUEST" | "CANCELLED_BY_HOST" | "COMPLETED" | "NO_SHOW";
  flaggedForReview: boolean;
  flagReviewedAt: Date | null;
};

export type BookingFlagKind = "host_cancellation" | "no_show";

/** What a booking is flagged for (null = nothing). A flagged host cancellation wins over a no-show. */
export function bookingFlagKind(booking: Pick<FlagBooking, "status" | "flaggedForReview">): BookingFlagKind | null {
  if (booking.flaggedForReview) return "host_cancellation";
  if (booking.status === "NO_SHOW") return "no_show";
  return null;
}

/** Is the booking's flag waiting for staff? */
export function bookingFlagOpen(booking: FlagBooking): boolean {
  return bookingFlagKind(booking) !== null && booking.flagReviewedAt === null;
}

/**
 * Is the host flagged right now (for the review rule)? An open report flag, or at least one open
 * host-cancellation flag. No-shows never count.
 */
export function isFlaggedHost(input: { reportFlagOpen: boolean; openCancellationFlags: number }): boolean {
  return input.reportFlagOpen || input.openCancellationFlags > 0;
}

/** Hours from booking to the host's cancellation, rounded down, never negative. */
export function hoursFromBookingToCancel(createdAt: Date, cancelledAt: Date | null): number | null {
  if (!cancelledAt) return null;
  return Math.max(0, Math.floor((cancelledAt.getTime() - createdAt.getTime()) / 3_600_000));
}

/**
 * The same hours for a booking the host cancelled, else null: one rounding (down) for every page
 * that shows it (the report page, the booking page, the flags list).
 */
export function hostCancelHours(booking: { status: string; createdAt: Date; cancelledAt: Date | null }): number | null {
  return booking.status === "CANCELLED_BY_HOST" ? hoursFromBookingToCancel(booking.createdAt, booking.cancelledAt) : null;
}
