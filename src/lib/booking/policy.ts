/**
 * Cancellation policies, what each side may do with a booking, and when contact details are
 * revealed (client-safe, pure). Guests pay at check-in, so a cancellation after the free period
 * is only "late" (recorded and shown), never charged.
 */
import type { BookingStatus, CancellationPolicy } from "@/generated/prisma/enums";
import {
  CANCELLATION_POLICY_HOURS,
  GUEST_CANCEL_REASONS,
  HOST_CANCEL_FLAG_HOURS,
  HOST_CANCEL_REASONS,
  NO_SHOW_REPORT_DAYS_AFTER_CHECKOUT,
  type GuestCancelReason,
  type HostCancelReason,
} from "./constants";
import { addDays, checkInMoment, dateToDay, isDay, tbilisiToday } from "./dates";

/**
 * Free cancellation ends at this instant: the policy's hours (24 hours, 5 or 14 days) before the
 * check-in time on the check-in day, Georgia time (the listing's "check-in from", else 14:00).
 */
export function freeCancellationDeadline(policy: CancellationPolicy, checkIn: string, checkInTime?: string | null): Date {
  return new Date(checkInMoment(checkIn, checkInTime).getTime() - CANCELLATION_POLICY_HOURS[policy] * 3600 * 1000);
}

/** A cancellation at `at` comes after the free period (informational: guests pay at check-in). */
export function isLateCancellation(
  policy: CancellationPolicy,
  checkIn: string,
  at: Date = new Date(),
  checkInTime?: string | null,
): boolean {
  return at.getTime() > freeCancellationDeadline(policy, checkIn, checkInTime).getTime();
}

export type BookingState = {
  status: BookingStatus;
  /** "YYYY-MM-DD" */
  checkIn: string;
  /** "YYYY-MM-DD" */
  checkOut: string;
};

/** Bookings that still hold their nights (CONFIRMED) or happened (COMPLETED). */
export function isActiveOrDone(status: BookingStatus): boolean {
  return status === "CONFIRMED" || status === "COMPLETED";
}

/** Upcoming = confirmed and not yet checked out; everything else is past (or cancelled). */
export function isUpcoming(booking: BookingState, now: Date = new Date()): boolean {
  return booking.status === "CONFIRMED" && booking.checkOut > tbilisiToday(now);
}

/** A guest may cancel a confirmed booking until the end of the check-in day. */
export function canGuestCancel(booking: BookingState, now: Date = new Date()): boolean {
  return booking.status === "CONFIRMED" && tbilisiToday(now) <= booking.checkIn;
}

/** A host may cancel (with a reason) a confirmed booking until the end of the check-in day. */
export function canHostCancel(booking: BookingState, now: Date = new Date()): boolean {
  return booking.status === "CONFIRMED" && tbilisiToday(now) <= booking.checkIn;
}

/**
 * "Didn't arrive": from the day after check-in (late arrivals happen) until a week after check-out,
 * on a booking that is confirmed or was completed automatically.
 */
export function canReportNoShow(booking: BookingState, now: Date = new Date()): boolean {
  const today = tbilisiToday(now);
  return (
    (booking.status === "CONFIRMED" || booking.status === "COMPLETED") &&
    today > booking.checkIn &&
    today <= addDays(booking.checkOut, NO_SHOW_REPORT_DAYS_AFTER_CHECKOUT)
  );
}

/** A confirmed booking is completed the day after check-out (cron). */
export function shouldComplete(booking: BookingState, now: Date = new Date()): boolean {
  return booking.status === "CONFIRMED" && tbilisiToday(now) > booking.checkOut;
}

/**
 * Security checklist 6.f: the exact address, the exact pin and the host's contacts are hidden again
 * this many days after check-out (the last day they show is check-out + 7, Georgia time). The
 * offline trip copy keeps the same window (src/lib/trip/offline.ts).
 */
export const REVEAL_DAYS_AFTER_CHECKOUT = 7;

/** The last day ("YYYY-MM-DD", Georgia) a stay's exact address and host contacts are shown. */
export function revealLastDay(checkOut: string): string {
  return addDays(checkOut, REVEAL_DAYS_AFTER_CHECKOUT);
}

/**
 * The exact address, pin and the host's phone / WhatsApp are shown only to the guest of a
 * confirmed (or completed) booking, and only until a week after check-out (6.f). Fails closed: a
 * missing or broken check-out date reveals nothing.
 */
export function canRevealHostContact(
  booking: { status: BookingStatus; guestUserId: string; checkOut: string | Date },
  viewerId: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!viewerId || viewerId !== booking.guestUserId || !isActiveOrDone(booking.status)) return false;
  const checkOut =
    booking.checkOut instanceof Date ? (Number.isFinite(booking.checkOut.getTime()) ? dateToDay(booking.checkOut) : "") : booking.checkOut;
  if (!isDay(checkOut)) return false;
  return tbilisiToday(now) <= revealLastDay(checkOut);
}

/** Host cancellations within 48 hours of the booking are flagged for review (brief 5.6). */
export function isHostCancellationFlagged(createdAt: Date, cancelledAt: Date = new Date()): boolean {
  return cancelledAt.getTime() - createdAt.getTime() <= HOST_CANCEL_FLAG_HOURS * 3600 * 1000;
}

/**
 * Is a guest's cancellation flagged for review at the moment it is made? Never (founder's answer
 * (4), 9 Nov 2026): "the host asked me to cancel" first asks the host to confirm; the host's "no"
 * or 72 hours without an answer send it to review, a "yes" counts it against the host
 * (./host-asked.ts, ./service.ts answerHostAsked / expireHostAskedAnswers).
 */
export function isGuestCancellationFlagged(reason: GuestCancelReason): boolean {
  void reason;
  return false;
}

export function isHostCancelReason(value: unknown): value is HostCancelReason {
  return typeof value === "string" && (HOST_CANCEL_REASONS as readonly string[]).includes(value);
}

export function isGuestCancelReason(value: unknown): value is GuestCancelReason {
  return typeof value === "string" && (GUEST_CANCEL_REASONS as readonly string[]).includes(value);
}
