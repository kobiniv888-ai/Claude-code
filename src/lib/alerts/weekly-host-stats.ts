import "server-only";
import { siteConfig } from "@/config/site";
import { db } from "@/lib/db";
import { notificationEmailFor, sendEmail } from "@/lib/email";
import { parseNotificationPrefs } from "@/lib/account/settings-schema";
import { isAccountBlocked } from "@/lib/auth/account-status";
import { isShabbatOrHolidayNow } from "@/lib/hebcal";
import { getStatsTotals } from "@/lib/listing/stats";
import { addTotals, emptyTotals, isBookableDeal, isQuietPeriod } from "@/lib/listing/stats-math";
import { siteUrl } from "@/lib/site-url";
import { parseAlertPrefs } from "./rules";
import { unsubscribePath, unsubscribeToken } from "./unsubscribe-token";
import { MAX_LISTINGS, type WeeklyEmailData } from "./weekly-host-email-template";
import { weeklyDue } from "./weekly-host-schedule";

/**
 * The weekly host stats email (round 3, brief 6.2; founder's answer 10): Sunday 09:00 Israel
 * time, "השבוע: 120 צפיות, 8 שמירות, הזמנה אחת" with a line per listing, a link to the stats
 * and a one-tap unsubscribe link. Called by GET /api/cron/weekly-host-stats (CRON_SECRET), which
 * may run several times a morning: outside the due day's 09:00–11:59 it does nothing
 * (./weekly-host-schedule.ts; a Yom Tov Sunday moves it to the next day).
 *
 * Who gets it: hosts with at least one LIVE, non-demo listing, an account in good standing, not a
 * demo account, an email address we may write to, and the weekly email switched on
 * (User.notificationPrefs.email.weeklyStats, on unless turned off). A week with all zeros is
 * skipped (conservative: no "nothing happened" email). Each host is CLAIMED first with a RateLimit
 * row "weekly-host-stats:<Sunday>:<user id>" (INSERT … ON CONFLICT DO NOTHING), so at most one
 * email per host per week goes out, whichever server runs it: "pending" (0) while sending,
 * "sent" (1) or "quiet" (2) after. A failed send releases the claim, so the next hourly run
 * tries again; a pending claim older than STALE_CLAIM_MINUTES is taken over, unless the outbox
 * shows the week's email went out after it was claimed. An address paused after a bounce or a
 * spam complaint gets no digest. Every digest carries List-Unsubscribe (one-click, RFC 8058:
 * POST /api/unsubscribe). Emails go through @/lib/email (the outbox until Resend is set up).
 */

export const CLAIM_PREFIX = "weekly-host-stats:";
const CLAIM_DAYS = 8;
export const STALE_CLAIM_MINUTES = 5;
const PENDING = 0;
const SENT = 1;
const QUIET = 2;
const BATCH = 100;
/** The cron route has 300 s; stop starting new hosts after this, the next hourly run goes on. */
const TIME_BUDGET_MS = 240_000;

export type WeeklyRunResult =
  | { status: "not_due_day" | "too_early" | "too_late" | "rest_day"; day: string; week: string }
  | {
      status: "ran";
      day: string;
      week: string;
      hosts: number;
      sent: number;
      quiet: number;
      off: number;
      noEmail: number;
      /** The address is paused after a bounce or a spam complaint (src/lib/booking/alerts.ts). */
      paused: number;
      already: number;
      failed: number;
      /** Hosts left for the next run (time budget). */
      unfinished: boolean;
    };

/** Shabbat or Yom Tov in Israel at this moment (candle lighting to Havdalah). */
export function isIsraelRestTime(at: Date): boolean {
  return isShabbatOrHolidayNow(siteConfig.shabbat.israel, at).active;
}

function claimKey(week: string, userId: string): string {
  return `${CLAIM_PREFIX}${week}:${userId}`;
}

const CLAIM_MS = CLAIM_DAYS * 24 * 3600 * 1000;

async function claimHost(week: string, userId: string, now: Date, to: string): Promise<boolean> {
  const key = claimKey(week, userId);
  const resetAt = new Date(now.getTime() + CLAIM_MS);
  const { count } = await db.rateLimit.createMany({ data: [{ key, count: PENDING, resetAt }], skipDuplicates: true });
  if (count === 1) return true;
  const staleBefore = new Date(resetAt.getTime() - STALE_CLAIM_MINUTES * 60_000);
  const claim = await db.rateLimit.findUnique({ where: { key }, select: { count: true, resetAt: true } });
  if (!claim || claim.count !== PENDING || claim.resetAt >= staleBefore) return false;
  // A stale pending claim: the run that took it may have sent the email and then failed to settle
  // the claim (or died). The outbox says whether this week's email went out since it was claimed.
  const claimedAt = new Date(claim.resetAt.getTime() - CLAIM_MS);
  const sent = await db.emailOutbox.findFirst({
    where: { template: "weekly_host_stats", to: { equals: to.trim(), mode: "insensitive" }, status: { in: ["SENT", "LOGGED", "QUEUED"] }, createdAt: { gte: claimedAt } },
    select: { id: true },
  });
  if (sent) {
    await settleClaim(week, userId, SENT);
    return false;
  }
  const taken = await db.rateLimit.updateMany({ where: { key, count: PENDING, resetAt: claim.resetAt }, data: { resetAt } });
  return taken.count === 1;
}

/** Marks the claim done; tries three times (a claim left pending is checked against the outbox). */
async function settleClaim(week: string, userId: string, state: typeof SENT | typeof QUIET): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await db.rateLimit.updateMany({ where: { key: claimKey(week, userId) }, data: { count: state } });
      return;
    } catch (error) {
      if (attempt === 3) console.error(`[weekly-stats] could not settle the claim of ${userId}:`, error);
    }
  }
}

async function releaseClaim(week: string, userId: string): Promise<void> {
  await db.rateLimit.deleteMany({ where: { key: claimKey(week, userId) } }).catch(() => undefined);
}

const hostSelect = {
  id: true,
  name: true,
  firstName: true,
  email: true,
  contactEmail: true,
  locale: true,
  status: true,
  suspendedUntil: true,
  notificationPrefs: true,
} as const;

type Host = { id: string; name: string; firstName: string | null; email: string; contactEmail: string | null; locale: string; status: string; suspendedUntil: Date | null; notificationPrefs: unknown };

type HostOutcome = "sent" | "quiet" | "off" | "noEmail" | "paused" | "already" | "failed";

/**
 * RFC 8058 one-click unsubscribe: mail apps show "Unsubscribe" next to the sender instead of only
 * "Report spam", and their POST lands on /api/unsubscribe (which switches only this email off).
 */
export function weeklyUnsubscribeHeaders(userId: string): Record<string, string> {
  const url = `${siteUrl()}/api/unsubscribe?t=${encodeURIComponent(unsubscribeToken(userId, "weekly_stats"))}`;
  return { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

/** The email data for one host's week, and the week's booked nights (exported for the tests). */
export async function weeklyEmailData(
  host: Pick<Host, "id" | "name" | "firstName">,
  period: { fromDay: string; toDay: string },
): Promise<{ data: WeeklyEmailData["weekly_host_stats"]; bookedNights: number }> {
  const listings = await db.listing.findMany({
    where: { ownerId: host.id, status: "LIVE", isDemo: false, deletedAt: null },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    select: { id: true, publicId: true, title: true, dealType: true },
  });
  const totals = await getStatsTotals(listings, 7, period.toDay);
  let sum = emptyTotals();
  const rows = listings.map((listing) => {
    const counts = totals.get(listing.id) ?? emptyTotals();
    sum = addTotals(sum, counts);
    return {
      title: listing.title,
      publicId: listing.publicId,
      bookable: isBookableDeal(listing.dealType),
      views: counts.views,
      saves: counts.saves,
      contacts: counts.contacts,
      bookings: counts.bookings,
      bookedNights: counts.bookedNights,
      // The page shows the same 7 days as the email (it ends on the period's last day).
      statsUrl: `/account/listings/${listing.id}/stats?days=7&to=${period.toDay}`,
    };
  });
  // The busiest listings first.
  rows.sort((a, b) => b.views + b.saves + b.contacts + b.bookings - (a.views + a.saves + a.contacts + a.bookings));
  const shown = rows.slice(0, MAX_LISTINGS).map((row) => ({
    title: row.title,
    publicId: row.publicId,
    bookable: row.bookable,
    views: row.views,
    saves: row.saves,
    contacts: row.contacts,
    bookings: row.bookings,
    statsUrl: row.statsUrl,
  }));
  const data: WeeklyEmailData["weekly_host_stats"] = {
    name: host.firstName?.trim() || null,
    fromDay: period.fromDay,
    toDay: period.toDay,
    totals: { views: sum.views, saves: sum.saves, contacts: sum.contacts, bookings: sum.bookings },
    bookable: rows.some((row) => row.bookable),
    listings: shown,
    moreListings: Math.max(0, rows.length - shown.length),
    listingsUrl: "/account/listings",
    unsubscribeUrl: unsubscribePath(host.id, "weekly_stats"),
  };
  return { data, bookedNights: sum.bookedNights };
}

async function sendToHost(host: Host, decision: { week: string; fromDay: string; toDay: string }, now: Date): Promise<HostOutcome> {
  if (parseNotificationPrefs(host.notificationPrefs).email.weeklyStats === false) return "off";
  const to = notificationEmailFor(host);
  if (!to) return "noEmail";
  // An address that bounced or complained is paused for booking alerts: no digest to it either
  // (every new bounce would hurt the sender's reputation and alert the founder again).
  const failing = parseAlertPrefs(host.notificationPrefs).email.failing;
  if (failing && failing.address === to.trim().toLowerCase()) return "paused";
  if (!(await claimHost(decision.week, host.id, now, to))) return "already";
  try {
    const { data, bookedNights } = await weeklyEmailData(host, decision);
    if (isQuietPeriod({ ...data.totals, bookedNights })) {
      await settleClaim(decision.week, host.id, QUIET);
      return "quiet";
    }
    const result = await sendEmail({ to, template: "weekly_host_stats", locale: host.locale, data, headers: weeklyUnsubscribeHeaders(host.id) });
    if (!result.ok) {
      await releaseClaim(decision.week, host.id);
      return "failed";
    }
    await settleClaim(decision.week, host.id, SENT);
    return "sent";
  } catch (error) {
    console.error(`[weekly-stats] host ${host.id} failed:`, error);
    await releaseClaim(decision.week, host.id);
    return "failed";
  }
}

/**
 * One run of the weekly email. `onlyHostId` limits it to one host (the end-to-end test, through
 * the cron route in development / test mode only).
 */
export async function runWeeklyHostStats(
  now: Date = new Date(),
  opts: { isRestTime?: (at: Date) => boolean; onlyHostId?: string | null; timeBudgetMs?: number } = {},
): Promise<WeeklyRunResult> {
  const decision = weeklyDue(now, opts.isRestTime ?? isIsraelRestTime);
  if (!decision.send) return { status: decision.reason, day: decision.day, week: decision.week };

  const started = Date.now();
  const budget = opts.timeBudgetMs ?? TIME_BUDGET_MS;
  const counts: Record<HostOutcome, number> = { sent: 0, quiet: 0, off: 0, noEmail: 0, paused: 0, already: 0, failed: 0 };
  let hosts = 0;
  let unfinished = false;
  let cursor: string | undefined;
  for (;;) {
    const batch: Host[] = await db.user.findMany({
      where: {
        ...(opts.onlyHostId ? { id: opts.onlyHostId } : {}),
        isDemo: false,
        status: { in: ["ACTIVE", "WARNED"] },
        listings: { some: { status: "LIVE", isDemo: false, deletedAt: null } },
      },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: hostSelect,
    });
    for (const host of batch) {
      if (Date.now() - started > budget) {
        unfinished = true;
        break;
      }
      if (isAccountBlocked(host, now)) continue;
      hosts += 1;
      counts[await sendToHost(host, decision, now)] += 1;
    }
    if (unfinished || batch.length < BATCH) break;
    cursor = batch[batch.length - 1].id;
  }
  return { status: "ran", day: decision.day, week: decision.week, hosts, ...counts, unfinished };
}
