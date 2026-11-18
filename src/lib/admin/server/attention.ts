import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { ATTENTION_EVENT_DAYS, type AttentionKey, type AttentionSnapshot } from "../attention";
import { outboxListWhere } from "../outbox";
import { getOpenFlagCounts } from "./flags";
import { getOpenGuestFlagCounts } from "./guest-flags";
import { reportTabWhere } from "./reports";

/**
 * The counts behind the admin home "דורש טיפול" block and the daily summary: one cheap query
 * each, all in parallel. A failing count reads 0 and is listed in `failed`, so the block never
 * shows "all clear" and the daily summary is retried instead of reporting nothing waiting. Each
 * count uses the same filter as the list its row links to.
 */

const DAY_MS = 24 * 3600 * 1000;

/** Booking attempts refused because no alert channel of the host accepted the alert (phase 1). */
export const HOST_UNREACHABLE_ACTION = "booking.host_unreachable";

export async function loadAttentionCounts(now: Date = new Date()): Promise<AttentionSnapshot> {
  const since = new Date(now.getTime() - ATTENTION_EVENT_DAYS * DAY_MS);
  const failed: AttentionKey[] = [];
  const zero = <T,>(keys: AttentionKey[], promise: Promise<T>, fallback: T): Promise<T> =>
    promise.catch((error) => {
      console.error(`[admin] attention count failed (${keys.join(", ")}):`, error);
      failed.push(...keys);
      return fallback;
    });
  const [inReview, turnedAwayReports, otherReports, flags, guestFlags, hostUnreachable, failedEmails, outboxWaiting] = await Promise.all([
    zero(["inReview"], db.listing.count({ where: { status: "IN_REVIEW" } }), 0),
    zero(["turnedAwayReports"], db.report.count({ where: { status: "OPEN", ...reportTabWhere("turnedAway") } }), 0),
    // The "listings and profiles" tab the row links to.
    zero(["otherReports"], db.report.count({ where: { status: "OPEN", ...reportTabWhere("listings") } }), 0),
    zero(["flagCancellations", "flagHosts", "flagNoShows"], getOpenFlagCounts(now), { cancellations: 0, noShows: 0, hosts: 0 }),
    // The open guest flags and long stays (decision 7): the same counts as Admin → Flags' tabs.
    zero(["flagGuests", "flagLongStays"], getOpenGuestFlagCounts(now), { longStays: 0, guests: 0 }),
    zero(["hostUnreachable"], db.auditLog.count({ where: { action: HOST_UNREACHABLE_ACTION, createdAt: { gte: since } } }), 0),
    zero(["failedEmails"], db.emailOutbox.count({ where: outboxListWhere({ status: "FAILED", recentDays: ATTENTION_EVENT_DAYS }, now) }), 0),
    // Kept in the outbox only, not sent (no Resend yet). Demo accounts' "outbox" rows never go out.
    zero(["outboxWaiting"], db.emailOutbox.count({ where: outboxListWhere({ waiting: true, recentDays: ATTENTION_EVENT_DAYS }, now) }), 0),
  ]);
  return {
    failed,
    turnedAwayReports,
    inReview,
    otherReports,
    flagCancellations: flags.cancellations,
    flagHosts: flags.hosts,
    flagNoShows: flags.noShows,
    flagGuests: guestFlags.guests,
    flagLongStays: guestFlags.longStays,
    hostUnreachable,
    failedEmails,
    outboxWaiting,
  };
}

/** Once per request (the overview page). */
export const getAttentionCounts = cache(() => loadAttentionCounts());
