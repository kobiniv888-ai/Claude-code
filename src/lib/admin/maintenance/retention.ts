import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { VISIT_SET_ACTION } from "@/lib/admin/badges/server";
import { LONG_STAY_REVIEWED_ACTION } from "@/lib/admin/server/guest-flags";
import { dayToDate, isDay, tbilisiToday } from "@/lib/booking/dates";
import { db } from "@/lib/db";

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
 * | Login and verification codes                  | until they expire              | cleanup route               |
 * | Report screenshots                            | 180 days after the decision    | src/lib/reports/retention   |
 * | ID documents                                  | 7 days after the decision      | cleanup route               |
 *
 * Not automatic yet: inactive accounts (3 years, after a warning email) — the first ones could
 * only be due three years after launch, and the warning needs its own record (see the report).
 */

const DAY_MS = 24 * 3600 * 1000;

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
