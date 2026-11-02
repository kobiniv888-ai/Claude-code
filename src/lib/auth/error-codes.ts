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
  /** A sensitive account function before the 2-step code was entered (./two-factor-gate.ts). */
  TWO_FACTOR_REQUIRED: "TWO_FACTOR_REQUIRED",
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
  | "two_factor_required"
  | "sms_unavailable"
  | "oauth_failed"
  | "origin_rejected"
  | "server_unavailable"
  | "proxy_blocked"
  | "network"
  | "unknown";

/**
 * Keys that mention Google/Apple. When neither is configured (or the user is already signed in),
 * show `<key>_phone_only` instead (see `phoneOnlyErrorKey`).
 */
const SOCIAL_HINT_KEYS = new Set<string>(["country_not_supported", "sms_unavailable"]);

/** `country_not_supported` → `country_not_supported_phone_only` when Google/Apple are not offered. */
export function phoneOnlyErrorKey<K extends string>(key: K, phoneOnly: boolean): K | `${K}_phone_only` {
  return phoneOnly && SOCIAL_HINT_KEYS.has(key) ? `${key}_phone_only` : key;
}

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
  [AUTH_HOOK_ERRORS.TWO_FACTOR_REQUIRED]: "two_factor_required",
  // Better Auth's CSRF/origin checks. In Codespaces the port forwarder can rewrite Origin, so these
  // were the hidden cause of "something went wrong" on "send code" (see ./dev-origins.ts).
  INVALID_ORIGIN: "origin_rejected",
  MISSING_OR_NULL_ORIGIN: "origin_rejected",
  CROSS_SITE_NAVIGATION_LOGIN_BLOCKED: "origin_rejected",
  FAILED_TO_CREATE_USER: "server_unavailable",
  FAILED_TO_CREATE_SESSION: "server_unavailable",
};

/** Error shape returned by the Better Auth client (`{ error }` of a call). */
export type AuthClientError = {
  code?: string | null;
  message?: string | null;
  status?: number | null;
  statusText?: string | null;
} | null | undefined;

/**
 * Maps a Better Auth client error to a message key. A response without a JSON `code` is not from
 * our server: a 401/403/407 there is a proxy page (e.g. the Codespaces forwarder), a 5xx is a
 * crashed or unreachable server. In development the raw code is logged with console.warn.
 */
export function authErrorKey(error: AuthClientError): AuthErrorKey {
  if (!error) return "unknown";
  const key = resolveAuthErrorKey(error);
  if (process.env.NODE_ENV === "development") {
    console.warn(
      `[auth] ${error.code ?? "(no code)"} — HTTP ${error.status ?? "?"} ${error.statusText ?? ""} → ${key}`,
      error.message ?? "",
    );
  }
  return key;
}

function resolveAuthErrorKey(error: NonNullable<AuthClientError>): AuthErrorKey {
  const code = error.code?.toUpperCase();
  if (code && BY_CODE[code]) return BY_CODE[code];
  const status = error.status;
  if (status === 429) return "rate_limited";
  // better-fetch reports a failed fetch (offline, DNS, CORS) as status 500 "Fetch Error".
  if (status === 0 || status === undefined || status === null || error.statusText === "Fetch Error") return "network";
  if (status >= 500) return "server_unavailable";
  if (!code && (status === 401 || status === 403 || status === 407)) return "proxy_blocked";
  return "unknown";
}

/** Keys that have a developer hint (`auth.devHints.<key>`), shown only in development. */
export const DEV_HINT_KEYS: ReadonlySet<AuthErrorKey> = new Set<AuthErrorKey>([
  "origin_rejected",
  "server_unavailable",
  "proxy_blocked",
  "sms_unavailable",
]);

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
