/**
 * Input schemas for the booking actions (client-safe). Field error messages are keys in
 * `booking.errors`.
 */
import { z } from "zod";
import { currencyCodes } from "@/config/site";
import { looksLikeContact } from "@/lib/auth/first-name";
import {
  CANCEL_REASON_TEXT_MAX,
  CANCELLATION_POLICIES,
  GUEST_CANCEL_REASONS,
  GUEST_NAME_MAX,
  HOST_CANCEL_REASONS,
  MAX_GUESTS_PER_BOOKING,
  MAX_INFANTS,
  MAX_ROOMS_PER_BOOKING,
  MESSAGE_TO_HOST_MAX,
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
  /** Hotels: how many rooms of that type (a family can book 2 in one booking). */
  rooms: z.coerce.number().int().min(1, "rooms_unavailable").max(MAX_ROOMS_PER_BOOKING, "rooms_unavailable").default(1),
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
  /** What the review page showed: a change since then is refused with "terms_changed". */
  expectedTotal: z.number().nonnegative().max(100_000_000).optional(),
  expectedCurrency: z.enum(currencyCodes).optional(),
  expectedPolicy: z.enum(CANCELLATION_POLICIES).optional(),
  /**
   * One booking attempt (SECURITY_REPORT 4.5.c): the review page makes a random key per stay and
   * sends it with every tap, so a double tap or a retry returns the booking already made.
   */
  idempotencyKey: z
    .string()
    .regex(/^[A-Za-z0-9_-]{16,64}$/, "invalid_input")
    .optional(),
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
