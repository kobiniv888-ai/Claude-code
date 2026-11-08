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
 *   (isTravelDisruptionCancellation). Both arrive with the next brief: the reason is not offered to
 *   guests yet, and the hook says "no window" until the windows exist. Every counting rule goes
 *   through countsAsGuestCancellation, so adding them later changes no query.
 */
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

/** Does this booking count as a guest cancellation for the repeat flag? */
export function countsAsGuestCancellation(booking: CountableCancellation): boolean {
  if (booking.status !== "CANCELLED_BY_GUEST" || !booking.cancelledAt) return false;
  if (booking.cancelReasonCode === FLIGHT_CANCELLED_REASON) return false;
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
