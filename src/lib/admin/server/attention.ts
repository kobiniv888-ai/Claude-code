import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { ATTENTION_EVENT_DAYS, type AttentionCounts } from "../attention";
import { getOpenFlagCounts } from "./flags";

/**
 * The counts behind the admin home "דורש טיפול" block and the daily summary: one cheap query
 * each, all in parallel. A failing count reads 0 (the block still shows the rest).
 */

const DAY_MS = 24 * 3600 * 1000;

/** Booking attempts refused because no alert channel of the host accepted the alert (phase 1). */
export const HOST_UNREACHABLE_ACTION = "booking.host_unreachable";

function zero<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return promise.catch((error) => {
    console.error("[admin] attention count failed:", error);
    return fallback;
  });
}

export async function loadAttentionCounts(now: Date = new Date()): Promise<AttentionCounts> {
  const since = new Date(now.getTime() - ATTENTION_EVENT_DAYS * DAY_MS);
  const [inReview, turnedAwayReports, otherReports, flags, hostUnreachable, failedEmails, outboxWaiting] = await Promise.all([
    zero(db.listing.count({ where: { status: "IN_REVIEW" } }), 0),
    zero(db.report.count({ where: { status: "OPEN", kind: "TURNED_AWAY" } }), 0),
    zero(db.report.count({ where: { status: "OPEN", kind: { not: "TURNED_AWAY" } } }), 0),
    zero(getOpenFlagCounts(now), { cancellations: 0, noShows: 0, hosts: 0 }),
    zero(db.auditLog.count({ where: { action: HOST_UNREACHABLE_ACTION, createdAt: { gte: since } } }), 0),
    zero(db.emailOutbox.count({ where: { status: "FAILED", createdAt: { gte: since } } }), 0),
    // Kept in the outbox only, not sent (no Resend yet). Demo accounts' "outbox" rows never go out.
    zero(db.emailOutbox.count({ where: { status: "LOGGED", provider: { not: "outbox" }, template: { not: "login_code" }, createdAt: { gte: since } } }), 0),
  ]);
  return {
    turnedAwayReports,
    inReview,
    otherReports,
    flagCancellations: flags.cancellations,
    flagHosts: flags.hosts,
    flagNoShows: flags.noShows,
    hostUnreachable,
    failedEmails,
    outboxWaiting,
  };
}

/** Once per request (the overview page). */
export const getAttentionCounts = cache(() => loadAttentionCounts());
