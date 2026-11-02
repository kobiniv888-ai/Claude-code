/**
 * Booking vocabulary and limits (client-safe, pure). Text for every key lives in
 * messages/<locale>/booking.json. Rules: docs/redesign-2/booking.md.
 */
import type { CancellationPolicy, DealType } from "@/generated/prisma/enums";

/** Only these deal types can be booked on the site; monthly rentals and sales are always CONTACT. */
export const BOOKABLE_DEAL_TYPES = ["SHORT_STAY", "HOTEL_ROOM"] as const satisfies readonly DealType[];

export function isBookableDealType(deal: DealType | string): boolean {
  return (BOOKABLE_DEAL_TYPES as readonly string[]).includes(deal);
}

/** Paid to the host at check-in, in the host's currency (Listing.paymentMethodsAtCheckIn). */
export const PAYMENT_METHODS = ["cash", "card", "bank_transfer"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}

/** Known methods only, in the canonical order, without duplicates. */
export function cleanPaymentMethods(values: readonly unknown[] | null | undefined): PaymentMethod[] {
  const set = new Set((values ?? []).filter(isPaymentMethod));
  return PAYMENT_METHODS.filter((method) => set.has(method));
}

export const CANCELLATION_POLICIES = ["FLEXIBLE", "MODERATE", "STRICT"] as const satisfies readonly CancellationPolicy[];
export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = "MODERATE";

/**
 * Free cancellation until this many hours before check-in (the check-in day at the listing's
 * check-in time, else 14:00, Georgia time): 24 hours, 5 days, 14 days.
 */
export const CANCELLATION_POLICY_HOURS: Record<CancellationPolicy, number> = {
  FLEXIBLE: 24,
  MODERATE: 5 * 24,
  STRICT: 14 * 24,
};

/** The policy as days, for "until {count} days before check-in" (FLEXIBLE = 1 day = 24 hours). */
export function policyDays(policy: CancellationPolicy): number {
  return CANCELLATION_POLICY_HOURS[policy] / 24;
}

/** A host may cancel only with one of these (brief 5.6). */
export const HOST_CANCEL_REASONS = ["DOUBLE_BOOKING", "PROPERTY_ISSUE", "OTHER"] as const;
export type HostCancelReason = (typeof HOST_CANCEL_REASONS)[number];

/**
 * A guest's reason. HOST_ASKED ("the host asked me to cancel") flags the booking for review, like
 * an early host cancellation: it is how a host could get around the pledge.
 */
export const GUEST_CANCEL_REASONS = ["CHANGE_OF_PLANS", "FOUND_OTHER_STAY", "TRAVEL_PROBLEM", "HOST_ASKED", "OTHER"] as const;
export type GuestCancelReason = (typeof GUEST_CANCEL_REASONS)[number];

/** Free-text reasons are required for these codes. */
export const REASONS_NEEDING_TEXT: readonly string[] = ["OTHER"];

/** Host cancellations within this many hours of the booking are flagged for review. */
export const HOST_CANCEL_FLAG_HOURS = 48;

/** Longest stay that can be booked on the site. */
export const MAX_STAY_NIGHTS = 90;
/** How far ahead a stay can start. */
export const MAX_DAYS_AHEAD = 730;
/** Hard ceiling on guests in one booking, whatever the listing says. */
export const MAX_GUESTS_PER_BOOKING = 30;
export const MAX_INFANTS = 5;
export const MESSAGE_TO_HOST_MAX = 1000;
export const CANCEL_REASON_TEXT_MAX = 500;
export const GUEST_NAME_MAX = 80;

/** The reminder goes out this many days before check-in. */
export const REMINDER_DAYS_BEFORE = 3;
/** A host can report a no-show from the day after check-in until this many days after check-out. */
export const NO_SHOW_REPORT_DAYS_AFTER_CHECKOUT = 7;

/** "BT-" + 5 characters from an alphabet without 0/O/1/I (easy to read out on the phone). */
export const BOOKING_CODE_PREFIX = "BT-";
export const BOOKING_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const BOOKING_CODE_LENGTH = 5;

/** Pages (paths without the locale; use with Link from @/i18n/navigation). */
export const TRIPS_PATH = "/account/trips";
export const HOST_BOOKINGS_PATH = "/account/host-bookings";

export function tripPath(code: string): string {
  return `${TRIPS_PATH}/${encodeURIComponent(code)}`;
}

export function hostBookingPath(code: string): string {
  return `${HOST_BOOKINGS_PATH}/${encodeURIComponent(code)}`;
}

/** The guest's "add to calendar" file (signed-in guest of the booking only). */
export function bookingIcsPath(code: string): string {
  return `/api/ical/booking/${encodeURIComponent(code)}`;
}
