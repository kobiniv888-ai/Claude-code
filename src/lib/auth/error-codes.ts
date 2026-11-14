/**
 * Maps errors from Better Auth (and our own auth hooks) to message keys in the `auth`
 * namespace (`auth.errors.<key>`). Pure, safe on server and client.
 */

/** Codes thrown by our own hooks in src/lib/auth/server.ts. */
export const AUTH_HOOK_ERRORS = {
  RATE_LIMITED: "RATE_LIMITED",
  COUNTRY_NOT_SUPPORTED: "COUNTRY_NOT_SUPPORTED",
  SMS_UNAVAILABLE: "SMS_UNAVAILABLE",
  /** Phone login over HTTP outside development/test mode (phone codes only verify a number there). */
  PHONE_LOGIN_DISABLED: "PHONE_LOGIN_DISABLED",
  INVALID_EMAIL: "INVALID_EMAIL",
  /** No email service (Resend) and codes may not be shown on screen. */
  EMAIL_UNAVAILABLE: "EMAIL_UNAVAILABLE",
  ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED",
  ACCOUNT_BANNED: "ACCOUNT_BANNED",
  ACCOUNT_DELETED: "ACCOUNT_DELETED",
  /** A demo account on the real site (SITE_ENV=production): demo accounts never sign in there. */
  DEMO_ACCOUNT_DISABLED: "DEMO_ACCOUNT_DISABLED",
  /** A sensitive account function before the 2-step code was entered (./two-factor-gate.ts). */
  TWO_FACTOR_REQUIRED: "TWO_FACTOR_REQUIRED",
  /** Too soon after the last code to this number / address (60/120/300/900 s; body `retryAfter`). */
  CODE_RESEND_WAIT: "CODE_RESEND_WAIT",
  /** Today's codes for this number / address / IP / device are used up (body `retryAfter`). */
  CODE_DAILY_CAP: "CODE_DAILY_CAP",
  /** SMS codes go to mobile numbers only (no landlines, premium-rate or VoIP numbers). */
  NOT_MOBILE_NUMBER: "NOT_MOBILE_NUMBER",
  /** The daily SMS budget is used up, or texts to this country are paused (./sms-guard.ts). */
  SMS_PAUSED: "SMS_PAUSED",
} as const;

export type AuthErrorKey =
  | "invalid_code"
  | "code_expired"
  | "too_many_attempts"
  | "invalid_phone"
  | "invalid_email"
  | "email_unavailable"
  | "phone_login_disabled"
  | "country_not_supported"
  | "rate_limited"
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
  | "code_wait"
  | "code_daily_cap"
  | "not_mobile"
  | "sms_paused"
  | "phone_check_not_here"
  // Google/Apple (SECURITY_REPORT 3.3): an existing email account is joined only from the settings;
  // unverified provider emails are refused; a sensitive change needs a fresh code (3.6).
  | "google_link_needed"
  | "oauth_email_unverified"
  | "fresh_proof_required"
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
  ACCOUNT_NOT_LINKED: "google_link_needed",
  OAUTH_EMAIL_UNVERIFIED: "oauth_email_unverified",
  FRESH_PROOF_REQUIRED: "fresh_proof_required",
  INVALID_OTP: "invalid_code",
  OTP_EXPIRED: "code_expired",
  OTP_NOT_FOUND: "code_expired",
  TOO_MANY_ATTEMPTS: "too_many_attempts",
  INVALID_PHONE_NUMBER: "invalid_phone",
  // Founder's answer (5): never "this number belongs to another account" — the same answer as a
  // wrong code (the library's phone-change endpoint is blocked anyway: ./server.ts).
  PHONE_NUMBER_EXIST: "invalid_code",
  VERIFICATION_FAILED: "captcha_failed",
  MISSING_RESPONSE: "captcha_failed",
  [AUTH_HOOK_ERRORS.RATE_LIMITED]: "rate_limited",
  [AUTH_HOOK_ERRORS.COUNTRY_NOT_SUPPORTED]: "country_not_supported",
  [AUTH_HOOK_ERRORS.SMS_UNAVAILABLE]: "sms_unavailable",
  [AUTH_HOOK_ERRORS.PHONE_LOGIN_DISABLED]: "phone_login_disabled",
  [AUTH_HOOK_ERRORS.INVALID_EMAIL]: "invalid_email",
  [AUTH_HOOK_ERRORS.EMAIL_UNAVAILABLE]: "email_unavailable",
  [AUTH_HOOK_ERRORS.ACCOUNT_SUSPENDED]: "account_suspended",
  [AUTH_HOOK_ERRORS.ACCOUNT_BANNED]: "account_banned",
  [AUTH_HOOK_ERRORS.ACCOUNT_DELETED]: "account_banned",
  [AUTH_HOOK_ERRORS.DEMO_ACCOUNT_DISABLED]: "account_banned",
  [AUTH_HOOK_ERRORS.CODE_RESEND_WAIT]: "code_wait",
  [AUTH_HOOK_ERRORS.CODE_DAILY_CAP]: "code_daily_cap",
  [AUTH_HOOK_ERRORS.NOT_MOBILE_NUMBER]: "not_mobile",
  [AUTH_HOOK_ERRORS.SMS_PAUSED]: "sms_paused",
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
  /** Seconds to wait (our code limits: CODE_RESEND_WAIT, CODE_DAILY_CAP). */
  retryAfter?: number | null;
} | null | undefined;

/** Error keys that come with a wait in seconds. */
const TIMED_KEYS = new Set<string>(["code_wait", "code_daily_cap"]);

/** A refused code send as the login forms use it: the message key and, for a limit, the seconds to wait. */
export type AuthFailure = { key: AuthErrorKey | string; retryAfter: number | null };

function seconds(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(Math.ceil(n), 7 * 24 * 3600) : null;
}

/** A Better Auth client error → key + wait. */
export function authFailure(error: AuthClientError): AuthFailure {
  const key = authErrorKey(error);
  return { key, retryAfter: TIMED_KEYS.has(key) ? seconds(error?.retryAfter) : null };
}

/** Server actions return a wait inside the error code: "code_wait:120" (see `parseActionFailure`). */
export function timedActionError(key: "code_wait" | "code_daily_cap" | "rate_limited", retryAfter: number): string {
  return `${key}:${Math.max(1, Math.ceil(retryAfter))}`;
}

/** "code_wait:120" → { key: "code_wait", retryAfter: 120 }; any other code passes through. */
export function parseActionFailure(error: string): AuthFailure {
  const match = /^([a-z_]+):(\d+)$/.exec(error);
  if (!match) return { key: error, retryAfter: null };
  return { key: match[1]!, retryAfter: TIMED_KEYS.has(match[1]!) ? seconds(match[2]) : null };
}

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
