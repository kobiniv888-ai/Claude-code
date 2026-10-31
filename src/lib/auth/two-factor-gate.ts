/**
 * Login-library (Better Auth) endpoints that need the 2-step code first (pure, testable).
 *
 * After the phone code (or Google/Apple) a session exists, but for accounts with 2-step login
 * it only becomes "verified" once the authenticator code is entered (Session.twoFactorVerifiedAt).
 * Our own pages and actions already refuse such a session (requireUser / requireUserForAction).
 * These library endpoints are blocked in the auth `before` hook until then, with the error
 * code TWO_FACTOR_REQUIRED: signing out other devices, connecting or disconnecting Google/Apple,
 * reading linked accounts or their tokens, and changing the phone number.
 */

export const TWO_FACTOR_GATED_PATHS: ReadonlySet<string> = new Set([
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/list-sessions",
  "/link-social",
  "/unlink-account",
  "/list-accounts",
  "/account-info",
  "/get-access-token",
  "/refresh-token",
]);

/** True when this request needs a 2-step-verified session (if the account uses 2-step login). */
export function needsTwoFactorSession(path: string, body: unknown): boolean {
  if (TWO_FACTOR_GATED_PATHS.has(path)) return true;
  // The same endpoint signs in (no session) or, with updatePhoneNumber, changes the phone number.
  if (path === "/phone-number/verify") {
    return !!body && typeof body === "object" && (body as { updatePhoneNumber?: unknown }).updatePhoneNumber === true;
  }
  return false;
}

/** The session's account uses 2-step login and the code was not entered in this session yet. */
export function isTwoFactorPending(state: { twoFactorEnabled: boolean; twoFactorVerifiedAt: Date | null }): boolean {
  return state.twoFactorEnabled && state.twoFactorVerifiedAt === null;
}
