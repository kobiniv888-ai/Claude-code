import "server-only";
import { siteConfig } from "@/config/site";
import type { AdminEmailData } from "./founder-email-templates";
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
 * Called by GET /api/cron/daily-summary (CRON_SECRET), which may run several times a morning (or
 * every hour: outside 08:00–11:59 Israel time it does nothing):
 * the day is CLAIMED first with a RateLimit row ("founder-summary:<day>", INSERT … ON CONFLICT
 * DO NOTHING), so at most one summary per Israel day goes out, whichever server runs it. The
 * claim is "pending" (count 0) while the email is sent and "sent" (count 1) once it was
 * accepted. When the email could not be sent (or not within SEND_TIMEOUT_MS), the claim is
 * released so the next run tries again; a pending claim left by a run that was killed is taken
 * over after STALE_CLAIM_MINUTES. The next summary starts from the last day a summary really
 * went out (a "sent" claim, or the "summary.daily_sent" audit entry once claims are pruned).
 */

export type DailySummaryResult =
  | { status: "sent"; day: string; fromDay: string; toDay: string }
  | { status: "too_early" | "too_late" | "rest_day" | "already_sent" | "failed"; day: string };

const CLAIM_PREFIX = "founder-summary:";
const CLAIM_DAYS = 8;
/** A pending claim older than this belongs to a run that never finished: another run may take it. */
export const STALE_CLAIM_MINUTES = 5;
/** The summary email must be accepted within this (the cron route has 60 s), so the release runs. */
export const SEND_TIMEOUT_MS = 30_000;
const PENDING = 0;
const SENT = 1;

/** Shabbat or Yom Tov in Israel at this moment (candle lighting to Havdalah). */
export function isIsraelRestTime(at: Date): boolean {
  return isShabbatOrHolidayNow(siteConfig.shabbat.israel, at).active;
}

async function claimDay(day: string, now: Date): Promise<boolean> {
  const key = `${CLAIM_PREFIX}${day}`;
  const resetAt = new Date(now.getTime() + CLAIM_DAYS * 24 * 3600 * 1000);
  const { count } = await db.rateLimit.createMany({ data: [{ key, count: PENDING, resetAt }], skipDuplicates: true });
  if (count === 1) return true;
  // Still pending long after it was made (resetAt is set from the claim's time): take it over.
  const staleBefore = new Date(resetAt.getTime() - STALE_CLAIM_MINUTES * 60_000);
  const taken = await db.rateLimit.updateMany({ where: { key, count: PENDING, resetAt: { lt: staleBefore } }, data: { resetAt } });
  return taken.count === 1;
}

async function markSent(day: string): Promise<void> {
  await db.rateLimit.updateMany({ where: { key: `${CLAIM_PREFIX}${day}` }, data: { count: SENT } }).catch((error) => {
    console.error(`[summary] could not mark ${day} as sent:`, error);
  });
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The day of the latest summary before `day` that really went out: a "sent" claim, else (claims
 * are pruned about 9 days after they are made) the latest "summary.daily_sent" audit entry.
 */
async function previousSummaryDay(day: string): Promise<string | null> {
  const row = await db.rateLimit
    .findFirst({
      where: { key: { startsWith: CLAIM_PREFIX, lt: `${CLAIM_PREFIX}${day}` }, count: { gte: SENT } },
      orderBy: { key: "desc" },
      select: { key: true },
    })
    .catch(() => null);
  const claimed = row?.key.slice(CLAIM_PREFIX.length) ?? null;
  if (claimed && DAY_PATTERN.test(claimed)) return claimed;
  const audits = await db.auditLog
    .findMany({ where: { action: "summary.daily_sent" }, orderBy: { createdAt: "desc" }, take: 5, select: { details: true } })
    .catch(() => []);
  for (const entry of audits) {
    const sent = (entry.details as { day?: unknown } | null)?.day;
    if (typeof sent === "string" && DAY_PATTERN.test(sent) && sent < day) return sent;
  }
  return null;
}

/** The send's result, or false when it didn't finish within `ms`. */
export async function withinTime(send: Promise<boolean>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => {
      console.error(`[summary] the email was not accepted within ${ms} ms`);
      resolve(false);
    }, ms);
  });
  try {
    return await Promise.race([send, timeout]);
  } finally {
    clearTimeout(timer);
  }
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
    const period = summaryPeriod(due.day, isRestTime, await previousSummaryDay(due.day));
    const [waiting, happened] = await Promise.all([loadAttentionCounts(now), periodCounts(period.from, period.to)]);
    // A count that failed would read "nothing waiting": no summary now, the next run tries again.
    if (waiting.failed?.length) {
      console.error(`[summary] counts failed (${waiting.failed.join(", ")}), trying again on the next run`);
      await releaseDay(due.day);
      return { status: "failed", day: due.day };
    }
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
    const sent = await withinTime(sendFounderEmail("admin_daily_summary", data), SEND_TIMEOUT_MS);
    if (!sent) {
      await releaseDay(due.day);
      return { status: "failed", day: due.day };
    }
    await markSent(due.day);
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
