import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AppLocale, CurrencyCode } from "@/config/site";
import type { BookingStatus } from "@/generated/prisma/enums";
import { personName } from "@/lib/auth/first-name";
import { dateToDay } from "@/lib/booking/dates";
import { toNumber } from "@/lib/booking/terms";
import { db } from "@/lib/db";
import { bookingFlagKind, hoursFromBookingToCancel, type BookingFlagKind } from "@/lib/listing/host-flags";
import { countHostFlags, hostFlagRows, OPEN_CANCELLATION, type FlagState } from "@/lib/listing/host-flags-server";
import { pageInfo } from "../params";
import type { StaffViewer } from "../staff-visibility";
import { countLongStays, guestFlagRows, listLongStays, type GuestFlagRow, type LongStayRow } from "./guest-flags";
import { withholdTurnedAwayGuests } from "./shared";

/**
 * Admin → Flags lists (server-only; the rules are in src/lib/listing/host-flags.ts and the shared
 * queries in src/lib/listing/host-flags-server.ts, re-exported here for the admin pages). The
 * guest-side lists (long stays, guests with repeated cancellations or no-shows; founder's decision
 * 7) are in ./guest-flags.ts: listed for review only.
 */

export {
  FLAG_STATES,
  getOpenFlagCounts,
  hostFlagSummary,
  isHostFlagged,
  type FlagCounts,
  type FlagState,
  type HostFlagSummary,
} from "@/lib/listing/host-flags-server";

export const FLAG_VIEWS = ["cancellations", "noShows", "longStays", "guests", "hosts"] as const;
export type FlagView = (typeof FLAG_VIEWS)[number];
export const FLAGS_PAGE_SIZE = 25;

function bookingWhere(view: "cancellations" | "noShows", state: FlagState): Prisma.BookingWhereInput {
  const base: Prisma.BookingWhereInput = view === "cancellations" ? { flaggedForReview: true } : { status: "NO_SHOW", flaggedForReview: false };
  return { ...base, flagReviewedAt: state === "open" ? null : { not: null } };
}

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
  /** Null when withheld: a turned-away report on this booking was sent by its guest (Q12). */
  guest: { id: string; name: string } | null;
  /** The viewer is this booking's guest (the own-item rule, also when the guest is withheld). */
  guestIsViewer: boolean;
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
  /** Who is looking: the guest of a booking with a turned-away report is ADMIN only (Q12). Without it, withheld. */
  viewer?: Pick<StaffViewer, "id" | "role">,
  now: Date = new Date(),
): Promise<{
  counts: Record<FlagView, number>;
  total: number;
  page: number;
  bookings: FlagBookingRow[];
  hosts: FlagHostRow[];
  longStays: (Omit<LongStayRow, "guest"> & { guest: LongStayRow["guest"] | null; guestIsViewer: boolean })[];
  guests: GuestFlagRow[];
}> {
  const [cancellations, noShows, hosts, longStays, guestRows] = await Promise.all([
    db.booking.count({ where: bookingWhere("cancellations", state) }),
    db.booking.count({ where: bookingWhere("noShows", state) }),
    countHostFlags(now, state),
    countLongStays(state, now),
    // The guest list is short and computed whole (the pure rule decides each guest), then paged.
    guestFlagRows(now, { state }),
  ]);
  const counts = { cancellations, noShows, hosts, longStays, guests: guestRows.length };
  const info = pageInfo(counts[view], requestedPage, FLAGS_PAGE_SIZE);
  const empty = { bookings: [] as FlagBookingRow[], hosts: [] as FlagHostRow[], longStays: [] as (Omit<LongStayRow, "guest"> & { guest: LongStayRow["guest"] | null; guestIsViewer: boolean })[], guests: [] as GuestFlagRow[] };

  if (view === "longStays") {
    const result = await listLongStays(state, { limit: FLAGS_PAGE_SIZE, offset: info.skip }, locale, now);
    return { ...empty, counts, total: counts.longStays, page: info.page, longStays: (await withholdTurnedAwayGuests(viewer, result.rows)).map((r) => ({ ...r, guestCreatedAt: r.guest ? r.guestCreatedAt : null })) };
  }
  if (view === "guests") {
    return { ...empty, counts, total: counts.guests, page: info.page, guests: guestRows.slice(info.skip, info.skip + FLAGS_PAGE_SIZE) };
  }

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
      ...empty,
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
    ...empty,
    bookings: await withholdTurnedAwayGuests(viewer, rows.map((row) => ({
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
    }))),
  };
}
