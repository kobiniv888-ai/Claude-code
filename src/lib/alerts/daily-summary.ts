import "server-only";
import { siteConfig } from "@/config/site";
import type { AdminEmailData } from "@/lib/admin/email-templates";
import { HOST_UNREACHABLE_ACTION, loadAttentionCounts } from "@/lib/admin/server/attention";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { isShabbatOrHolidayNow } from "@/lib/hebcal";
import { sendFounderEmail } from "./founder-admin";
import { summaryDue, summaryPeriod } from "./summary-schedule";

/**
 * The founder's daily summary (round 3, brief 9 and founder's answer 10): at 08:00 Israel time,
 * not on Shabbat or Yom Tov (Israel's calendar, Jerusalem's times: siteConfig.shabbat.israel).
 * What waits right now (the admin home's "דורש טיפול" counts) and what happened since the last
 * summary: bookings, cancellations, no-shows, reports and booking attempts the host never heard of.
 *
 * Called by GET /api/cron/daily-summary (CRON_SECRET), which may run several times a morning:
 * the day is CLAIMED first with a RateLimit row ("founder-summary:<day>", INSERT … ON CONFLICT
 * DO NOTHING), so at most one summary per Israel day goes out, whichever server runs it. When
 * the email could not be sent at all, the claim is released so the next run tries again.
 */

export type DailySummaryResult =
  | { status: "sent"; day: string; fromDay: string; toDay: string }
  | { status: "too_early" | "rest_day" | "already_sent" | "failed"; day: string };

const CLAIM_PREFIX = "founder-summary:";
const CLAIM_DAYS = 8;

/** Shabbat or Yom Tov in Israel at this moment (candle lighting to Havdalah). */
export function isIsraelRestTime(at: Date): boolean {
  return isShabbatOrHolidayNow(siteConfig.shabbat.israel, at).active;
}

async function claimDay(day: string, now: Date): Promise<boolean> {
  const { count } = await db.rateLimit.createMany({
    data: [{ key: `${CLAIM_PREFIX}${day}`, count: 1, resetAt: new Date(now.getTime() + CLAIM_DAYS * 24 * 3600 * 1000) }],
    skipDuplicates: true,
  });
  return count === 1;
}

async function releaseDay(day: string): Promise<void> {
  await db.rateLimit.deleteMany({ where: { key: `${CLAIM_PREFIX}${day}` } }).catch(() => undefined);
}

/** What happened in [from, to): one count query each. */
export async function periodCounts(from: Date, to: Date): Promise<AdminEmailData["admin_daily_summary"]["period"]> {
  const between = { gte: from, lt: to };
  const [bookings, cancelledByGuest, cancelledByHost, flaggedCancellations, noShows, reports, turnedAwayReports, hostUnreachable] = await Promise.all([
    db.booking.count({ where: { createdAt: between } }),
    db.booking.count({ where: { status: "CANCELLED_BY_GUEST", cancelledAt: between } }),
    db.booking.count({ where: { status: "CANCELLED_BY_HOST", cancelledAt: between } }),
    db.booking.count({ where: { flaggedForReview: true, cancelledAt: between } }),
    db.booking.count({ where: { status: "NO_SHOW", noShowReportedAt: between } }),
    db.report.count({ where: { createdAt: between } }),
    db.report.count({ where: { kind: "TURNED_AWAY", createdAt: between } }),
    db.auditLog.count({ where: { action: HOST_UNREACHABLE_ACTION, createdAt: between } }),
  ]);
  return { bookings, cancelledByGuest, cancelledByHost, flaggedCancellations, noShows, reports, turnedAwayReports, hostUnreachable };
}

export async function runDailySummary(now: Date = new Date(), isRestTime: (at: Date) => boolean = isIsraelRestTime): Promise<DailySummaryResult> {
  const due = summaryDue(now, isRestTime);
  if (!due.send) return { status: due.reason, day: due.day };
  if (!(await claimDay(due.day, now))) return { status: "already_sent", day: due.day };

  try {
    const period = summaryPeriod(due.day, isRestTime);
    const [waiting, happened] = await Promise.all([loadAttentionCounts(now), periodCounts(period.from, period.to)]);
    const data: AdminEmailData["admin_daily_summary"] = {
      fromDay: period.fromDay,
      toDay: period.toDay,
      waiting: {
        turnedAwayReports: waiting.turnedAwayReports,
        inReview: waiting.inReview,
        otherReports: waiting.otherReports,
        flagCancellations: waiting.flagCancellations,
        flagHosts: waiting.flagHosts,
        flagNoShows: waiting.flagNoShows,
        failedEmails: waiting.failedEmails,
      },
      period: happened,
      adminUrl: "/admin",
    };
    const sent = await sendFounderEmail("admin_daily_summary", data);
    if (!sent) {
      await releaseDay(due.day);
      return { status: "failed", day: due.day };
    }
    await audit({
      actorId: null,
      action: "summary.daily_sent",
      targetType: null,
      targetId: null,
      details: { day: due.day, fromDay: period.fromDay, toDay: period.toDay },
    });
    return { status: "sent", day: due.day, fromDay: period.fromDay, toDay: period.toDay };
  } catch (error) {
    await releaseDay(due.day);
    throw error;
  }
}
