/**
 * Review error codes (client-safe). Each has a message in messages/<locale>/reviews.json under
 * `errors.<code>`; unknown codes fall back to the shared "errors" namespace.
 */
import { AppError } from "@/lib/errors";
import type { ReviewBlock } from "./rules";

export const REVIEW_ERROR_CODES = [
  // Why a booking can't be reviewed (rules.ts reviewBlock).
  "not_reviewable_type",
  "demo",
  "listing_gone",
  "not_stayed",
  "too_early",
  "too_late",
  "already_reviewed",
  // Text.
  "contact_in_text",
  "too_short",
  "too_long",
  // The host's reply and report.
  "already_replied",
  "review_hidden",
  "already_reported",
  "details_required",
  // Staff.
  "already_hidden",
  "not_hidden",
] as const satisfies readonly (ReviewBlock | string)[];
export type ReviewErrorCode = (typeof REVIEW_ERROR_CODES)[number];

export function isReviewErrorCode(code: string): code is ReviewErrorCode {
  return (REVIEW_ERROR_CODES as readonly string[]).includes(code);
}

/** A review rule said no (shown with reviews.errors.<code>). */
export class ReviewError extends AppError {
  constructor(code: ReviewErrorCode, status = 409) {
    super(code, code, { status });
  }
}
