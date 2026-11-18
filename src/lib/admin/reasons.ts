/**
 * Reason codes staff choose from (pure, client-safe). Labels and the text the user receives
 * (in THEIR language) live in messages/<locale>/admin.json:
 *   userReasons.<code>.label / .explanation
 *   verificationReasons.<code>.label / .explanation
 * Listing moderation reasons are MODERATION_REASONS in @/lib/listing/fields ("moderation" namespace).
 */

/** Why an account is warned, suspended or banned. */
export const USER_ACTION_REASONS = [
  "scam",
  "fake_listings",
  "asked_money_upfront",
  "spam",
  "abusive_behavior",
  "impersonation",
  "discrimination",
  /** A host cancelled, refused or questioned a guest because of who they are (round 3, brief 8.2). */
  "turned_away",
  "multiple_accounts",
  "rules_violation",
  "other",
] as const;
export type UserActionReason = (typeof USER_ACTION_REASONS)[number];

/** Why a verification request is rejected or needs more information. */
export const VERIFICATION_REASONS = [
  "document_unreadable",
  "document_expired",
  "document_incomplete",
  "wrong_document",
  "name_mismatch",
  "selfie_mismatch",
  "cadastral_mismatch",
  "suspected_forgery",
  "other",
] as const;
export type VerificationReason = (typeof VERIFICATION_REASONS)[number];

export function isUserActionReason(value: unknown): value is UserActionReason {
  return typeof value === "string" && (USER_ACTION_REASONS as readonly string[]).includes(value);
}

export function isVerificationReason(value: unknown): value is VerificationReason {
  return typeof value === "string" && (VERIFICATION_REASONS as readonly string[]).includes(value);
}

/** Limits shared by the forms and the server actions. */
export const ADMIN_TEXT_LIMITS = {
  note: 2000,
  resolution: 1000,
  adminNote: 4000,
  savedReplyTitle: 120,
  savedReplyBody: 5000,
} as const;
