/**
 * Every account has a real EMAIL (founder's answer (5), 9 Nov 2026), so a phone-only user is never
 * locked out: the email code works when texts are capped, paused or unavailable (codes by email
 * have their own caps, src/lib/auth/login-rate-limit.ts, and never depend on the SMS budget).
 *
 * - New sign-ups: Google / Apple and email codes always bring one. A phone sign-up (phone login
 *   exists only where codes show on screen, development / staging) gets a placeholder address
 *   ("<digits>@phone.bayit.invalid") and must add a real one, verified by a code, right after the
 *   sign-up, before continuing (the login panel's "email" step).
 * - Existing phone-only accounts: the same step at their next sign-in, before continuing.
 * - Server-enforced: sensitive actions refuse an account without one with ACCOUNT_EMAIL_REQUIRED
 *   (requireAccountEmail in ./account-email-guard.ts: a booking, a phone check, the contact email).
 * The address becomes the account's LOGIN email (User.email, emailVerified), so it signs in with
 * an email code from then on (./account-email-actions.ts).
 *
 * Pure and client-safe.
 */

export const ACCOUNT_EMAIL_REQUIRED = "account_email_required";

/** Phone-only accounts get this reserved (.invalid) domain as a placeholder login email. */
const PLACEHOLDER_SUFFIX = "@phone.bayit.invalid";

/** Does this account still need a real email (its login email is the phone placeholder)? */
export function needsAccountEmail(user: { email?: string | null; emailIsPlaceholder?: boolean } | null | undefined): boolean {
  if (!user) return false;
  if (user.emailIsPlaceholder === true) return true;
  const email = user.email?.trim().toLowerCase() ?? "";
  return email === "" || email.endsWith(PLACEHOLDER_SUFFIX);
}
