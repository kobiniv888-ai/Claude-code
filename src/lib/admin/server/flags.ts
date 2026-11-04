import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AppLocale, CurrencyCode } from "@/config/site";
import type { BookingStatus } from "@/generated/prisma/enums";
import { personName } from "@/lib/auth/first-name";
import { dateToDay } from "@/lib/booking/dates";
import { toNumber } from "@/lib/booking/terms";
import { db } from "@/lib/db";
import { pageInfo } from "../params";
import {
  HOST_REPORT_FLAG_MIN,
  bookingFlagKind,
  hostReportFlagOpen,
  hostReportWindowStart,
  hoursFromBookingToCancel,
  isFlaggedHost,
  type BookingFlagKind,
} from "../flags";

/**
 * Admin → Flags queries (server-only; the rules are in ../flags.ts). Every count is one query.
 */

export const FLAG_VIEWS = ["cancellations", "noShows", "hosts"] as const;
export type FlagView = (typeof FLAG_VIEWS)[number];
export const FLAG_STATES = ["open", "reviewed"] as const;
export type FlagState = (typeof FLAG_STATES)[number];
export const FLAGS_PAGE_SIZE = 25;

const OPEN_CANCELLATION: Prisma.BookingWhereInput = { flaggedForReview: true, flagReviewedAt: null };
const OPEN_NO_SHOW: Prisma.BookingWhereInput = { status: "NO_SHOW", flaggedForReview: false, flagReviewedAt: null };

function bookingWhere(view: "cancellations" | "noShows", state: FlagState): Prisma.BookingWhereInput {
  const base: Prisma.BookingWhereInput = view === "cancellations" ? { flaggedForReview: true } : { status: "NO_SHOW", flaggedForReview: false };
  return { ...base, flagReviewedAt: state === "open" ? null : { not: null } };
}

type HostFlagRow = { hostId: string; reports: number; turnedAway: number; open: number; latest: Date; reviewedAt: Date | null };

/**
 * Hosts with HOST_REPORT_FLAG_MIN or more counting reports (not dismissed, not about a review,
 * in the window), with the latest one and the host's last review. A "host" owns at least one
 * listing that is not a draft. `state` "open": a report arrived after the last review.
 */
async function hostFlagRows(now: Date, opts: { state: FlagState | "any"; userId?: string; limit?: number; offset?: number }): Promise<HostFlagRow[]> {
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

async function countHostFlags(now: Date, state: FlagState): Promise<number> {
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
 * Is this host flagged right now (an open report flag or an open host-cancellation flag)? Used by
 * the review rule; it THROWS on a database error so the caller can fail closed.
 */
export async function isHostFlagged(userId: string, now: Date = new Date()): Promise<boolean> {
  const [rows, openCancellationFlags] = await Promise.all([
    hostFlagRows(now, { state: "any", userId, limit: 1 }),
    db.booking.count({ where: { ...OPEN_CANCELLATION, hostUserId: userId } }),
  ]);
  const row = rows[0];
  const reportFlagOpen = row ? hostReportFlagOpen({ reportCount: row.reports, latestReportAt: row.latest, reviewedAt: row.reviewedAt }) : false;
  return isFlaggedHost({ reportFlagOpen, openCancellationFlags });
}

/** The flag state of one host for the user page and the review page. Never throws. */
export async function hostFlagSummary(userId: string, now: Date = new Date()) {
  try {
    const [rows, openCancellations, openNoShows, reviewedAt] = await Promise.all([
      hostFlagRows(now, { state: "any", userId, limit: 1 }),
      db.booking.count({ where: { ...OPEN_CANCELLATION, hostUserId: userId } }),
      db.booking.count({ where: { ...OPEN_NO_SHOW, hostUserId: userId } }),
      db.user.findUnique({ where: { id: userId }, select: { hostFlagReviewedAt: true } }),
    ]);
    const row = rows[0] ?? null;
    const reportFlagOpen = row ? hostReportFlagOpen({ reportCount: row.reports, latestReportAt: row.latest, reviewedAt: row.reviewedAt }) : false;
    return {
      flagged: isFlaggedHost({ reportFlagOpen, openCancellationFlags: openCancellations }),
      reportFlagOpen,
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

// ─── Lists ────────────────────────────────────────────────────

export type FlagBookingRow = {
  id: string;
  code: string;
  kind: BookingFlagKind;
  status: BookingStatus;
  checkIn: string;
  checkOut: string;
  nights: number;
  total: number;
  currency: CurrencyCode;
  createdAt: Date;
  cancelledAt: Date | null;
  hoursToCancel: number | null;
  cancelReasonCode: string | null;
  cancelReason: string | null;
  noShowReportedAt: Date | null;
  flagReviewedAt: Date | null;
  reviewedBy: string | null;
  reportCount: number;
  guest: { id: string; name: string };
  host: { id: string; name: string };
  listing: { id: string; publicId: number; title: string };
};

export type FlagHostRow = {
  id: string;
  name: string;
  status: string;
  reports: number;
  turnedAway: number;
  openReports: number;
  latestReportAt: Date;
  reviewedAt: Date | null;
  listings: number;
  openCancellations: number;
};

export async function listFlags(
  view: FlagView,
  state: FlagState,
  requestedPage: number,
  locale: AppLocale,
  now: Date = new Date(),
): Promise<{ counts: Record<FlagView, number>; total: number; page: number; bookings: FlagBookingRow[]; hosts: FlagHostRow[] }> {
  const [cancellations, noShows, hosts] = await Promise.all([
    db.booking.count({ where: bookingWhere("cancellations", state) }),
    db.booking.count({ where: bookingWhere("noShows", state) }),
    countHostFlags(now, state),
  ]);
  const counts = { cancellations, noShows, hosts };
  const info = pageInfo(counts[view], requestedPage, FLAGS_PAGE_SIZE);

  if (view === "hosts") {
    const rows = await hostFlagRows(now, { state, limit: FLAGS_PAGE_SIZE, offset: info.skip });
    const ids = rows.map((r) => r.hostId);
    const [users, cancellationsByHost] = await Promise.all([
      db.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, firstName: true, businessName: true, status: true, _count: { select: { listings: { where: { status: { not: "DRAFT" } } } } } },
      }),
      ids.length
        ? db.booking.groupBy({ by: ["hostUserId"], where: { ...OPEN_CANCELLATION, hostUserId: { in: ids } }, _count: { _all: true } })
        : Promise.resolve([]),
    ]);
    const byId = new Map(users.map((u) => [u.id, u]));
    const cancelCount = new Map(cancellationsByHost.map((c) => [c.hostUserId, c._count._all]));
    return {
      counts,
      total: counts.hosts,
      page: info.page,
      bookings: [],
      hosts: rows.flatMap((r) => {
        const user = byId.get(r.hostId);
        if (!user) return [];
        return [
          {
            id: user.id,
            name: user.businessName || personName(user) || user.name,
            status: user.status,
            reports: r.reports,
            turnedAway: r.turnedAway,
            openReports: r.open,
            latestReportAt: r.latest,
            reviewedAt: r.reviewedAt,
            listings: user._count.listings,
            openCancellations: cancelCount.get(user.id) ?? 0,
          },
        ];
      }),
    };
  }

  const rows = await db.booking.findMany({
    where: bookingWhere(view, state),
    orderBy: view === "cancellations" ? [{ cancelledAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }] : [{ noShowReportedAt: { sort: "desc", nulls: "last" } }],
    skip: info.skip,
    take: FLAGS_PAGE_SIZE,
    select: {
      id: true,
      code: true,
      status: true,
      checkIn: true,
      checkOut: true,
      nights: true,
      total: true,
      currency: true,
      createdAt: true,
      cancelledAt: true,
      cancelReasonCode: true,
      cancelReason: true,
      flaggedForReview: true,
      noShowReportedAt: true,
      flagReviewedAt: true,
      flagReviewedById: true,
      guestName: true,
      guestUserId: true,
      hostUserId: true,
      host: { select: { firstName: true, name: true } },
      listing: { select: { id: true, publicId: true, title: true, translations: { where: { locale }, select: { title: true } } } },
      _count: { select: { reports: true } },
    },
  });
  const reviewers = [...new Set(rows.map((r) => r.flagReviewedById).filter((id): id is string => !!id))];
  const names = reviewers.length ? new Map((await db.user.findMany({ where: { id: { in: reviewers } }, select: { id: true, name: true } })).map((u) => [u.id, u.name])) : new Map<string, string>();
  return {
    counts,
    total: counts[view],
    page: info.page,
    hosts: [],
    bookings: rows.map((row) => ({
      id: row.id,
      code: row.code,
      kind: bookingFlagKind(row) ?? "no_show",
      status: row.status,
      checkIn: dateToDay(row.checkIn),
      checkOut: dateToDay(row.checkOut),
      nights: row.nights,
      total: toNumber(row.total) ?? 0,
      currency: row.currency,
      createdAt: row.createdAt,
      cancelledAt: row.cancelledAt,
      hoursToCancel: hoursFromBookingToCancel(row.createdAt, row.cancelledAt),
      cancelReasonCode: row.cancelReasonCode,
      cancelReason: row.cancelReason,
      noShowReportedAt: row.noShowReportedAt,
      flagReviewedAt: row.flagReviewedAt,
      reviewedBy: row.flagReviewedById ? (names.get(row.flagReviewedById) ?? null) : null,
      reportCount: row._count.reports,
      guest: { id: row.guestUserId, name: row.guestName },
      host: { id: row.hostUserId, name: personName(row.host) ?? row.host.name },
      listing: { id: row.listing.id, publicId: row.listing.publicId, title: row.listing.translations[0]?.title?.trim() || row.listing.title },
    })),
  };
}
