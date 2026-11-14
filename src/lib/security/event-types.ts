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
  // Operations and incidents (SECURITY_REPORT 12.4.b, 12.5.c, 16.3, 17.1, 4.7.a; builder ops-incident).
  /** The weekly encrypted off-site backup was uploaded and verified (meta: via, bytes, tables). */
  "offsite_backup_ok",
  /** The off-site backup failed (meta: via, step, reason: an error class name, never its text). */
  "offsite_backup_failed",
  /** An ADMIN switched maintenance mode on or off (meta: on). */
  "maintenance_mode_changed",
  /** An ADMIN ended every session but their own (meta: sessions). */
  "all_sessions_ended",
  /** A booking, trip, list or ticket link that matches nothing for this visitor (meta: kind): ID guessing shows as a burst. */
  "id_not_found",
  // Field encryption (SECURITY_REPORT 12.3.c, D7; builder field-encryption).
  /** An encrypted exact address, pin or guest phone could not be opened (meta: field, reason, where); shown as not available. */
  "field_decrypt_failed",
  // Trust and scams (SECURITY_REPORT 14.2.a, 14.5.b; builder trust-scams).
  /** Payment details (a payment link, IBAN, card, wallet, transfer ask…) were refused in user text (meta: surface, kinds). */
  "payment_details_blocked",
  /** A listing got an unusual number of reviews in a short time (meta: count, hours). */
  "review_burst",
  // Fake sign-ups (SECURITY_REPORT 3.8.b; builder legal-privacy).
  /** A new account is over the cap of accounts made on one device in 30 days (meta: accounts, windowDays, cap). Flag only, never a block. */
  "signup_device_cap",
] as const;

export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

export function isSecurityEventType(value: unknown): value is SecurityEventType {
  return typeof value === "string" && (SECURITY_EVENT_TYPES as readonly string[]).includes(value);
}
