/**
 * Booking error codes (client-safe). Each has a message in messages/<locale>/booking.json under
 * `errors.<code>`; show them with `t(`errors.${code}`)` from the "booking" namespace (unknown codes
 * fall back to the shared "errors" namespace through errorMessageKey()).
 */
import { AppError } from "@/lib/errors";
import { QUOTE_ERRORS } from "./pricing";

export const BOOKING_ERROR_CODES = [
  ...QUOTE_ERRORS,
  "not_bookable",
  "own_listing",
  "not_allowed",
  "dates_unavailable",
  /** Hotels: fewer rooms of the room type are free on these nights than asked for (details.count = free rooms). */
  "rooms_unavailable",
  "phone_not_verified",
  "rules_not_accepted",
  "room_type_required",
  "name_required",
  "too_long",
  "not_cancellable",
  "reason_required",
  "reason_text_required",
  "no_show_not_allowed",
  /** The guest already reviewed the stay: a "didn't arrive" report is no longer possible. */
  "no_show_reviewed",
  /** Staff: the booking has no "didn't arrive" report to clear. */
  "no_show_not_reported",
  "payment_method_required",
  "terms_changed",
  /** None of the host's alert channels accepted the "new booking" alert: ask the host instead. */
  "host_unreachable",
] as const;
export type BookingErrorCode = (typeof BOOKING_ERROR_CODES)[number];

export function isBookingErrorCode(code: unknown): code is BookingErrorCode {
  return typeof code === "string" && (BOOKING_ERROR_CODES as readonly string[]).includes(code);
}

/** Thrown by the booking service; toActionError() passes `code` through (status < 500). */
export class BookingError extends AppError {
  readonly details: Record<string, number> | undefined;

  constructor(code: BookingErrorCode, details?: Record<string, number>) {
    super(code, `Booking refused: ${code}`, { status: code === "dates_unavailable" || code === "rooms_unavailable" ? 409 : 400 });
    this.details = details;
  }
}
