import "server-only";
import { LOGIN_CODE_TTL_SECONDS } from "@/lib/auth/code-rules";
import { REVEAL_DAYS_AFTER_CHECKOUT } from "@/lib/booking/policy";
import {
  AUDIT_LOG_RETENTION_DAYS,
  CASE_TEXT_RETENTION_DAYS,
  CONTACT_CLICK_USER_RETENTION_DAYS,
  DEAD_PUSH_RETENTION_DAYS,
  DEVICE_LINK_RETENTION_DAYS,
  EMAIL_OUTBOX_RETENTION_DAYS,
  EXPIRED_SESSION_RETENTION_DAYS,
  GUEST_CONTACT_RETENTION_MONTHS,
  LOGIN_CODE_MAX_HOURS,
  OFFSITE_BACKUP_DEFAULT_DAYS,
  PHONE_LOOKUP_RETENTION_DAYS,
} from "@/lib/retention-times";
import { SECURITY_EVENT_RETENTION_DAYS } from "@/lib/security/events";
import { MIN_AGE, TERMS_VERSION } from "./terms";

/**
 * The numbers the privacy policy, the cookie policy and the account-deletion text quote
 * (SECURITY_REPORT 15.7.a, 15.8.b, 15.9), read from the constants the cleanup jobs use, so the text
 * can never promise a time the code does not keep. Strings (ICU arguments are never formatted with
 * Arabic-Indic digits this way). Server-only: a server page passes them to the messages.
 */
export function retentionFacts(env: Partial<Record<string, string | undefined>> = process.env) {
  const backupDays = Number(env.OFFSITE_RETENTION_DAYS) || OFFSITE_BACKUP_DEFAULT_DAYS;
  return {
    codeMinutes: String(Math.round(LOGIN_CODE_TTL_SECONDS / 60)),
    codeHours: String(LOGIN_CODE_MAX_HOURS),
    sessionDays: String(EXPIRED_SESSION_RETENTION_DAYS),
    guestContactMonths: String(GUEST_CONTACT_RETENTION_MONTHS),
    addressDays: String(REVEAL_DAYS_AFTER_CHECKOUT),
    caseDays: String(CASE_TEXT_RETENTION_DAYS),
    phoneLookupDays: String(PHONE_LOOKUP_RETENTION_DAYS),
    pushDays: String(DEAD_PUSH_RETENTION_DAYS),
    outboxDays: String(EMAIL_OUTBOX_RETENTION_DAYS),
    contactClickDays: String(CONTACT_CLICK_USER_RETENTION_DAYS),
    securityDays: String(SECURITY_EVENT_RETENTION_DAYS),
    auditDays: String(AUDIT_LOG_RETENTION_DAYS),
    deviceDays: String(DEVICE_LINK_RETENTION_DAYS),
    backupDays: String(backupDays),
    minAge: String(MIN_AGE),
    termsVersion: TERMS_VERSION,
  };
}

export type RetentionFacts = ReturnType<typeof retentionFacts>;
