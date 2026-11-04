import "server-only";
import { db } from "@/lib/db";

/**
 * Report queries other features use (server-only):
 * - countOpenReports: the queue's tab numbers (and anything else that needs them);
 * - guestBookingReports: which of a guest's bookings they already reported (My trips, trip page).
 *
 * The automatic host flag ("2 or more reports in 12 months, dismissed ones left out", brief 8.2)
 * lives with the admin Flags section: src/lib/admin/flags.ts (rule) and
 * src/lib/admin/server/flags.ts (hostFlagSummary, listFlags). Turned-away reports count there like
 * every other report about the host or their listings; tests/unit/reports-round3.test.ts checks it.
 */

/** Open reports: all, the urgent ones (turned away), and per tab of the queue. */
export async function countOpenReports(): Promise<{ total: number; urgent: number; turnedAway: number; general: number; reviews: number }> {
  const groups = await db.report.groupBy({
    by: ["kind", "targetType", "priority"],
    where: { status: "OPEN" },
    _count: { _all: true },
  });
  const out = { total: 0, urgent: 0, turnedAway: 0, general: 0, reviews: 0 };
  for (const g of groups) {
    const n = g._count._all;
    out.total += n;
    if (g.priority === "URGENT") out.urgent += n;
    if (g.kind === "TURNED_AWAY") out.turnedAway += n;
    else if (g.targetType === "REVIEW") out.reviews += n;
    else out.general += n;
  }
  return out;
}

/** The guest's turned-away reports about these bookings: bookingId → when it was sent. */
export async function guestBookingReports(guestId: string, bookingIds: readonly string[]): Promise<Map<string, Date>> {
  if (bookingIds.length === 0) return new Map();
  const rows = await db.report.findMany({
    where: { reporterId: guestId, kind: "TURNED_AWAY", bookingId: { in: [...bookingIds] } },
    select: { bookingId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return new Map(rows.flatMap((r) => (r.bookingId ? [[r.bookingId, r.createdAt] as const] : [])));
}
