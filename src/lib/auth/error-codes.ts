/**
 * Maps errors from Better Auth (and our own auth hooks) to message keys in the `auth`
 * namespace (`auth.errors.<key>`). Pure, safe on server and client.
 */

/** Codes thrown by our own hooks in src/lib/auth/server.ts. */
export const AUTH_HOOK_ERRORS = {
  RATE_LIMITED: "RATE_LIMITED",
  COUNTRY_NOT_SUPPORTED: "COUNTRY_NOT_SUPPORTED",
  SMS_UNAVAILABLE: "SMS_UNAVAILABLE",
  ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED",
  ACCOUNT_BANNED: "ACCOUNT_BANNED",
  ACCOUNT_DELETED: "ACCOUNT_DELETED",
} as const;

export type AuthErrorKey =
  | "invalid_code"
  | "code_expired"
  | "too_many_attempts"
  | "invalid_phone"
  | "country_not_supported"
  | "rate_limited"
  | "phone_taken"
  | "captcha_failed"
  | "account_suspended"
  | "account_banned"
  | "sms_unavailable"
  | "oauth_failed"
  | "network"
  | "unknown";

const BY_CODE: Record<string, AuthErrorKey> = {
  INVALID_OTP: "invalid_code",
  OTP_EXPIRED: "code_expired",
  OTP_NOT_FOUND: "code_expired",
  TOO_MANY_ATTEMPTS: "too_many_attempts",
  INVALID_PHONE_NUMBER: "invalid_phone",
  PHONE_NUMBER_EXIST: "phone_taken",
  VERIFICATION_FAILED: "captcha_failed",
  MISSING_RESPONSE: "captcha_failed",
  [AUTH_HOOK_ERRORS.RATE_LIMITED]: "rate_limited",
  [AUTH_HOOK_ERRORS.COUNTRY_NOT_SUPPORTED]: "country_not_supported",
  [AUTH_HOOK_ERRORS.SMS_UNAVAILABLE]: "sms_unavailable",
  [AUTH_HOOK_ERRORS.ACCOUNT_SUSPENDED]: "account_suspended",
  [AUTH_HOOK_ERRORS.ACCOUNT_BANNED]: "account_banned",
  [AUTH_HOOK_ERRORS.ACCOUNT_DELETED]: "account_banned",
};

/** Error shape returned by the Better Auth client (`{ error }` of a call). */
export type AuthClientError = {
  code?: string | null;
  message?: string | null;
  status?: number | null;
} | null | undefined;

export function authErrorKey(error: AuthClientError): AuthErrorKey {
  if (!error) return "unknown";
  const code = error.code?.toUpperCase();
  if (code && BY_CODE[code]) return BY_CODE[code];
  if (error.status === 429) return "rate_limited";
  if (error.status === 0 || error.status === undefined) return "network";
  return "unknown";
}

/**
 * OAuth (Google/Apple) failures come back to the login page as `?error=<code>`.
 * Better Auth uses lower_snake codes; our session hook uses the codes above.
 */
export function oauthErrorKey(code: string | null | undefined): AuthErrorKey | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  if (BY_CODE[upper]) return BY_CODE[upper];
  return "oauth_failed";
}
