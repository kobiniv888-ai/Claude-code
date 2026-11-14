import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { VISIT_SET_ACTION } from "@/lib/admin/badges/server";
import { LONG_STAY_REVIEWED_ACTION } from "@/lib/admin/server/guest-flags";
import { dayToDate, isDay, tbilisiToday } from "@/lib/booking/dates";
import { db } from "@/lib/db";
import {
  CASE_TEXT_RETENTION_DAYS,
  DEAD_PUSH_RETENTION_DAYS,
  ERASED_TEXT,
  EXPIRED_SESSION_RETENTION_DAYS,
  PHONE_LOOKUP_RETENTION_DAYS,
} from "@/lib/retention-times";

/**
 * Automatic deletion of personal data that is no longer needed (security checklist 15.9,
 * SECURITY_REPORT 15.9 and the founder's decisions of 8 November 2026). Each job runs as its own
 * step of the daily cleanup (/api/cron/cleanup), is idempotent (a second run the same day changes
 * nothing) and never touches the anonymous numbers the stats need.
 *
 *   await eraseOldGuestContacts(now)   // → number of bookings blanked
 *
 * `scope` (every job) narrows the rows for tests on the shared database; the cron passes none.
 *
 * | Data                                          | Kept for                       | Job                         |
 * |-----------------------------------------------|--------------------------------|-----------------------------|
 * | Guest contact details on finished bookings    | 3 months after check-out (D9), | eraseOldGuestContacts       |
 * |                                               | or after the cancellation      |                             |
 * | Staff audit log                               | 1 year (Q20); a "long stay     | purgeOldAuditLogs           |
 * |                                               | reviewed" mark until its stay  |                             |
 * |                                               | has ended                      |                             |
 * | Email outbox (recipient + full message)       | 90 days                        | purgeOldEmailOutbox         |
 * | Who tapped "show contact" (ContactClick.user) | 90 days, then anonymous        | anonymizeOldContactClicks   |
 * | Device ↔ account links (DeviceLink)           | 1 year after last seen         | purgeStaleDeviceLinks       |
 * | Security events                               | 90 days (src/lib/security)     | purgeOldSecurityEvents      |
 * | Login and verification codes                  | until they expire (≤ 24 hours) | cleanup route               |
 * | Expired login sessions (IP, browser)          | 30 days after they expired     | purgeExpiredSessions        |
 * | Support-ticket texts (subject, messages,      | 180 days after closing (ONE    | eraseClosedCaseTexts        |
 * | rating comment, a guest's name and email)     | clock, @/lib/retention-times)  |                             |
 * | Report texts (details, staff notes)           | 180 days after the decision    | eraseClosedCaseTexts        |
 * | Report screenshots                            | 180 days after the decision    | src/lib/reports/retention   |
 * | Phone-line checks (PhoneLookup)               | 90 days                        | purgeOldPhoneLookups        |
 * | Notification subscriptions that keep failing  | 90 days without a success      | purgeDeadPushSubscriptions  |
 * | ID documents                                  | 7 days after the decision      | cleanup route               |
 *
 * Not automatic yet: inactive accounts (3 years, after a warning email) — the first ones could
 * only be due three years after launch, and the warning needs its own record (see the report).
 */

const DAY_MS = 24 * 3600 * 1000;

// The times themselves live in the pure src/lib/retention-times.ts, so the privacy policy and the
// account-deletion text (public pages) quote the same numbers without loading this module.
import {
  AUDIT_LOG_RETENTION_DAYS,
  CONTACT_CLICK_USER_RETENTION_DAYS,
  DEVICE_LINK_RETENTION_DAYS,
  EMAIL_OUTBOX_RETENTION_DAYS,
  GUEST_CONTACT_RETENTION_MONTHS,
} from "@/lib/retention-times";
export { AUDIT_LOG_RETENTION_DAYS, CONTACT_CLICK_USER_RETENTION_DAYS, DEVICE_LINK_RETENTION_DAYS, EMAIL_OUTBOX_RETENTION_DAYS, GUEST_CONTACT_RETENTION_MONTHS };

/** What a blanked booking keeps instead of the guest's name (the same mark as account deletion). */
export const ERASED_GUEST_NAME = "—";

/**
 * The day `months` calendar months before `day` ("YYYY-MM-DD"), clamped to the month's last day
 * (2026-05-31 minus 3 months → 2026-02-28). Pure.
 */
export function monthsBefore(day: string, months: number): string {
  if (!isDay(day)) throw new Error(`monthsBefore: not a day: ${day}`);
  const [y, m, d] = day.split("-").map(Number);
  const firstOfTarget = new Date(Date.UTC(y, m - 1 - months, 1));
  const lastDay = new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth(), Math.min(d, lastDay))).toISOString().slice(0, 10);
}

/**
 * The latest check-out day ("YYYY-MM-DD", Georgia) whose guest contact details are due: a stay that
 * ended on this day or before it ended at least 3 months ago.
 */
export function guestContactCutoffDay(now: Date = new Date()): string {
  return monthsBefore(tbilisiToday(now), GUEST_CONTACT_RETENTION_MONTHS);
}

/** A booking the guest or the host cancelled: it was finished on the day of the cancellation. */
const CANCELLED_STATUSES = ["CANCELLED_BY_GUEST", "CANCELLED_BY_HOST"] as const;

/**
 * Founder's decision 9: on every booking whose check-out is at least 3 months ago (any status:
 * completed, no-show, cancelled), the guest's contact details are blanked — the name ("—", as
 * account deletion does), the phone (its encrypted copy and its lookup value: null; SECURITY_REPORT
 * 12.3.c), the message to the host and the free-text cancellation reason. A cancelled booking was finished when it was cancelled, so it is blanked 3 months after
 * the cancellation even when its planned check-out is still ahead (a stay booked 11 months ahead
 * and cancelled the next day does not keep the guest's phone for 14 months; retention-cancelled-1).
 * Guest flags count cancellations by account, never by these fields, so they are not weakened.
 * What stays is anonymous: dates, nights, guests, price lines, listing, status, reason code, and
 * the link to the guest's own account (their own data, deleted with the account).
 * Idempotent: only rows that still hold something are touched.
 */
export async function eraseOldGuestContacts(now: Date = new Date(), scope: Prisma.BookingWhereInput = {}): Promise<number> {
  const cutoff = dayToDate(guestContactCutoffDay(now));
  const { count } = await db.booking.updateMany({
    where: {
      AND: [
        scope,
        { OR: [{ checkOut: { lte: cutoff } }, { status: { in: [...CANCELLED_STATUSES] }, cancelledAt: { lt: cutoff } }] },
        {
          OR: [
            { guestName: { not: ERASED_GUEST_NAME } },
            { guestPhoneEnc: { not: null } },
            { guestPhoneLookup: { not: null } },
            { messageToHost: { not: null } },
            { cancelReason: { not: null } },
          ],
        },
      ],
    },
    data: { guestName: ERASED_GUEST_NAME, guestPhoneEnc: null, guestPhoneLookup: null, messageToHost: null, cancelReason: null },
  });
  return count;
}

/**
 * Staff audit entries older than a year. The "we visited" snapshots (listing.visited_set) stay:
 * they hold a listing's state at the visit, no personal data, and the badge page compares with the
 * latest one however old it is. A "long stay reviewed" mark (flag.long_stay_reviewed) stays while
 * its stay has not ended: bookings can be made up to two years ahead, and without the mark staff
 * would see a reviewed stay as open again (longstay-marker-retention-1). Once the stay has ended,
 * the mark goes at a year like the rest (founder's answer (d)).
 */
export async function purgeOldAuditLogs(now: Date = new Date(), scope: Prisma.AuditLogWhereInput = {}): Promise<number> {
  const cutoff = new Date(now.getTime() - AUDIT_LOG_RETENTION_DAYS * DAY_MS);
  const due: Prisma.AuditLogWhereInput = { ...scope, createdAt: { lt: cutoff } };
  const marks = await db.auditLog.findMany({ where: { ...due, action: LONG_STAY_REVIEWED_ACTION, targetType: "Booking" }, select: { targetId: true } });
  const bookingIds = [...new Set(marks.map((m) => m.targetId).filter((id): id is string => Boolean(id)))];
  const notEnded = bookingIds.length
    ? (await db.booking.findMany({ where: { id: { in: bookingIds }, checkOut: { gte: dayToDate(tbilisiToday(now)) } }, select: { id: true } })).map((b) => b.id)
    : [];
  const { count } = await db.auditLog.deleteMany({
    where: {
      AND: [
        due,
        { action: { not: VISIT_SET_ACTION } },
        ...(notEnded.length ? [{ NOT: { action: LONG_STAY_REVIEWED_ACTION, targetType: "Booking", targetId: { in: notEnded } } }] : []),
      ],
    },
  });
  return count;
}

/** Outbox rows (recipient, subject, the whole message) older than 90 days. */
export async function purgeOldEmailOutbox(now: Date = new Date(), scope: Prisma.EmailOutboxWhereInput = {}): Promise<number> {
  const cutoff = new Date(now.getTime() - EMAIL_OUTBOX_RETENTION_DAYS * DAY_MS);
  const { count } = await db.emailOutbox.deleteMany({ where: { ...scope, createdAt: { lt: cutoff } } });
  return count;
}

/** "Show contact" taps older than 90 days lose their account; the listing's counts stay. */
export async function anonymizeOldContactClicks(now: Date = new Date(), scope: Prisma.ContactClickWhereInput = {}): Promise<number> {
  const cutoff = new Date(now.getTime() - CONTACT_CLICK_USER_RETENTION_DAYS * DAY_MS);
  const { count } = await db.contactClick.updateMany({ where: { ...scope, createdAt: { lt: cutoff }, userId: { not: null } }, data: { userId: null } });
  return count;
}

/** Device ↔ account links not seen for a year. */
export async function purgeStaleDeviceLinks(now: Date = new Date(), scope: Prisma.DeviceLinkWhereInput = {}): Promise<number> {
  const cutoff = new Date(now.getTime() - DEVICE_LINK_RETENTION_DAYS * DAY_MS);
  const { count } = await db.deviceLink.deleteMany({ where: { ...scope, lastSeenAt: { lt: cutoff } } });
  return count;
}

/** Login sessions that expired more than 30 days ago (they keep the IP address and the browser). */
export async function purgeExpiredSessions(now: Date = new Date(), scope: Prisma.SessionWhereInput = {}): Promise<number> {
  const cutoff = new Date(now.getTime() - EXPIRED_SESSION_RETENTION_DAYS * DAY_MS);
  const { count } = await db.session.deleteMany({ where: { ...scope, expiresAt: { lt: cutoff } } });
  return count;
}

/** Phone-line checks older than 90 days (a later check looks the number up again). */
export async function purgeOldPhoneLookups(now: Date = new Date(), scope: Prisma.PhoneLookupWhereInput = {}): Promise<number> {
  const cutoff = new Date(now.getTime() - PHONE_LOOKUP_RETENTION_DAYS * DAY_MS);
  const { count } = await db.phoneLookup.deleteMany({ where: { ...scope, checkedAt: { lt: cutoff } } });
  return count;
}

/**
 * Browser notification subscriptions that are failing now and have not worked for 90 days (since
 * their last success, or since they were made when they never worked). A success clears failedAt,
 * and a "gone" answer already deletes the subscription at once (src/lib/alerts/push.ts).
 */
export async function purgeDeadPushSubscriptions(now: Date = new Date(), scope: Prisma.PushSubscriptionWhereInput = {}): Promise<number> {
  const cutoff = new Date(now.getTime() - DEAD_PUSH_RETENTION_DAYS * DAY_MS);
  const { count } = await db.pushSubscription.deleteMany({
    where: {
      ...scope,
      failedAt: { not: null },
      OR: [{ lastOkAt: null, createdAt: { lt: cutoff } }, { lastOkAt: { lt: cutoff } }],
    },
  });
  return count;
}

/**
 * The texts of closed cases, CASE_TEXT_RETENTION_DAYS (180, interim) after the case closed:
 *   - support tickets CLOSED (closedAt) or RESOLVED with no change since: the subject and the
 *     guest's name and email become "—" / empty, every message body "—", the rating comment goes;
 *     the ticket's number, category, status and dates stay for the counts;
 *   - reports RESOLVED or DISMISSED (handledAt): the reporter's details and the staff notes go;
 *     the reason, the kind, the decision and the action taken stay.
 * The report screenshots use the same clock (src/lib/reports/retention.ts). Idempotent.
 */
export async function eraseClosedCaseTexts(
  now: Date = new Date(),
  scope: { ticket?: Prisma.TicketWhereInput; report?: Prisma.ReportWhereInput } = {},
): Promise<{ tickets: number; messages: number; reports: number }> {
  const cutoff = new Date(now.getTime() - CASE_TEXT_RETENTION_DAYS * DAY_MS);
  const closedTickets: Prisma.TicketWhereInput = {
    ...scope.ticket,
    OR: [
      { status: "CLOSED", closedAt: { lt: cutoff } },
      { status: "RESOLVED", updatedAt: { lt: cutoff }, lastMessageAt: { lt: cutoff } },
    ],
  };
  const due = await db.ticket.findMany({
    where: { AND: [closedTickets, { OR: [{ subject: { not: ERASED_TEXT } }, { guestEmail: { not: null } }, { guestName: { not: null } }, { ratingComment: { not: null } }] }] },
    select: { id: true },
    take: 500,
  });
  const ids = due.map((ticket) => ticket.id);
  let messages = 0;
  if (ids.length) {
    const [erased] = await db.$transaction([
      db.ticketMessage.updateMany({ where: { ticketId: { in: ids }, body: { not: ERASED_TEXT } }, data: { body: ERASED_TEXT } }),
      db.ticket.updateMany({ where: { id: { in: ids } }, data: { subject: ERASED_TEXT, guestName: null, guestEmail: null, ratingComment: null } }),
    ]);
    messages = erased.count;
  }
  const reports = await db.report.updateMany({
    where: {
      ...scope.report,
      status: { in: ["RESOLVED", "DISMISSED"] },
      handledAt: { lt: cutoff },
      OR: [{ details: { not: null } }, { adminNote: { not: null } }, { resolution: { not: null } }],
    },
    data: { details: null, adminNote: null, resolution: null },
  });
  return { tickets: ids.length, messages, reports: reports.count };
}
