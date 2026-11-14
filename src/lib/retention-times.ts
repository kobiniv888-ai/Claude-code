/**
 * How long personal data of each kind is kept (founder's answers of 8 and 9 November 2026,
 * answer 7; SECURITY_REPORT 15.9). Pure, no imports: the daily cleanup
 * (src/lib/admin/maintenance/retention.ts, /api/cron/cleanup), the report screenshots (src/lib/reports/turned-away.ts)
 * and the tests read the same numbers.
 */

/**
 * ONE clock for the texts of a closed case: support-ticket texts, report texts and report
 * screenshots go this many days after the ticket was closed or the report decided. An INTERIM
 * value: the lawyer is asked for "the shortest safe time" (OWNER_TODO); change it here only.
 */
export const CASE_TEXT_RETENTION_DAYS = 180;

/** Expired login sessions (they hold the IP address and the browser) go 30 days after they expired. */
export const EXPIRED_SESSION_RETENTION_DAYS = 30;

/**
 * Login and verification codes (Verification rows) live at most 24 hours: every code expires
 * within minutes, and the daily cleanup deletes every expired row (/api/cron/cleanup).
 */
export const LOGIN_CODE_MAX_HOURS = 24;

/** The phone-line checks (PhoneLookup: line type, carrier) are kept 90 days, then checked again if needed. */
export const PHONE_LOOKUP_RETENTION_DAYS = 90;

/** A browser notification subscription that keeps failing and has not worked for 90 days is removed. */
export const DEAD_PUSH_RETENTION_DAYS = 90;

/** What an erased text keeps instead (the same mark as account deletion). */
export const ERASED_TEXT = "—";
