import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { AppLocale, CurrencyCode } from "@/config/site";
import type { BookingStatus } from "@/generated/prisma/enums";
import { personName } from "@/lib/auth/first-name";
import { dateToDay, dayToDate, tbilisiToday } from "@/lib/booking/dates";
import {
  FLIGHT_CANCELLED_REASON,
  LONG_STAY_FLAG_NIGHTS,
  REPEAT_CANCEL_FLAG_MIN,
  REPEAT_NO_SHOW_FLAG_MIN,
  repeatCancelWindowStart,
  repeatNoShowWindowStart,
  summarizeGuestFlag,
  type GuestFlagSummary,
} from "@/lib/booking/guest-flags";
import { toNumber } from "@/lib/booking/terms";
import { db } from "@/lib/db";
import type { FlagState } from "@/lib/listing/host-flags-server";

/**
 * Admin → Flags, the guest lists (server-only; the rules are pure in src/lib/booking/guest-flags.ts;
 * founder's decision 7, Q14, SECURITY_REPORT 4.6.b/c). LISTED FOR REVIEW ONLY: nothing here refuses
 * a booking, hides anything or tells anyone; staff look and decide themselves.
 *
 *   - long stays: confirmed bookings of LONG_STAY_FLAG_NIGHTS (14) nights or more that have not
 *     ended yet (one booking can block a host's calendar for weeks);
 *   - guests: REPEAT_CANCEL_FLAG_MIN (3) counting guest cancellations in 90 days, or
 *     REPEAT_NO_SHOW_FLAG_MIN (2) "didn't arrive" reports in 365 days. A cancellation with the
 *     reason "my flight was cancelled" or inside a travel-disruption window never counts
 *     (countsAsGuestCancellation).
 *
 * "Reviewed" is an audit-log entry (D11 a, no schema field): LONG_STAY_REVIEWED_ACTION on the
 * booking, GUEST_FLAG_REVIEWED_ACTION on the guest. A guest's flag opens again when a new counting
 * event arrives after the last review; a long stay stays reviewed.
 *
 * The SQL below only narrows the candidates (it already leaves out the flight-cancelled reason);
 * the final count for each guest is the pure rule over their rows, so the travel-disruption hook
 * applies without changing any query.
 */

export const LONG_STAY_REVIEWED_ACTION = "flag.long_stay_reviewed";
export const GUEST_FLAG_REVIEWED_ACTION = "flag.guest_reviewed";

/** Enough for any realistic list (it is computed whole, then paged). */
const CANDIDATE_LIMIT = 2000;

// ─── Long stays ───────────────────────────────────────────────

export type LongStayRow = {
  id: string;
  code: string;
  status: BookingStatus;
  checkIn: string;
  checkOut: string;
  nights: number;
  total: number;
  currency: CurrencyCode;
  createdAt: Date;
  guestCreatedAt: Date | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  guest: { id: string; name: string };
  host: { id: string; name: string };
  listing: { id: string; publicId: number; title: string };
};

/**
 * The ids of the long stays in `state`, newest booking first. Open: confirmed, not ended (Georgia
 * today), never marked reviewed. Reviewed: marked reviewed (any status since).
 */
async function longStayIds(state: FlagState, now: Date, page?: { limit: number; offset: number }): Promise<{ ids: string[]; total: number }> {
  const today = dayToDate(tbilisiToday(now));
  const reviewed = Prisma.sql`EXISTS (SELECT 1 FROM "AuditLog" a WHERE a."action" = ${LONG_STAY_REVIEWED_ACTION} AND a."targetType" = 'Booking' AND a."targetId" = b."id")`;
  const where =
    state === "open"
      ? Prisma.sql`b."nights" >= ${LONG_STAY_FLAG_NIGHTS} AND b."status" = 'CONFIRMED' AND b."checkOut" > ${today} AND NOT ${reviewed}`
      : Prisma.sql`b."nights" >= ${LONG_STAY_FLAG_NIGHTS} AND ${reviewed}`;
  const [count] = await db.$queryRaw<{ n: bigint | number }[]>`SELECT COUNT(*)::bigint AS n FROM "Booking" b WHERE ${where}`;
  const total = Number(count?.n ?? 0);
  if (!page || total === 0) return { ids: [], total };
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT b."id" FROM "Booking" b WHERE ${where}
    ORDER BY b."checkIn" ASC, b."createdAt" DESC
    LIMIT ${page.limit} OFFSET ${page.offset}`;
  return { ids: rows.map((r) => r.id), total };
}

export async function countLongStays(state: FlagState, now: Date = new Date()): Promise<number> {
  return (await longStayIds(state, now)).total;
}

/** The last "reviewed" entry per target (time and who). */
async function lastReviews(action: string, targetType: "Booking" | "User", ids: readonly string[]): Promise<Map<string, { at: Date; by: string | null }>> {
  if (ids.length === 0) return new Map();
  const rows = await db.auditLog.findMany({
    where: { action, targetType, targetId: { in: [...ids] } },
    orderBy: { createdAt: "desc" },
    select: { targetId: true, createdAt: true, actor: { select: { name: true } } },
  });
  const out = new Map<string, { at: Date; by: string | null }>();
  for (const row of rows) {
    if (row.targetId && !out.has(row.targetId)) out.set(row.targetId, { at: row.createdAt, by: row.actor?.name ?? null });
  }
  return out;
}

export async function listLongStays(
  state: FlagState,
  page: { limit: number; offset: number },
  locale: AppLocale,
  now: Date = new Date(),
): Promise<{ total: number; rows: LongStayRow[] }> {
  const { ids, total } = await longStayIds(state, now, page);
  if (ids.length === 0) return { total, rows: [] };
  const [bookings, reviews] = await Promise.all([
    db.booking.findMany({
      where: { id: { in: ids } },
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
        guestName: true,
        guestUserId: true,
        hostUserId: true,
        guest: { select: { createdAt: true } },
        host: { select: { firstName: true, name: true } },
        listing: { select: { id: true, publicId: true, title: true, translations: { where: { locale }, select: { title: true } } } },
      },
    }),
    lastReviews(LONG_STAY_REVIEWED_ACTION, "Booking", ids),
  ]);
  const byId = new Map(bookings.map((b) => [b.id, b]));
  return {
    total,
    rows: ids.flatMap((id) => {
      const row = byId.get(id);
      if (!row) return [];
      const review = reviews.get(id) ?? null;
      return [
        {
          id: row.id,
          code: row.code,
          status: row.status,
          checkIn: dateToDay(row.checkIn),
          checkOut: dateToDay(row.checkOut),
          nights: row.nights,
          total: toNumber(row.total) ?? 0,
          currency: row.currency,
          createdAt: row.createdAt,
          guestCreatedAt: row.guest?.createdAt ?? null,
          reviewedAt: review?.at ?? null,
          reviewedBy: review?.by ?? null,
          guest: { id: row.guestUserId, name: row.guestName },
          host: { id: row.hostUserId, name: personName(row.host) ?? row.host.name },
          listing: { id: row.listing.id, publicId: row.listing.publicId, title: row.listing.translations[0]?.title?.trim() || row.listing.title },
        },
      ];
    }),
  };
}

/** One booking's long-stay state (for "mark reviewed"): null when it is not a long stay. */
export async function longStayReview(bookingId: string): Promise<{ reviewedAt: Date | null } | null> {
  const booking = await db.booking.findUnique({ where: { id: bookingId }, select: { nights: true } });
  if (!booking || booking.nights < LONG_STAY_FLAG_NIGHTS) return null;
  const review = (await lastReviews(LONG_STAY_REVIEWED_ACTION, "Booking", [bookingId])).get(bookingId);
  return { reviewedAt: review?.at ?? null };
}

// ─── Guests with repeated cancellations or no-shows ───────────

export type GuestFlagRow = GuestFlagSummary & {
  id: string;
  name: string;
  status: string;
  createdAt: Date;
  reviewedBy: string | null;
};

/** Guests who may meet a repeat rule (a superset: the pure rule decides). */
async function candidateGuestIds(now: Date, userId?: string): Promise<string[]> {
  const cancelSince = repeatCancelWindowStart(now);
  const noShowSince = repeatNoShowWindowStart(now);
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT b."guestUserId" AS id
    FROM "Booking" b
    WHERE ((b."status" = 'CANCELLED_BY_GUEST' AND b."cancelledAt" >= ${cancelSince} AND b."cancelledAt" <= ${now})
        OR (b."status" = 'NO_SHOW' AND b."noShowReportedAt" >= ${noShowSince} AND b."noShowReportedAt" <= ${now}))
      AND (${userId ?? null}::text IS NULL OR b."guestUserId" = ${userId ?? null}::text)
    GROUP BY b."guestUserId"
    HAVING COUNT(*) FILTER (
             WHERE b."status" = 'CANCELLED_BY_GUEST' AND b."cancelledAt" >= ${cancelSince}
               AND (b."cancelReasonCode" IS NULL OR b."cancelReasonCode" <> ${FLIGHT_CANCELLED_REASON})
           ) >= ${REPEAT_CANCEL_FLAG_MIN}
        OR COUNT(*) FILTER (WHERE b."status" = 'NO_SHOW' AND b."noShowReportedAt" >= ${noShowSince}) >= ${REPEAT_NO_SHOW_FLAG_MIN}
    LIMIT ${CANDIDATE_LIMIT}`;
  return rows.map((r) => r.id);
}

/** Every flagged guest with their counts, newest event first (`state` "any" = open and reviewed). */
export async function guestFlagRows(now: Date, opts: { state: FlagState | "any"; userId?: string } = { state: "any" }): Promise<GuestFlagRow[]> {
  const ids = await candidateGuestIds(now, opts.userId);
  if (ids.length === 0) return [];
  const cancelSince = repeatCancelWindowStart(now);
  const noShowSince = repeatNoShowWindowStart(now);
  const [bookings, users, reviews] = await Promise.all([
    db.booking.findMany({
      where: {
        guestUserId: { in: ids },
        OR: [
          { status: "CANCELLED_BY_GUEST", cancelledAt: { gte: cancelSince, lte: now } },
          { status: "NO_SHOW", noShowReportedAt: { gte: noShowSince, lte: now } },
        ],
      },
      select: { guestUserId: true, listingId: true, status: true, checkIn: true, checkOut: true, cancelledAt: true, cancelReasonCode: true, noShowReportedAt: true },
    }),
    db.user.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true, name: true, firstName: true, status: true, createdAt: true } }),
    lastReviews(GUEST_FLAG_REVIEWED_ACTION, "User", ids),
  ]);
  const perGuest = new Map<string, typeof bookings>();
  for (const booking of bookings) perGuest.set(booking.guestUserId, [...(perGuest.get(booking.guestUserId) ?? []), booking]);
  const rows: GuestFlagRow[] = [];
  for (const user of users) {
    const review = reviews.get(user.id) ?? null;
    const summary = summarizeGuestFlag(
      (perGuest.get(user.id) ?? []).map((b) => ({ ...b, checkIn: dateToDay(b.checkIn), checkOut: dateToDay(b.checkOut) })),
      review?.at ?? null,
      now,
    );
    if (summary.reasons.length === 0) continue;
    if (opts.state === "open" && !summary.open) continue;
    if (opts.state === "reviewed" && summary.open) continue;
    rows.push({ ...summary, id: user.id, name: personName(user) ?? user.name, status: user.status, createdAt: user.createdAt, reviewedBy: review?.by ?? null });
  }
  return rows.sort((a, b) => (b.latestAt?.getTime() ?? 0) - (a.latestAt?.getTime() ?? 0));
}

export async function countGuestFlags(state: FlagState, now: Date = new Date()): Promise<number> {
  return (await guestFlagRows(now, { state })).length;
}

/** One guest's flag (for "mark reviewed" and the user page): null when no rule is met. */
export async function guestFlagSummary(userId: string, now: Date = new Date()): Promise<GuestFlagRow | null> {
  return (await guestFlagRows(now, { state: "any", userId }))[0] ?? null;
}

/** The open guest-side flags, for the navigation badge. */
export async function getOpenGuestFlagCounts(now: Date = new Date()): Promise<{ longStays: number; guests: number }> {
  const [longStays, guests] = await Promise.all([countLongStays("open", now), countGuestFlags("open", now)]);
  return { longStays, guests };
}
