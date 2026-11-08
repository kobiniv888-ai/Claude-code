/**
 * The kinds of security events (SECURITY_REPORT 16.2, D6). One name per thing that happened, in
 * snake_case. Builders add new ones here with a one-line edit (and nowhere else); events with an
 * unknown type are dropped by recordSecurityEvent (src/lib/security/events.ts).
 *
 * Pure, so tests and admin pages can import the list.
 */
export const SECURITY_EVENT_TYPES = [
  /** A login code reached its wrong-guess limit (5) and died. */
  "login_code_locked",
  /** The daily SMS budget is used up: no more codes by SMS today. */
  "sms_budget_reached",
  /** Too few SMS codes are being confirmed for the number sent (SMS-pumping sign). */
  "sms_ratio_low",
  /** A login / phone-check code went out by SMS (meta: country only; for the confirmed ÷ sent ratio). */
  "sms_code_sent",
  /** A code that went out by SMS was confirmed (meta: country only). */
  "sms_code_verified",
  /** A staff account hit the daily 2-step (authenticator) wrong-try limit. */
  "totp_locked",
  /** A locked staff account asked for / used the email code that resets the 2-step counter. */
  "totp_unlock_email",
  /** A 2-step recovery code was used instead of the authenticator. */
  "recovery_code_used",
  /** A sign-in from a device this account has not used before. */
  "new_device_login",
  /** Email, phone, 2-step login or contact details changed. */
  "sensitive_change",
  /** A staff session ended after the idle limit. */
  "staff_session_idle_logout",
  /** A guest hit the upcoming-bookings cap (2 per verified phone, decision 8). */
  "booking_cap_hit",
  /** A visitor hit the daily "show contact" cap. */
  "show_contact_cap_hit",
  /** A host replaced a calendar export link (the old one stops working; SECURITY_REPORT 4.7.b). */
  "calendar_link_replaced",
  /** The browser reported a Content-Security-Policy violation. */
  "csp_report",
  /** New kinds of CSP violation hit the hourly cap of /api/csp-report (one event per hour). */
  "csp_report_capped",
  /** A new session from a login (meta: method email_code / phone_code / social, staff). Not our own rotation. */
  "login_success",
  /** A login code was refused (meta: channel email / sms, reason: the error code). */
  "login_failed",
  /** A login code went out by email (meta: the visitor's country, route). Never the address. */
  "email_code_sent",
  /** A signed-in account was refused a staff page or action (meta: access, permission). */
  "permission_denied",
  /** A rate limit refused its first request of a window (meta: scope, the key's first parts; never ids). */
  "rate_limited",
  /** "Show contact" revealed a listing's contact details (userId only, no listing id). */
  "contact_revealed",
  /** An account downloaded its data ("Download my data"). */
  "data_export",
  /** An account deleted itself. */
  "account_deleted",
] as const;

export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

export function isSecurityEventType(value: unknown): value is SecurityEventType {
  return typeof value === "string" && (SECURITY_EVENT_TYPES as readonly string[]).includes(value);
}
