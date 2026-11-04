import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { HOST_REPORT_FLAG_MIN, hostReportFlagOpen, hostReportWindowStart, isFlaggedHost } from "./host-flags";

/**
 * Host flag queries (server-only; the rules are in ./host-flags.ts). Used by the review rule
 * (./lifecycle.ts: a flagged host's new listings wait), the admin home and daily summary counts,
 * and the Admin → Flags lists (src/lib/admin/server/flags.ts). Every count is one query.
 */

export const FLAG_STATES = ["open", "reviewed"] as const;
export type FlagState = (typeof FLAG_STATES)[number];

export const OPEN_CANCELLATION: Prisma.BookingWhereInput = { flaggedForReview: true, flagReviewedAt: null };
export const OPEN_NO_SHOW: Prisma.BookingWhereInput = { status: "NO_SHOW", flaggedForReview: false, flagReviewedAt: null };

export type HostFlagRow = { hostId: string; reports: number; turnedAway: number; open: number; latest: Date; reviewedAt: Date | null };

/**
 * Hosts with HOST_REPORT_FLAG_MIN or more counting reports (not dismissed, not about a review,
 * in the window), with the latest one and the host's last review. A "host" owns at least one
 * listing that is not a draft. `state` "open": a report arrived after the last review.
 */
export async function hostFlagRows(now: Date, opts: { state: FlagState | "any"; userId?: string; limit?: number; offset?: number }): Promise<HostFlagRow[]> {
  const since = hostReportWindowStart(now);
  const rows = await db.$queryRaw<HostFlagRow[]>`
    WITH counted AS (
      SELECT COALESCE(r."targetUserId", l."ownerId") AS "hostId", r."createdAt", r."kind", r."status"
      FROM "Report" r
      LEFT JOIN "Listing" l ON l."id" = r."listingId"
      WHERE r."status" <> 'DISMISSED' AND r."targetType" <> 'REVIEW'
        AND r."createdAt" >= ${since} AND r."createdAt" <= ${now}
    ), per_host AS (
      SELECT c."hostId", COUNT(*)::int AS "reports",
             COUNT(*) FILTER (WHERE c."kind" = 'TURNED_AWAY')::int AS "turnedAway",
             COUNT(*) FILTER (WHERE c."status" = 'OPEN')::int AS "open",
             MAX(c."createdAt") AS "latest"
      FROM counted c
      WHERE c."hostId" IS NOT NULL
      GROUP BY c."hostId"
      HAVING COUNT(*) >= ${HOST_REPORT_FLAG_MIN}
    )
    SELECT p."hostId", p."reports", p."turnedAway", p."open", p."latest", u."hostFlagReviewedAt" AS "reviewedAt"
    FROM per_host p
    JOIN "User" u ON u."id" = p."hostId"
    WHERE EXISTS (SELECT 1 FROM "Listing" x WHERE x."ownerId" = p."hostId" AND x."status" <> 'DRAFT')
      AND (${opts.userId ?? null}::text IS NULL OR p."hostId" = ${opts.userId ?? null}::text)
      AND (
        ${opts.state}::text = 'any'
        OR (${opts.state}::text = 'open' AND (u."hostFlagReviewedAt" IS NULL OR p."latest" > u."hostFlagReviewedAt"))
        OR (${opts.state}::text = 'reviewed' AND u."hostFlagReviewedAt" IS NOT NULL AND p."latest" <= u."hostFlagReviewedAt")
      )
    ORDER BY p."turnedAway" DESC, p."latest" DESC
    LIMIT ${opts.limit ?? 1000} OFFSET ${opts.offset ?? 0}`;
  return rows.map((r) => ({ ...r, reports: Number(r.reports), turnedAway: Number(r.turnedAway), open: Number(r.open) }));
}

export async function countHostFlags(now: Date, state: FlagState): Promise<number> {
  const since = hostReportWindowStart(now);
  const [row] = await db.$queryRaw<{ count: number }[]>`
    WITH counted AS (
      SELECT COALESCE(r."targetUserId", l."ownerId") AS "hostId", r."createdAt"
      FROM "Report" r
      LEFT JOIN "Listing" l ON l."id" = r."listingId"
      WHERE r."status" <> 'DISMISSED' AND r."targetType" <> 'REVIEW'
        AND r."createdAt" >= ${since} AND r."createdAt" <= ${now}
    ), per_host AS (
      SELECT c."hostId", MAX(c."createdAt") AS "latest"
      FROM counted c
      WHERE c."hostId" IS NOT NULL
      GROUP BY c."hostId"
      HAVING COUNT(*) >= ${HOST_REPORT_FLAG_MIN}
    )
    SELECT COUNT(*)::int AS "count"
    FROM per_host p
    JOIN "User" u ON u."id" = p."hostId"
    WHERE EXISTS (SELECT 1 FROM "Listing" x WHERE x."ownerId" = p."hostId" AND x."status" <> 'DRAFT')
      AND (
        (${state}::text = 'open' AND (u."hostFlagReviewedAt" IS NULL OR p."latest" > u."hostFlagReviewedAt"))
        OR (${state}::text = 'reviewed' AND u."hostFlagReviewedAt" IS NOT NULL AND p."latest" <= u."hostFlagReviewedAt")
      )`;
  return Number(row?.count ?? 0);
}

export type FlagCounts = { cancellations: number; noShows: number; hosts: number };

/** Open flags per list (the home page, the nav badge, the daily summary). */
export async function getOpenFlagCounts(now: Date = new Date()): Promise<FlagCounts> {
  const [cancellations, noShows, hosts] = await Promise.all([
    db.booking.count({ where: OPEN_CANCELLATION }),
    db.booking.count({ where: OPEN_NO_SHOW }),
    countHostFlags(now, "open"),
  ]);
  return { cancellations, noShows, hosts };
}

/**
 * Report decisions that keep the host under review until staff mark the host reviewed ("סימון
 * כנבדק"): "hide all their listings" and "remove the host" (Report.actionTaken).
 */
export const SANCTION_ACTIONS = ["listings_hidden", "host_removed"] as const;

/**
 * Was a report about this host closed with a sanction (SANCTION_ACTIONS) in the flag window and
 * after staff last marked the host reviewed? Then the host's paused, expired and new listings wait
 * for a person instead of going live. One query; it THROWS on a database error (callers fail closed).
 */
export async function isHostSanctioned(userId: string, now: Date = new Date()): Promise<boolean> {
  const since = hostReportWindowStart(now);
  const [row] = await db.$queryRaw<{ sanctioned: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM "Report" r
      LEFT JOIN "Listing" l ON l."id" = r."listingId"
      JOIN "User" u ON u."id" = ${userId}
      WHERE COALESCE(r."targetUserId", l."ownerId") = ${userId}
        AND r."actionTaken" IN (${Prisma.join([...SANCTION_ACTIONS])})
        AND r."handledAt" >= ${since} AND r."handledAt" <= ${now}
        AND (u."hostFlagReviewedAt" IS NULL OR r."handledAt" > u."hostFlagReviewedAt")
    ) AS "sanctioned"`;
  return row?.sanctioned === true;
}

/**
 * Is this host flagged right now (an open report flag, an open host-cancellation flag, or a
 * report sanction not yet reviewed)? Used by the review rule; it THROWS on a database error so
 * the caller can fail closed.
 */
export async function isHostFlagged(userId: string, now: Date = new Date()): Promise<boolean> {
  const [rows, openCancellationFlags, sanctioned] = await Promise.all([
    hostFlagRows(now, { state: "any", userId, limit: 1 }),
    db.booking.count({ where: { ...OPEN_CANCELLATION, hostUserId: userId } }),
    isHostSanctioned(userId, now),
  ]);
  const row = rows[0];
  const reportFlagOpen = row ? hostReportFlagOpen({ reportCount: row.reports, latestReportAt: row.latest, reviewedAt: row.reviewedAt }) : false;
  return sanctioned || isFlaggedHost({ reportFlagOpen, openCancellationFlags });
}

/** The flag state of one host for the user page and the review page. Never throws. */
export async function hostFlagSummary(userId: string, now: Date = new Date()) {
  try {
    const [rows, openCancellations, openNoShows, reviewedAt, sanctioned] = await Promise.all([
      hostFlagRows(now, { state: "any", userId, limit: 1 }),
      db.booking.count({ where: { ...OPEN_CANCELLATION, hostUserId: userId } }),
      db.booking.count({ where: { ...OPEN_NO_SHOW, hostUserId: userId } }),
      db.user.findUnique({ where: { id: userId }, select: { hostFlagReviewedAt: true } }),
      isHostSanctioned(userId, now),
    ]);
    const row = rows[0] ?? null;
    const reportFlagOpen = row ? hostReportFlagOpen({ reportCount: row.reports, latestReportAt: row.latest, reviewedAt: row.reviewedAt }) : false;
    return {
      flagged: sanctioned || isFlaggedHost({ reportFlagOpen, openCancellationFlags: openCancellations }),
      reportFlagOpen,
      /** A report closed with "hide all listings" / "remove the host", not yet marked reviewed. */
      sanctioned,
      /** The newest counting report (for "mark reviewed": anything newer opens the flag again). */
      latestReportAt: row?.latest ?? null,
      countingReports: row?.reports ?? 0,
      turnedAway: row?.turnedAway ?? 0,
      openCancellations,
      openNoShows,
      reviewedAt: reviewedAt?.hostFlagReviewedAt ?? null,
    };
  } catch (error) {
    console.error("[flags] host summary failed:", error);
    return null;
  }
}

export type HostFlagSummary = NonNullable<Awaited<ReturnType<typeof hostFlagSummary>>>;
