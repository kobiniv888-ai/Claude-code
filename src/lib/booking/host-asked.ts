/**
 * "The host asked me to cancel" (founder's answer (4), 9 Nov 2026; SECURITY_REPORT 4.6.c, C22).
 * Pure and client-safe: the states and their rules. The service (./service.ts guestCancel,
 * answerHostAsked, expireHostAskedAnswers) writes them; the guest and host flags read them
 * (./guest-flags.ts, src/lib/listing/host-flags.ts).
 *
 * When a guest cancels with the reason HOST_ASKED, the host gets an email and a card on their
 * booking page asking them to CONFIRM it:
 *   - "Yes, I asked" → HOST_ASKED_CONFIRMED: it does NOT count against the guest; it is the host's
 *     doing, so it counts against the HOST (the repeated-host-cancellation flag, and the booking is
 *     listed under Admin → Flags → cancellations like an early host cancellation);
 *   - "No, I didn't" → HOST_ASKED_DENIED, or no answer within HOST_ASKED_ANSWER_HOURS (72) →
 *     HOST_ASKED_EXPIRED: the booking goes to the admin review queue (Admin → Flags →
 *     cancellations, flaggedForReview). It counts as an ordinary guest cancellation for the guest's
 *     review-only flag (the host says the guest cancelled on their own), and staff see the dispute.
 *   - While the host has not answered (HOST_ASKED, at most 72 hours) it counts against nobody.
 * Everything stays review-only: no refusal, no hidden listing, no message to anyone but the host's
 * confirm request (decision 7). The state lives in Booking.cancelReasonCode (no schema change); the
 * clock starts at Booking.cancelledAt.
 */

/** The reason a guest picks (GUEST_CANCEL_REASONS) and the state "waiting for the host". */
export const HOST_ASKED_REASON = "HOST_ASKED";
export const HOST_ASKED_CONFIRMED = "HOST_ASKED_CONFIRMED";
export const HOST_ASKED_DENIED = "HOST_ASKED_DENIED";
export const HOST_ASKED_EXPIRED = "HOST_ASKED_EXPIRED";

/** The host answers within this many hours of the cancellation; after that it goes to review. */
export const HOST_ASKED_ANSWER_HOURS = 72;

export type HostAskedState = "pending" | "confirmed" | "denied" | "expired";

const STATE_OF: Record<string, HostAskedState> = {
  [HOST_ASKED_REASON]: "pending",
  [HOST_ASKED_CONFIRMED]: "confirmed",
  [HOST_ASKED_DENIED]: "denied",
  [HOST_ASKED_EXPIRED]: "expired",
};

export const HOST_ASKED_CODES = [HOST_ASKED_REASON, HOST_ASKED_CONFIRMED, HOST_ASKED_DENIED, HOST_ASKED_EXPIRED] as const;

/** The stored state of a cancellation reason code (null: not a "host asked me" cancellation). */
export function hostAskedState(code: string | null | undefined): HostAskedState | null {
  return (code && STATE_OF[code]) || null;
}

/** When the host's answer is due (null without a cancellation time). */
export function hostAskedDeadline(cancelledAt: Date | null | undefined): Date | null {
  if (!(cancelledAt instanceof Date) || !Number.isFinite(cancelledAt.getTime())) return null;
  return new Date(cancelledAt.getTime() + HOST_ASKED_ANSWER_HOURS * 3_600_000);
}

/**
 * The state as of `now`: a pending one past its deadline is "expired" even before the daily job
 * wrote it (and one without a time is expired: fail closed toward the review queue).
 */
export function effectiveHostAskedState(
  booking: { cancelReasonCode: string | null; cancelledAt: Date | null },
  now: Date,
): HostAskedState | null {
  const state = hostAskedState(booking.cancelReasonCode);
  if (state !== "pending") return state;
  const deadline = hostAskedDeadline(booking.cancelledAt);
  return !deadline || now.getTime() >= deadline.getTime() ? "expired" : "pending";
}

/** May the host still answer? Only a pending cancellation by the guest, before the deadline. */
export function canAnswerHostAsked(
  booking: { status: string; cancelReasonCode: string | null; cancelledAt: Date | null },
  now: Date,
): boolean {
  return booking.status === "CANCELLED_BY_GUEST" && effectiveHostAskedState(booking, now) === "pending";
}

/** The code an answer writes. */
export function answeredCode(answer: "confirm" | "deny"): typeof HOST_ASKED_CONFIRMED | typeof HOST_ASKED_DENIED {
  return answer === "confirm" ? HOST_ASKED_CONFIRMED : HOST_ASKED_DENIED;
}

/** Does this guest cancellation count against the GUEST? Not while pending, not once confirmed. */
export function hostAskedCountsAgainstGuest(state: HostAskedState | null): boolean {
  return state === null || state === "denied" || state === "expired";
}

/** Does it count against the HOST (their own cancellation)? Only once the host confirmed it. */
export function hostAskedCountsAgainstHost(state: HostAskedState | null): boolean {
  return state === "confirmed";
}

/** The guest reason to show for any of the states (the label adds the state, see messages). */
export function displayGuestReason(code: string | null | undefined): string | null {
  return hostAskedState(code) ? HOST_ASKED_REASON : (code ?? null);
}
