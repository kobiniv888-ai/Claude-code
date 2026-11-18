/**
 * Guest flags and the booking abuse limits (founder's decisions 7 and 8, Q14; SECURITY_REPORT
 * 4.6.a–c). Client-safe and pure: the rules and their numbers. The booking cap is enforced inside
 * the booking transaction (./service.ts createBooking); the flag lists are read by
 * src/lib/admin/server/guest-flags.ts for Admin → Flags.
 *
 * - At most MAX_UPCOMING_BOOKINGS_PER_PHONE upcoming bookings per verified phone number, across
 *   every account that used it (and per account, so a new number does not reset it). "Upcoming" =
 *   confirmed and not checked out yet (./policy.ts isUpcoming).
 * - Flags are LISTED for an admin to look at, never acted on automatically (decision 7): no
 *   refusal, no hidden listing, no message to anyone. "Reviewed" is an audit-log entry (D11 a).
 *     - a long stay: LONG_STAY_FLAG_NIGHTS nights or more (one booking can block a host's calendar);
 *     - repeated cancellations: REPEAT_CANCEL_FLAG_MIN guest cancellations within
 *       REPEAT_CANCEL_WINDOW_DAYS days;
 *     - repeated no-shows: REPEAT_NO_SHOW_FLAG_MIN "didn't arrive" reports within
 *       REPEAT_NO_SHOW_WINDOW_DAYS days.
 * - NEVER counted (decision 7): a cancellation with the reason "my flight was cancelled"
 *   (FLIGHT_CANCELLED_REASON) or one inside a travel-disruption window
 *   (isTravelDisruptionCancellation). Founder's answer (4), 9 Nov 2026: "the host asked me to
 *   cancel" counts against the guest only once the host said no or did not answer within 72 hours
 *   (./host-asked.ts); while the host may still answer, and once the host confirmed, it does not
 *   (a confirmed one counts against the HOST, src/lib/listing/host-flags.ts). Both arrive with the next brief: the reason is not offered to
 *   guests yet, and the hook says "no window" until the windows exist. Every counting rule goes
 *   through countsAsGuestCancellation, so adding them later changes no query.
 */
import { effectiveHostAskedState, hostAskedCountsAgainstGuest } from "./host-asked";

export const MAX_UPCOMING_BOOKINGS_PER_PHONE = 2;

export const LONG_STAY_FLAG_NIGHTS = 14;

export const REPEAT_CANCEL_FLAG_MIN = 3;
export const REPEAT_CANCEL_WINDOW_DAYS = 90;
export const REPEAT_NO_SHOW_FLAG_MIN = 2;
export const REPEAT_NO_SHOW_WINDOW_DAYS = 365;

/**
 * The guest's cancellation reason "my flight was cancelled" (Booking.cancelReasonCode). The next
 * brief adds it to the guest's choices (GUEST_CANCEL_REASONS in ./constants.ts, with its text in
 * 5 languages); a cancellation with it never counts toward a guest flag.
 */
export const FLIGHT_CANCELLED_REASON = "FLIGHT_CANCELLED";

/** What the travel-disruption rule reads from a booking (enough to match a window later). */
export type DisruptionCheckBooking = {
  listingId: string;
  /** "YYYY-MM-DD" */
  checkIn: string;
  /** "YYYY-MM-DD" */
  checkOut: string;
  cancelledAt: Date | null;
};

/**
 * Was this cancellation inside a travel-disruption window (airports closed, flights cancelled in
 * the region)? Such cancellations never count toward a guest flag (decision 7). The windows and
 * who sets them come with the next brief; until then there is none, so this answers false.
 */
export function isTravelDisruptionCancellation(booking: DisruptionCheckBooking): boolean {
  void booking;
  return false;
}

export type CountableCancellation = DisruptionCheckBooking & {
  status: string;
  cancelReasonCode: string | null;
};

/**
 * Does this booking count as a guest cancellation for the repeat flag? `now` decides whether a
 * "host asked me" cancellation still waits for the host's answer (./host-asked.ts).
 */
export function countsAsGuestCancellation(booking: CountableCancellation, now: Date = new Date()): boolean {
  if (booking.status !== "CANCELLED_BY_GUEST" || !booking.cancelledAt) return false;
  if (booking.cancelReasonCode === FLIGHT_CANCELLED_REASON) return false;
  if (!hostAskedCountsAgainstGuest(effectiveHostAskedState(booking, now))) return false;
  return !isTravelDisruptionCancellation(booking);
}

const DAY_MS = 24 * 3600 * 1000;

export function repeatCancelWindowStart(now: Date): Date {
  return new Date(now.getTime() - REPEAT_CANCEL_WINDOW_DAYS * DAY_MS);
}

export function repeatNoShowWindowStart(now: Date): Date {
  return new Date(now.getTime() - REPEAT_NO_SHOW_WINDOW_DAYS * DAY_MS);
}

/** A stay long enough to be listed for review. */
export function isLongStay(nights: number): boolean {
  return Number.isFinite(nights) && nights >= LONG_STAY_FLAG_NIGHTS;
}

export type GuestFlagCounts = {
  cancellations: number;
  noShows: number;
  /** The newest counting event (a cancellation or a no-show report). */
  latestAt: Date | null;
  /** The last "reviewed" audit entry for this guest. */
  reviewedAt: Date | null;
};

/** Which repeat rules a guest meets (empty = none). */
export function guestFlagReasons(counts: Pick<GuestFlagCounts, "cancellations" | "noShows">): ("cancellations" | "no_shows")[] {
  const reasons: ("cancellations" | "no_shows")[] = [];
  if (counts.cancellations >= REPEAT_CANCEL_FLAG_MIN) reasons.push("cancellations");
  if (counts.noShows >= REPEAT_NO_SHOW_FLAG_MIN) reasons.push("no_shows");
  return reasons;
}

/**
 * Is the guest's flag open? They meet a rule AND something counting happened after an admin last
 * marked them reviewed (a new cancellation or no-show brings the flag back), like the host flag.
 */
export function guestFlagOpen(counts: GuestFlagCounts): boolean {
  if (guestFlagReasons(counts).length === 0 || !counts.latestAt) return false;
  return !counts.reviewedAt || counts.latestAt > counts.reviewedAt;
}

/** A guest's booking as the repeat rules read it. */
export type GuestFlagBooking = CountableCancellation & { noShowReportedAt: Date | null };

export type GuestFlagSummary = GuestFlagCounts & {
  reasons: ("cancellations" | "no_shows")[];
  open: boolean;
};

/**
 * The repeat rules over one guest's bookings (pure; the admin list feeds it the candidate rows).
 * A cancellation counts when countsAsGuestCancellation says so and it was made inside the
 * 90-day window; a no-show when its "didn't arrive" report is inside the 365-day window (a report
 * staff cleared is no NO_SHOW any more). `latestAt` is the newest event of a rule the guest meets,
 * so an event of a rule they don't meet never reopens a reviewed flag.
 */
export function summarizeGuestFlag(bookings: readonly GuestFlagBooking[], reviewedAt: Date | null, now: Date): GuestFlagSummary {
  const cancelSince = repeatCancelWindowStart(now);
  const noShowSince = repeatNoShowWindowStart(now);
  const cancelTimes: Date[] = [];
  const noShowTimes: Date[] = [];
  for (const booking of bookings) {
    if (countsAsGuestCancellation(booking, now) && booking.cancelledAt && booking.cancelledAt >= cancelSince && booking.cancelledAt <= now) {
      cancelTimes.push(booking.cancelledAt);
    }
    if (booking.status === "NO_SHOW" && booking.noShowReportedAt && booking.noShowReportedAt >= noShowSince && booking.noShowReportedAt <= now) {
      noShowTimes.push(booking.noShowReportedAt);
    }
  }
  const counts = { cancellations: cancelTimes.length, noShows: noShowTimes.length };
  const reasons = guestFlagReasons(counts);
  const latest = [...(reasons.includes("cancellations") ? cancelTimes : []), ...(reasons.includes("no_shows") ? noShowTimes : [])].reduce<Date | null>(
    (max, at) => (!max || at > max ? at : max),
    null,
  );
  const summary = { ...counts, latestAt: latest, reviewedAt };
  return { ...summary, reasons, open: guestFlagOpen(summary) };
}

/** A long stay waits for review until an admin marks it reviewed (an audit-log entry, D11 a). */
export function longStayOpen(booking: { nights: number; status: string }, reviewedAt: Date | null): boolean {
  return booking.status === "CONFIRMED" && isLongStay(booking.nights) && !reviewedAt;
}
