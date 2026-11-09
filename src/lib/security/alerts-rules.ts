/**
 * The founder's security alerts (SECURITY_REPORT 16.3, 4.7.a, 3.8.c): which signals of the last
 * hour become an alert, and how often the same alert may repeat. Pure (no imports): the hourly job
 * (./alerts.ts, /api/cron/security-alerts) collects the numbers, these rules decide.
 *
 * The thresholds are founder choices with defaults (one line each, below). A "burst" threshold is
 * "more than N in the hour"; events that matter one by one (a staff login from a new device, a
 * 2-step lock, a recovery code, a role change, maintenance mode, "sign everyone out", a failed
 * off-site backup) alert from the first one.
 *
 * Dedupe: one alert per kind per ALERT_REPEAT_MINUTES (an hour), longer for the daily kinds
 * (certificate, missing backup). Alerts carry counts and kinds only: no names, addresses, phones,
 * IPs or ids.
 */

export const SECURITY_ALERT_WINDOW_MINUTES = 60;

/**
 * Founder choices (3.8.c sign-up bursts; 16.3 spikes): the recommended defaults. Change a number
 * here and the next hourly run uses it.
 */
export const SECURITY_ALERT_THRESHOLDS = {
  /** Refused login codes in an hour, site-wide / from one IP (hashed). */
  loginFailuresSite: 50,
  loginFailuresPerIp: 15,
  /** Login codes that reached their 5 wrong tries. */
  loginCodesLocked: 10,
  /** Login codes sent (email + SMS) in an hour. */
  codeSends: 300,
  /** Staff pages / actions refused, site-wide / from one IP. */
  permissionDenialsSite: 30,
  permissionDenialsPerIp: 10,
  /** Booking, trip, list and ticket links that matched nothing (ID guessing, 4.7.a). */
  idMissesSite: 40,
  idMissesPerIp: 15,
  /** First refusals of rate-limit windows. */
  rateLimited: 300,
  /** CSP violation reports. */
  cspReports: 200,
  /** Bookings refused by the 2-per-phone cap; visitors stopped by the "show contact" cap. */
  bookingCapHits: 5,
  showContactCapHits: 10,
  /** New accounts in an hour, site-wide / from one IP (3.8.c: "> 20 an hour, or > 5 from one connection"). */
  signupsSite: 20,
  signupsPerIp: 5,
  /** New (non-demo) listings and bookings in an hour. */
  listingsCreated: 30,
  bookingsCreated: 60,
  /** No successful off-site backup for this many days (it runs weekly). */
  offsiteMissingDays: 8,
  /** The HTTPS certificate ends within this many days. */
  certificateDays: 21,
} as const;

export const SECURITY_ALERT_KINDS = [
  "staff_new_device",
  "totp_locked",
  "totp_unlock_email",
  "recovery_code_used",
  "login_failures",
  "login_failures_ip",
  "login_codes_locked",
  "code_sends",
  "sms_paused",
  "permission_denials",
  "permission_denials_ip",
  "id_guessing",
  "id_guessing_ip",
  "rate_limited",
  "csp_reports",
  "booking_cap",
  "show_contact_cap",
  "signup_burst",
  "signup_burst_ip",
  "listing_burst",
  "booking_burst",
  "role_changed",
  "maintenance_on",
  "maintenance_off",
  "sessions_ended",
  "offsite_backup_failed",
  "offsite_backup_missing",
  "certificate_expiry",
] as const;
export type SecurityAlertKind = (typeof SECURITY_ALERT_KINDS)[number];

/** Minutes before the same kind may alert again. */
export const ALERT_REPEAT_MINUTES = 60;
const DAILY_KINDS: readonly SecurityAlertKind[] = ["offsite_backup_missing", "certificate_expiry"];
export const repeatMinutesFor = (kind: SecurityAlertKind) => (DAILY_KINDS.includes(kind) ? 24 * 60 : ALERT_REPEAT_MINUTES);

/** What the job counted over the last SECURITY_ALERT_WINDOW_MINUTES (or, for the daily facts, now). */
export type SecuritySignals = {
  /** Security events per type in the window. */
  events: Partial<Record<string, number>>;
  /** The largest count from ONE IP hash in the window, per event type. */
  perIpMax: Partial<Record<string, number>>;
  /** new_device_login events of staff accounts. */
  staffNewDevices: number;
  /** maintenance_mode_changed events, on and off. */
  maintenanceOn: number;
  maintenanceOff: number;
  /** Staff role changes in the audit log. */
  roleChanges: number;
  signupsSite: number;
  signupsPerIpMax: number;
  listingsCreated: number;
  bookingsCreated: number;
  offsite: { configured: boolean; lastOkAt: Date | null } | null;
  /** Days left on the HTTPS certificate (null: not checked). */
  certificateDaysLeft: number | null;
  now: Date;
};

export type SecurityAlert = { kind: SecurityAlertKind; count: number; threshold?: number; days?: number };

const T = SECURITY_ALERT_THRESHOLDS;

export function evaluateSecurityAlerts(s: SecuritySignals): SecurityAlert[] {
  const out: SecurityAlert[] = [];
  const n = (type: string) => s.events[type] ?? 0;
  const ip = (type: string) => s.perIpMax[type] ?? 0;
  const each = (kind: SecurityAlertKind, count: number) => {
    if (count > 0) out.push({ kind, count });
  };
  const over = (kind: SecurityAlertKind, count: number, threshold: number) => {
    if (count > threshold) out.push({ kind, count, threshold });
  };

  each("staff_new_device", s.staffNewDevices);
  each("totp_locked", n("totp_locked"));
  each("totp_unlock_email", n("totp_unlock_email"));
  each("recovery_code_used", n("recovery_code_used"));
  over("login_failures", n("login_failed"), T.loginFailuresSite);
  over("login_failures_ip", ip("login_failed"), T.loginFailuresPerIp);
  over("login_codes_locked", n("login_code_locked"), T.loginCodesLocked);
  over("code_sends", n("email_code_sent") + n("sms_code_sent"), T.codeSends);
  each("sms_paused", n("sms_budget_reached") + n("sms_ratio_low"));
  over("permission_denials", n("permission_denied"), T.permissionDenialsSite);
  over("permission_denials_ip", ip("permission_denied"), T.permissionDenialsPerIp);
  over("id_guessing", n("id_not_found"), T.idMissesSite);
  over("id_guessing_ip", ip("id_not_found"), T.idMissesPerIp);
  over("rate_limited", n("rate_limited"), T.rateLimited);
  // A capped burst of CSP reports is one event per hour: alert on it as well.
  if (n("csp_report_capped") > 0 && n("csp_report") <= T.cspReports) out.push({ kind: "csp_reports", count: n("csp_report"), threshold: T.cspReports });
  else over("csp_reports", n("csp_report"), T.cspReports);
  over("booking_cap", n("booking_cap_hit"), T.bookingCapHits);
  over("show_contact_cap", n("show_contact_cap_hit"), T.showContactCapHits);
  over("signup_burst", s.signupsSite, T.signupsSite);
  over("signup_burst_ip", s.signupsPerIpMax, T.signupsPerIp);
  over("listing_burst", s.listingsCreated, T.listingsCreated);
  over("booking_burst", s.bookingsCreated, T.bookingsCreated);
  each("role_changed", s.roleChanges);
  each("maintenance_on", s.maintenanceOn);
  each("maintenance_off", s.maintenanceOff);
  each("sessions_ended", n("all_sessions_ended"));
  each("offsite_backup_failed", n("offsite_backup_failed"));
  if (s.offsite?.configured) {
    const days = s.offsite.lastOkAt ? Math.floor((s.now.getTime() - s.offsite.lastOkAt.getTime()) / 86_400_000) : null;
    if (days === null || days >= T.offsiteMissingDays) out.push({ kind: "offsite_backup_missing", count: 1, days: days ?? T.offsiteMissingDays });
  }
  if (s.certificateDaysLeft !== null && s.certificateDaysLeft <= T.certificateDays) {
    out.push({ kind: "certificate_expiry", count: 1, days: Math.max(0, s.certificateDaysLeft) });
  }
  return out;
}

/** The alerts not already sent within their repeat time (lastSent: kind → ISO time). */
export function dueAlerts(alerts: SecurityAlert[], lastSent: Partial<Record<string, string>>, now: Date): SecurityAlert[] {
  return alerts.filter((alert) => {
    const at = lastSent[alert.kind] ? Date.parse(lastSent[alert.kind]!) : NaN;
    return !Number.isFinite(at) || now.getTime() - at >= repeatMinutesFor(alert.kind) * 60_000 - 60_000;
  });
}
