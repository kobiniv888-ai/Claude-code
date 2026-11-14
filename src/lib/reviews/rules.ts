/**
 * Real reviews (round 3, brief 8.1; founder's answer 6): the rules, pure and client-safe.
 *
 * WHO: only the guest of a stay that happened — a short stay or a hotel booking (monthly rentals
 *   and sales have no reviews) — once per booking, and only in the window: from the day after the
 *   check-out day (the day the booking counts as completed, src/lib/booking/service.ts
 *   completeFinishedBookings) until 14 days after check-out, in Georgia days. The booking must be
 *   COMPLETED, or still CONFIRMED with its check-out day passed (the daily job may not have run
 *   yet). Cancelled and "didn't arrive" bookings never. Demo listings, demo guests and demo hosts
 *   never (demo listings have no reviews; demo bookings never ask).
 * WHAT: 1–5 stars overall (required), optional quick ratings 1–5 (cleanliness, accuracy, check-in,
 *   communication, location, value), and a text of 20–2000 characters without contact details.
 * FINAL: once posted, a review is never edited or deleted (by the guest, the host or staff); the
 *   host may post ONE public reply, final too. Staff can only hide a review (logged reason) and
 *   show it again.
 * SHOWN: with the guest's first name and the month it was written ("דנה · אוקטובר 2026"), never
 *   the full name. The average (one decimal) and the count only from 3 visible reviews on.
 *
 * Listing.reviewCount / ratingSum count the VISIBLE reviews; they change in the same transaction
 * as the review (./service.ts): +1 / +rating on a new review, −1 / −rating when it is hidden, +1 /
 * +rating when it is shown again (visibilityDelta).
 */
import type { AppLocale } from "@/config/site";
import { locales } from "@/config/site";
import { addDays, daysBetween } from "@/lib/booking/dates";
import { firstNameOf } from "@/lib/auth/first-name";

/** Days after check-out the review window stays open (the last day included). */
export const REVIEW_WINDOW_DAYS = 14;
export const REVIEW_TEXT_MIN = 20;
export const REVIEW_TEXT_MAX = 2000;
export const REPLY_TEXT_MIN = 5;
export const REPLY_TEXT_MAX = 1000;
/** Letters and digits in a text (any alphabet), counted by code point. */
export function countMeaningful(text: string): number {
  return text.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
}

/**
 * Of a text's minimum length, this many must be letters or digits (three quarters: 15 of a
 * review's 20, 4 of a reply's 5), so 20 dots, 20 "!" or 20 emoji are not a review, while a short
 * real one with spaces and punctuation ("מקום מעולה, מומלץ בחום!") still is.
 */
export function meaningfulMinimum(min: number): number {
  return Math.ceil(min * 0.75);
}

/** The length the limits count, by code point (an emoji is one character, as on the server), after trimming. */
export function textLength(text: string): number {
  return [...text.trim()].length;
}

/** Long enough to post (the form and the server, ./schemas.ts, use the same rule). */
export function meetsTextMinimum(text: string, min: number): boolean {
  return textLength(text) >= min && countMeaningful(text) >= meaningfulMinimum(min);
}

/**
 * Why a text is too short, for the message the form shows: "length" (fewer than `min`
 * characters: "write at least 20 characters") or "letters" (enough characters, but too few of them
 * letters or digits: "write at least 15 letters or digits"), or null when it is long enough.
 */
export function shortTextReason(text: string, min: number): "length" | "letters" | null {
  if (textLength(text) < min) return "length";
  return countMeaningful(text) < meaningfulMinimum(min) ? "letters" : null;
}

/** The average and the count show from this many visible reviews (brief 8.1). */
export const MIN_REVIEWS_FOR_AVERAGE = 3;
export const RATING_MIN = 1;
export const RATING_MAX = 5;

/** The optional quick ratings, in the order the form and the summary show them (Review columns). */
export const QUICK_RATING_KEYS = ["cleanliness", "accuracy", "checkIn", "communication", "location", "value"] as const;
export type QuickRatingKey = (typeof QUICK_RATING_KEYS)[number];
export type QuickRatings = Partial<Record<QuickRatingKey, number | null>>;

/** Deal types whose bookings can be reviewed (short stays and hotels). */
export const REVIEWABLE_DEAL_TYPES = ["SHORT_STAY", "HOTEL_ROOM"] as const;

export function isReviewableDealType(dealType: string): boolean {
  return (REVIEWABLE_DEAL_TYPES as readonly string[]).includes(dealType);
}

export function isValidRating(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= RATING_MIN && value <= RATING_MAX;
}

// ─── Who may review, and when ────────────────────────────────

/** The days a booking can be reviewed: `opens` … `closes`, both included ("YYYY-MM-DD", Georgia). */
export function reviewWindow(checkOut: string): { opens: string; closes: string } {
  return { opens: addDays(checkOut, 1), closes: addDays(checkOut, REVIEW_WINDOW_DAYS) };
}

export type ReviewBlock =
  | "not_reviewable_type"
  | "demo"
  | "listing_gone"
  | "not_stayed"
  | "too_early"
  | "too_late"
  | "already_reviewed";

export type ReviewEligibilityInput = {
  status: string;
  /** "YYYY-MM-DD" (the morning the guest leaves). */
  checkOut: string;
  dealType: string;
  /** The listing, the guest or the host is a demo. */
  demo: boolean;
  listingDeleted: boolean;
  hasReview: boolean;
  /** Today in Georgia, "YYYY-MM-DD". */
  today: string;
};

/**
 * Can this booking be reviewed today? The caller has already checked that the user is the
 * booking's guest. Null = yes; otherwise why not (the first rule that fails, in this order).
 */
export function reviewBlock(input: ReviewEligibilityInput): ReviewBlock | null {
  if (!isReviewableDealType(input.dealType)) return "not_reviewable_type";
  if (input.demo) return "demo";
  if (input.listingDeleted) return "listing_gone";
  if (input.hasReview) return "already_reviewed";
  if (input.status !== "COMPLETED" && input.status !== "CONFIRMED") return "not_stayed";
  const { opens, closes } = reviewWindow(input.checkOut);
  if (input.today < opens) return "too_early";
  if (input.today > closes) return "too_late";
  return null;
}

export function canReview(input: ReviewEligibilityInput): boolean {
  return reviewBlock(input) === null;
}

/** Whole days left to write the review, today included (0 when the window has closed). */
export function reviewDaysLeft(checkOut: string, today: string): number {
  const { closes } = reviewWindow(checkOut);
  return Math.max(0, daysBetween(today, closes) + 1);
}

// ─── The host's reply ───────────────────────────────────────

/** One reply per review, never on a hidden review. */
export function canReply(review: { hostReply: string | null; hidden: boolean }): boolean {
  return !review.hidden && !(review.hostReply ?? "").trim();
}

// ─── Showing ratings ────────────────────────────────────────

export type RatingSummary = { count: number; average: number | null };

/**
 * Contract (3): the count of visible reviews, and their average with one decimal — only when
 * there are at least 3 (MIN_REVIEWS_FOR_AVERAGE); null before that.
 */
export function getRatingSummary(listing: { reviewCount: number; ratingSum: number }): RatingSummary {
  const count = Math.max(0, Math.trunc(listing.reviewCount || 0));
  if (count < MIN_REVIEWS_FOR_AVERAGE) return { count, average: null };
  const average = Math.round((Math.max(0, listing.ratingSum) / count) * 10) / 10;
  return { count, average: Math.min(RATING_MAX, Math.max(RATING_MIN, average)) };
}

/** The card's "★ 4.7 (12)": only with an average (3 or more visible reviews), else null. */
export function cardRating(listing: { reviewCount: number; ratingSum: number }): { average: number; count: number } | null {
  const summary = getRatingSummary(listing);
  return summary.average === null ? null : { average: summary.average, count: summary.count };
}

/**
 * How Listing.reviewCount / ratingSum change when a review becomes visible (+1) or hidden (−1).
 * Never below zero (a counter that drifted is repaired by recountListingReviews in ./service.ts).
 */
export function visibilityDelta(
  counters: { reviewCount: number; ratingSum: number },
  rating: number,
  change: "show" | "hide",
): { reviewCount: number; ratingSum: number } {
  const sign = change === "show" ? 1 : -1;
  return {
    reviewCount: Math.max(0, counters.reviewCount + sign),
    ratingSum: Math.max(0, counters.ratingSum + sign * rating),
  };
}

/** Averages of the quick ratings, each only when at least 3 visible reviews rated it. */
export function quickRatingAverages(
  rows: { key: QuickRatingKey; average: number | null; count: number }[],
): { key: QuickRatingKey; average: number }[] {
  return rows
    .filter((row) => row.count >= MIN_REVIEWS_FOR_AVERAGE && row.average !== null)
    .map((row) => ({ key: row.key, average: Math.round((row.average as number) * 10) / 10 }));
}

// ─── Who wrote it ───────────────────────────────────────────

/**
 * The name a review shows: the guest's FIRST name only (never the full name), or null ("אורח")
 * when there is none or the account was deleted.
 */
export function reviewerFirstName(guest: { firstName?: string | null; name?: string | null; status?: string | null }): string | null {
  if (guest.status === "DELETED") return null;
  return firstNameOf(guest);
}

/** "2026-10": the month the review was written, in Georgia. */
export function reviewMonth(createdAt: Date): string {
  return new Date(createdAt.getTime() + 4 * 3600 * 1000).toISOString().slice(0, 7);
}

/** "2026-10" → "2026-10-01", for formatDate(…, { month: "long", year: "numeric", timeZone: "UTC" }). */
export function reviewMonthDate(month: string): string {
  return `${month}-01`;
}

// ─── Translations ───────────────────────────────────────────

export type ReviewTranslations = Partial<Record<AppLocale, string>>;

/** Review.translations / hostReplyTranslations (any JSON) → the languages with a non-empty text. */
export function parseTranslations(value: unknown): ReviewTranslations {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: ReviewTranslations = {};
  for (const locale of locales) {
    const text = (value as Record<string, unknown>)[locale];
    if (typeof text === "string" && text.trim()) out[locale] = text;
  }
  return out;
}

export type ShownText = {
  /** What shows first: the translation into the reader's language, else the original. */
  shown: string;
  original: string;
  /** A machine translation is shown ("הצגת המקור" switches to the original). */
  translated: boolean;
  /** The language of the original. */
  language: AppLocale;
};

/**
 * Which text a reader sees: the translation into their language when there is one (the provider
 * had a key when the review was posted), else the original — never a blank.
 */
export function pickReviewText(text: string, language: AppLocale, translations: unknown, reader: AppLocale): ShownText {
  const parsed = parseTranslations(translations);
  const translation = reader !== language ? parsed[reader]?.trim() : undefined;
  return translation ? { shown: translation, original: text, translated: true, language } : { shown: text, original: text, translated: false, language };
}

/** The languages a new text is translated into: all but its own. */
export function translationTargets(language: AppLocale): AppLocale[] {
  return locales.filter((locale) => locale !== language);
}

// ─── Admin ──────────────────────────────────────────────────

/** Why staff hide a review (admin.reviews.hideReasons.<code>). Every hide also needs a note. */
export const REVIEW_HIDE_REASONS = [
  "offensive",
  "discrimination",
  "personal_info",
  "not_about_stay",
  "not_genuine",
  "other",
] as const;
export type ReviewHideReason = (typeof REVIEW_HIDE_REASONS)[number];

export function isReviewHideReason(value: unknown): value is ReviewHideReason {
  return typeof value === "string" && (REVIEW_HIDE_REASONS as readonly string[]).includes(value);
}

/** Review.hiddenReason holds "<code>\n<note>" (staff-only; the note is also in AuditLog). */
export function formatHiddenReason(code: ReviewHideReason, note: string): string {
  return `${code}\n${note.trim()}`;
}

export function parseHiddenReason(value: string | null | undefined): { code: ReviewHideReason; note: string } | null {
  if (!value) return null;
  const [first, ...rest] = value.split("\n");
  return { code: isReviewHideReason(first) ? first : "other", note: rest.join("\n").trim() };
}

/** What a host may say about a review they report, or a guest about the host's reply (Report.reason). */
export const REVIEW_REPORT_REASONS = ["OFFENSIVE", "OTHER"] as const;
export type ReviewReportReason = (typeof REVIEW_REPORT_REASONS)[number];
export const REVIEW_REPORT_DETAILS_MIN = 10;

/**
 * What a REVIEW report is about: the review itself (the host of the place reported it) or the
 * host's public reply (the guest who wrote the review reported it). A deleted reporter counts as
 * the review.
 */
export function reportedPart(review: { hostUserId: string }, reporterId: string | null | undefined): "review" | "reply" {
  return reporterId && reporterId !== review.hostUserId ? "reply" : "review";
}
export const REVIEW_REPORT_DETAILS_MAX = 1000;
