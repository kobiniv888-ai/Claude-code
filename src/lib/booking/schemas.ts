/**
 * Input schemas for the booking actions (client-safe). Field error messages are keys in
 * `booking.errors`.
 */
import { z } from "zod";
import { looksLikeContact } from "@/lib/auth/first-name";
import {
  CANCEL_REASON_TEXT_MAX,
  CANCELLATION_POLICIES,
  GUEST_CANCEL_REASONS,
  GUEST_NAME_MAX,
  HOST_CANCEL_REASONS,
  MAX_GUESTS_PER_BOOKING,
  MAX_INFANTS,
  MESSAGE_TO_HOST_MAX,
  PAYMENT_METHODS,
  REASONS_NEEDING_TEXT,
} from "./constants";
import { isDay } from "./dates";

const day = z.string().refine(isDay, "dates_invalid");

/** Optional user text: trimmed, empty → null, control characters removed (newlines kept). */
function optionalText(max: number) {
  return z
    .string()
    .max(max * 2, "too_long")
    .optional()
    .nullable()
    .transform((value) => {
      const text = (value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
      return text ? text : null;
    })
    .refine((value) => value === null || value.length <= max, "too_long");
}

export const stayInputSchema = z.object({
  checkIn: day,
  checkOut: day,
  adults: z.coerce.number().int().min(1, "no_adults").max(MAX_GUESTS_PER_BOOKING, "too_many_guests"),
  children: z.coerce.number().int().min(0).max(MAX_GUESTS_PER_BOOKING, "too_many_guests").default(0),
  infants: z.coerce.number().int().min(0).max(MAX_INFANTS, "too_many_infants").default(0),
  /** Hotels: the room type the guest chose. */
  roomTypeId: z.string().min(1).max(64).optional().nullable(),
});
export type StayInput = z.infer<typeof stayInputSchema>;

export const quoteInputSchema = stayInputSchema.extend({ listingId: z.string().min(1).max(64) });
export type QuoteInput = z.infer<typeof quoteInputSchema>;

export const createBookingSchema = quoteInputSchema.extend({
  /** The name the host sees (defaults to the account's first name). */
  guestName: z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .min(1, "name_required")
        .max(GUEST_NAME_MAX, "too_long")
        .refine((value) => !looksLikeContact(value), "name_required"),
    ),
  messageToHost: optionalText(MESSAGE_TO_HOST_MAX),
  rulesAccepted: z.literal(true, { error: "rules_not_accepted" }),
});
export type CreateBookingInput = z.input<typeof createBookingSchema>;

const bookingRef = z.object({ bookingId: z.string().min(1).max(64) });

export const guestCancelSchema = bookingRef
  .extend({
    reasonCode: z.enum(GUEST_CANCEL_REASONS, { error: "reason_required" }),
    reasonText: optionalText(CANCEL_REASON_TEXT_MAX),
  })
  .refine((v) => !REASONS_NEEDING_TEXT.includes(v.reasonCode) || !!v.reasonText, {
    path: ["reasonText"],
    message: "reason_text_required",
  });
export type GuestCancelInput = z.input<typeof guestCancelSchema>;

export const hostCancelSchema = bookingRef
  .extend({
    reasonCode: z.enum(HOST_CANCEL_REASONS, { error: "reason_required" }),
    reasonText: optionalText(CANCEL_REASON_TEXT_MAX),
  })
  .refine((v) => !REASONS_NEEDING_TEXT.includes(v.reasonCode) || !!v.reasonText, {
    path: ["reasonText"],
    message: "reason_text_required",
  });
export type HostCancelInput = z.input<typeof hostCancelSchema>;

export const noShowSchema = bookingRef;

/**
 * The host's "Bookings and price" settings (post-form step, brief 5.6). Prices are in the
 * listing's currency; `bookingMode` INSTANT is only accepted for short stays and hotel rooms.
 */
export const bookingSettingsSchema = z.object({
  weekendPrice: z.coerce.number().positive().max(1_000_000).optional().nullable(),
  cancellationPolicy: z.enum(CANCELLATION_POLICIES),
  paymentMethodsAtCheckIn: z.array(z.enum(PAYMENT_METHODS)).min(1, "payment_method_required").max(PAYMENT_METHODS.length),
  bookingMode: z.enum(["INSTANT", "CONTACT"]),
});
export type BookingSettingsInput = z.infer<typeof bookingSettingsSchema>;
