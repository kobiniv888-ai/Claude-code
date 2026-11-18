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

/** Founder's decision 9 (8 Nov 2026): guest contact details go 3 months after check-out. */
export const GUEST_CONTACT_RETENTION_MONTHS = 3;
/** Founder's answer Q20: staff actions are kept for 1 year. */
export const AUDIT_LOG_RETENTION_DAYS = 365;
/** The email outbox holds the recipient and the full message (names, booking details). */
export const EMAIL_OUTBOX_RETENTION_DAYS = 90;
/** "Show contact" taps keep their account this long (the daily cap needs one day), then only the count stays. */
export const CONTACT_CLICK_USER_RETENTION_DAYS = 90;
/** A device not seen for a year is forgotten (the sign-up device cap looks back 30 days). */
export const DEVICE_LINK_RETENTION_DAYS = 365;
/**
 * Each off-site backup copy stays locked this many days unless OFFSITE_RETENTION_DAYS says
 * otherwise (the same default as src/lib/admin/maintenance/offsite-config.ts; a test keeps them equal).
 */
export const OFFSITE_BACKUP_DEFAULT_DAYS = 60;
/** The lock periods OFFSITE_RETENTION_DAYS may set (the job refuses others). */
export const OFFSITE_BACKUP_MIN_DAYS = 14;
export const OFFSITE_BACKUP_MAX_DAYS = 365;

/**
 * The bucket's lifecycle rule (docs/BACKUPS.md, "The lifecycle rule"): a copy is hidden this many
 * days after its lock ends, and deleted this many days after it was hidden. With the default lock
 * a copy exists at most 60 + 1 + 1 = 62 days (S2 review LP-3, ops-backup-1).
 */
export const OFFSITE_LIFECYCLE_HIDE_MARGIN_DAYS = 1;
export const OFFSITE_LIFECYCLE_DELETE_AFTER_HIDE_DAYS = 1;

/** The lock period in force: OFFSITE_RETENTION_DAYS when valid, else the default (never an invalid value). */
export function offsiteLockDays(env: Partial<Record<string, string | undefined>>): number {
  const raw = env.OFFSITE_RETENTION_DAYS?.trim();
  if (!raw) return OFFSITE_BACKUP_DEFAULT_DAYS;
  const days = Number(raw);
  return Number.isInteger(days) && days >= OFFSITE_BACKUP_MIN_DAYS && days <= OFFSITE_BACKUP_MAX_DAYS ? days : OFFSITE_BACKUP_DEFAULT_DAYS;
}

/** The longest an off-site copy can exist when the lifecycle rule is set as documented (the privacy text quotes it). */
export function offsiteCopyMaxAgeDays(env: Partial<Record<string, string | undefined>>): number {
  return offsiteLockDays(env) + OFFSITE_LIFECYCLE_HIDE_MARGIN_DAYS + OFFSITE_LIFECYCLE_DELETE_AFTER_HIDE_DAYS;
}

/**
 * How far back the database host's own point-in-time restore reaches (Neon: the plan's "history
 * retention"), which also holds deleted accounts until it rolls over. The privacy policy quotes it
 * (S2 review LP-3). DATABASE_RESTORE_DAYS overrides it; the founder confirms the plan's value
 * (OWNER_TODO, INCIDENT_PLAN.md "Facts to fill in").
 */
export const DATABASE_RESTORE_DEFAULT_DAYS = 7;

/** What an erased text keeps instead (the same mark as account deletion). */
export const ERASED_TEXT = "—";
