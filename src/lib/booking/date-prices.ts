/**
 * Holiday prices ("מחיר לתאריכים", round 3, brief 6.3): the host's rules for a DatePrice (client-safe,
 * pure). The host selects nights in the place calendar and sets a price per night, optionally a
 * minimum stay and a short note for guests ("פסח"). The quote (./pricing) then prices those nights
 * first, before the weekend and the regular price.
 *
 * Rules (conservative, the founder is travelling):
 * - Nights from today on, at most MAX_DAYS_AHEAD ahead, at most DATE_PRICE_LIMITS.maxNights in one.
 * - Date prices of the same scope never overlap: the whole listing (roomTypeId null) or one room
 *   type. A room type's own price may cover nights of a listing-wide one (the room type's wins).
 * - The price is per night in the listing's currency (a room type's own: in that room type's).
 * - A minimum stay of 1 night is no minimum (stored as null).
 *
 * The calendar sends inclusive nights (`start` … `last`, like its selection); the database stores
 * an exclusive end (`end` = the first night not at this price), like every other booking range.
 */
import { z } from "zod";
import type { CurrencyCode } from "@/config/site";
import { MAX_DAYS_AHEAD, MAX_STAY_NIGHTS } from "./constants";
import { addDays, daysBetween, isDay } from "./dates";

export const DATE_PRICE_LIMITS = {
  /** Date prices one listing (all its room types) may hold from today on. */
  maxPerListing: 60,
  /** Nights in one date price (a long season is still one date price). */
  maxNights: 120,
  /** The note for guests ("פסח", "חנוכה"). */
  labelMax: 40,
  /** Per night, in the listing's currency. */
  priceMax: 1_000_000,
  minNightsMax: MAX_STAY_NIGHTS,
} as const;

/** A date price as the host's calendar shows it (plain values; `end` exclusive). */
export type HostDatePrice = {
  id: string;
  /** null = the whole listing (every room type in the listing's currency). */
  roomTypeId: string | null;
  start: string;
  end: string;
  price: number;
  currency: CurrencyCode;
  minNights: number | null;
  /** The host's note in the viewer's language (or as written), null when none. Render with dir="auto". */
  label: string | null;
};

export type DatePriceScope = { start: string; end: string; roomTypeId: string | null };

/** Two ranges [start, end) share at least one night. */
export function sharesNight(a: Pick<DatePriceScope, "start" | "end">, b: Pick<DatePriceScope, "start" | "end">): boolean {
  return a.start < b.end && b.start < a.end;
}

/** The existing date price of the same scope that shares a night with `range` (refused), if any. */
export function overlappingDatePrice<T extends DatePriceScope>(range: DatePriceScope, existing: readonly T[]): T | undefined {
  const scope = range.roomTypeId ?? null;
  return existing.find((p) => (p.roomTypeId ?? null) === scope && sharesNight(p, range));
}

export const DATE_PRICE_ERRORS = [
  "dates_invalid",
  "dates_past",
  "too_far_ahead",
  "too_many_nights",
  "price_required",
  "price_too_high",
  "label_too_long",
  "overlap",
  "too_many",
  "not_bookable",
  "room_type_not_found",
] as const;
export type DatePriceError = (typeof DATE_PRICE_ERRORS)[number];

export function isDatePriceError(code: unknown): code is DatePriceError {
  return typeof code === "string" && (DATE_PRICE_ERRORS as readonly string[]).includes(code);
}

const id = z.string().trim().min(1).max(64);
const day = z.string().refine(isDay, "dates_invalid");

/** What the calendar's "מחיר לתאריכים" form sends (validated again on the server). */
export const datePriceInputSchema = z
  .object({
    listingId: id,
    /** Kept for hotels: a room type's own price (the room-type picker comes with booking by room type). */
    roomTypeId: id.nullable().default(null),
    /** First night. */
    start: day,
    /** Last night (inclusive), like the calendar's selection. */
    last: day,
    price: z
      .number({ error: "price_required" })
      .refine(Number.isFinite, "price_required")
      .refine((n) => n > 0, "price_required")
      .refine((n) => n <= DATE_PRICE_LIMITS.priceMax, "price_too_high")
      .transform((n) => Math.round(n * 100) / 100)
      .refine((n) => n > 0, "price_required"),
    minNights: z
      .number()
      .int()
      .min(1)
      .max(DATE_PRICE_LIMITS.minNightsMax)
      .nullable()
      .default(null)
      .transform((n) => (n !== null && n > 1 ? n : null)),
    label: z
      .string()
      .max(200)
      .default("")
      .transform((text) => text.replace(/\s+/g, " ").trim())
      .refine((text) => text.length <= DATE_PRICE_LIMITS.labelMax, "label_too_long")
      .transform((text) => text || null),
  })
  .refine((v) => v.start <= v.last, { message: "dates_invalid", path: ["last"] })
  .transform((v) => ({ ...v, end: addDays(v.last, 1) }));

export type DatePriceInput = z.output<typeof datePriceInputSchema>;

/** The dates' own rule against today (Georgia): from today, within the booking window, not too long. */
export function datePriceDatesProblem(range: { start: string; end: string }, today: string): DatePriceError | null {
  if (!isDay(range.start) || !isDay(range.end) || range.end <= range.start) return "dates_invalid";
  if (range.start < today) return "dates_past";
  if (daysBetween(today, range.start) > MAX_DAYS_AHEAD) return "too_far_ahead";
  if (daysBetween(range.start, range.end) > DATE_PRICE_LIMITS.maxNights) return "too_many_nights";
  return null;
}

/** The first zod issue as a DatePriceError ("invalid_input" otherwise). */
export function datePriceIssue(error: z.ZodError): DatePriceError | "invalid_input" {
  for (const issue of error.issues) if (isDatePriceError(issue.message)) return issue.message;
  return "invalid_input";
}
