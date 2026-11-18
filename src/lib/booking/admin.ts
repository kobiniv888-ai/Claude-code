import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AppLocale, CurrencyCode } from "@/config/site";
import type { BookingStatus } from "@/generated/prisma/enums";
import { pageInfo } from "@/lib/admin/params";
import { personName } from "@/lib/auth/first-name";
import { db } from "@/lib/db";
import { dateToDay } from "./dates";
import { toNumber } from "./terms";

/**
 * Staff view of bookings (/admin/bookings, "moderation" permission): host cancellations flagged
 * for review (within 48 hours of the booking, or a guest saying "the host asked me to cancel"),
 * no-show reports, and the latest bookings. Read-only: the rules for these come later.
 */

export const ADMIN_BOOKING_VIEWS = ["flagged", "noShow", "recent"] as const;
export type AdminBookingView = (typeof ADMIN_BOOKING_VIEWS)[number];
export const ADMIN_BOOKINGS_PAGE_SIZE = 25;

const WHERE: Record<AdminBookingView, Prisma.BookingWhereInput> = {
  flagged: { flaggedForReview: true },
  noShow: { status: "NO_SHOW" },
  recent: {},
};

const ORDER: Record<AdminBookingView, Prisma.BookingOrderByWithRelationInput[]> = {
  flagged: [{ cancelledAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  noShow: [{ noShowReportedAt: { sort: "desc", nulls: "last" } }],
  recent: [{ createdAt: "desc" }],
};

export type AdminBookingRow = {
  id: string;
  code: string;
  status: BookingStatus;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  total: number;
  currency: CurrencyCode;
  createdAt: Date;
  cancelledAt: Date | null;
  /** Hours from booking to cancellation (null when not cancelled). */
  hoursToCancel: number | null;
  cancelReasonCode: string | null;
  cancelReason: string | null;
  flaggedForReview: boolean;
  noShowReportedAt: Date | null;
  guest: { id: string; name: string };
  host: { id: string; name: string };
  listing: { id: string; publicId: number; title: string };
};

export async function listAdminBookings(
  view: AdminBookingView,
  requestedPage: number,
  locale: AppLocale,
): Promise<{ rows: AdminBookingRow[]; total: number; page: number; counts: Record<AdminBookingView, number> }> {
  const [flagged, noShow, recent] = await Promise.all(ADMIN_BOOKING_VIEWS.map((v) => db.booking.count({ where: WHERE[v] })));
  const counts = { flagged, noShow, recent };
  const info = pageInfo(counts[view], requestedPage, ADMIN_BOOKINGS_PAGE_SIZE);
  const rows = await db.booking.findMany({
    where: WHERE[view],
    orderBy: ORDER[view],
    skip: info.skip,
    take: ADMIN_BOOKINGS_PAGE_SIZE,
    select: {
      id: true,
      code: true,
      status: true,
      checkIn: true,
      checkOut: true,
      nights: true,
      adults: true,
      children: true,
      total: true,
      currency: true,
      createdAt: true,
      cancelledAt: true,
      cancelReasonCode: true,
      cancelReason: true,
      flaggedForReview: true,
      noShowReportedAt: true,
      guestName: true,
      guestUserId: true,
      hostUserId: true,
      host: { select: { firstName: true, name: true } },
      listing: { select: { id: true, publicId: true, title: true, translations: { where: { locale }, select: { title: true } } } },
    },
  });
  return {
    counts,
    total: counts[view],
    page: info.page,
    rows: rows.map((row) => ({
      id: row.id,
      code: row.code,
      status: row.status,
      checkIn: dateToDay(row.checkIn),
      checkOut: dateToDay(row.checkOut),
      nights: row.nights,
      guests: row.adults + row.children,
      total: toNumber(row.total) ?? 0,
      currency: row.currency,
      createdAt: row.createdAt,
      cancelledAt: row.cancelledAt,
      hoursToCancel: row.cancelledAt ? Math.max(0, Math.round((row.cancelledAt.getTime() - row.createdAt.getTime()) / 3_600_000)) : null,
      cancelReasonCode: row.cancelReasonCode,
      cancelReason: row.cancelReason,
      flaggedForReview: row.flaggedForReview,
      noShowReportedAt: row.noShowReportedAt,
      guest: { id: row.guestUserId, name: row.guestName },
      host: { id: row.hostUserId, name: personName(row.host) ?? "" },
      listing: {
        id: row.listing.id,
        publicId: row.listing.publicId,
        title: row.listing.translations[0]?.title?.trim() || row.listing.title,
      },
    })),
  };
}
