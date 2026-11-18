/**
 * The free-cancellation line of the trip page (round 3, brief 7.1; pure, client-safe).
 *
 * Free cancellation ends the policy's hours (24 hours, 5 or 14 days) before the check-in time on
 * the check-in day, Georgia time — the listing's "check-in from", or 14:00 when the host gave no
 * time or chose "גמיש" (src/lib/booking/policy.ts freeCancellationDeadline). Guests pay on arrival,
 * so cancelling later is only recorded as late, never charged. A guest can cancel a confirmed
 * booking until the end of the check-in day (canGuestCancel); after that, only the team can help.
 */
import type { BookingStatus, CancellationPolicy } from "@/generated/prisma/enums";
import { canGuestCancel, freeCancellationDeadline, isLateCancellation } from "@/lib/booking/policy";

export type CancellationView =
  /** Cancelling is free until `until` (an instant; show it in Georgia time). */
  | { kind: "free"; until: Date; canCancel: true }
  /** Still possible, but after the free period: recorded as a late cancellation. */
  | { kind: "late"; until: Date; canCancel: true }
  /** The booking can no longer be cancelled here (checked in, finished or already cancelled). */
  | { kind: "closed"; until: Date; canCancel: false };

export type CancellationInput = {
  status: BookingStatus;
  /** "YYYY-MM-DD" */
  checkIn: string;
  checkOut: string;
  policy: CancellationPolicy;
  /** The listing's "check-in from" ("15:00"), null when it has none or is flexible. */
  checkInFrom: string | null;
};

export function cancellationView(input: CancellationInput, now: Date = new Date()): CancellationView {
  const until = freeCancellationDeadline(input.policy, input.checkIn, input.checkInFrom);
  if (!canGuestCancel({ status: input.status, checkIn: input.checkIn, checkOut: input.checkOut }, now)) {
    return { kind: "closed", until, canCancel: false };
  }
  return isLateCancellation(input.policy, input.checkIn, now, input.checkInFrom)
    ? { kind: "late", until, canCancel: true }
    : { kind: "free", until, canCancel: true };
}
