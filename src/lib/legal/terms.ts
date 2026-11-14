/**
 * The Terms of use acceptance and the 18+ confirmation (SECURITY_REPORT 15.11.b/c, D4). Pure, no
 * imports: the server (./terms-server.ts), the actions (./actions.ts), the pages and the tests read
 * the same rules.
 *
 * - TERMS_VERSION names the Terms in force. Bump it (to the date of the change) when the Terms
 *   change in a way people must accept again; the Terms page shows it, and every account is asked
 *   again before its next booking or listing publish.
 * - Every acceptance is a TermsAcceptance row (user, version, time, ageConfirmed). It is written at
 *   sign-up (the "terms" step of the login), at the account's FIRST booking and FIRST listing
 *   publish, and at the next booking/publish after the version changed. No row is ever written
 *   without the person ticking "I am 18 or older and I accept the Terms" in that same request.
 * - The server refuses a booking or a publish with "terms_required" when the acceptance it needs is
 *   missing (fails closed: a database error refuses too).
 */

/** The Terms version in force (the date of the change, yyyy-mm-dd). */
export const TERMS_VERSION = "2026-11-14";

/** Users must be at least this old (Terms, accounts section). */
export const MIN_AGE = 18;

/** The error code of a refused action ("tick the Terms + 18+ box first"). */
export const TERMS_REQUIRED = "terms_required";

/** Where an acceptance is asked for. */
export const TERMS_PURPOSES = ["signup", "booking", "publish"] as const;
export type TermsPurpose = (typeof TERMS_PURPOSES)[number];

export function isTermsPurpose(value: unknown): value is TermsPurpose {
  return typeof value === "string" && (TERMS_PURPOSES as readonly string[]).includes(value);
}

/** The account's newest acceptance (or null: none yet). */
export type LatestAcceptance = { version: string; ageConfirmed: boolean } | null;

/** True when the newest acceptance is of the Terms in force, with the 18+ confirmation. */
export function hasCurrentAcceptance(latest: LatestAcceptance, version: string = TERMS_VERSION): boolean {
  return !!latest && latest.version === version && latest.ageConfirmed === true;
}

/**
 * Must the person tick the box for this purpose?
 *   - signup: only when the account never accepted any version (new accounts, and accounts made
 *     before acceptances were logged); a newer version is asked at the next booking/publish;
 *   - booking / publish: at the account's first one (`first`), and whenever the newest acceptance
 *     is not of the version in force (or lacks the 18+ confirmation).
 */
export function termsNeeded(input: { purpose: TermsPurpose; latest: LatestAcceptance; first: boolean; version?: string }): boolean {
  if (input.purpose === "signup") return input.latest === null;
  return input.first || !hasCurrentAcceptance(input.latest, input.version);
}

/**
 * The ticked box as the request sends it. Both must be exactly `true` (a string "true", 1 or a
 * missing field is not a yes). Only one of them is never enough: the 18+ confirmation and the
 * acceptance are one statement.
 */
export function termsConsentGiven(input: unknown): boolean {
  if (!input || typeof input !== "object") return false;
  const value = input as { termsAccepted?: unknown; ageConfirmed?: unknown };
  return value.termsAccepted === true && value.ageConfirmed === true;
}

/** What a client form adds to its request once the box is ticked. */
export const TERMS_CONSENT = { termsAccepted: true, ageConfirmed: true } as const;
