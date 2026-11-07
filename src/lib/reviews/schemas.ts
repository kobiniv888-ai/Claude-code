/**
 * Input schemas for the review actions (pure, client-safe): the form checks the same limits.
 * Text is trimmed; contact details are refused on the server (./service.ts, src/lib/risk).
 */
import { z } from "zod";
import {
  QUICK_RATING_KEYS,
  RATING_MAX,
  RATING_MIN,
  REPLY_TEXT_MAX,
  REPLY_TEXT_MIN,
  REVIEW_HIDE_REASONS,
  REVIEW_REPORT_DETAILS_MAX,
  REVIEW_REPORT_REASONS,
  REVIEW_TEXT_MAX,
  REVIEW_TEXT_MIN,
} from "./rules";

const id = z.string().trim().min(1).max(64);
const stars = z.number().int().min(RATING_MIN).max(RATING_MAX);
const optionalStars = stars.nullable().optional();

/** Line breaks kept (at most two in a row), other runs of spaces collapsed. */
export function tidyReviewText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const text = (min: number, max: number) =>
  z
    .string()
    .transform(tidyReviewText)
    .pipe(z.string().min(min, { message: "too_short" }).max(max, { message: "too_long" }));

export const createReviewSchema = z.object({
  bookingCode: z.string().trim().min(3).max(32),
  rating: stars,
  cleanliness: optionalStars,
  accuracy: optionalStars,
  checkIn: optionalStars,
  communication: optionalStars,
  location: optionalStars,
  value: optionalStars,
  text: text(REVIEW_TEXT_MIN, REVIEW_TEXT_MAX),
  /** The page the guest wrote on (the review's language when the text doesn't tell). */
  locale: z.string().max(5).optional(),
  /** "I understand a review is final" (the form's checkbox). */
  confirmFinal: z.literal(true),
});
export type CreateReviewInput = z.input<typeof createReviewSchema>;

export const replySchema = z.object({
  reviewId: id,
  text: text(REPLY_TEXT_MIN, REPLY_TEXT_MAX),
  locale: z.string().max(5).optional(),
  confirmFinal: z.literal(true),
});
export type ReplyInput = z.input<typeof replySchema>;

export const reportReviewSchema = z.object({
  reviewId: id,
  reason: z.enum(REVIEW_REPORT_REASONS),
  details: z.string().transform(tidyReviewText).pipe(z.string().max(REVIEW_REPORT_DETAILS_MAX)),
});
export type ReportReviewInput = z.input<typeof reportReviewSchema>;

const staffNote = z.string().trim().min(2, { message: "too_short" }).max(2000);

export const hideReviewSchema = z.object({
  reviewId: id,
  reason: z.enum(REVIEW_HIDE_REASONS),
  note: staffNote,
  /** The report the decision was taken from (it and the review's other open reports are closed). */
  reportId: id.optional(),
});

export const showReviewSchema = z.object({
  reviewId: id,
  note: staffNote,
  reportId: id.optional(),
});

/** The quick ratings of a parsed input, as Review columns (missing = null). */
export function quickRatingColumns(input: Partial<Record<(typeof QUICK_RATING_KEYS)[number], number | null | undefined>>) {
  return Object.fromEntries(QUICK_RATING_KEYS.map((key) => [key, input[key] ?? null])) as Record<(typeof QUICK_RATING_KEYS)[number], number | null>;
}
