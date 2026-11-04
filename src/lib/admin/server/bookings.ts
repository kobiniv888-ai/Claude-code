import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AppLocale, CurrencyCode } from "@/config/site";
import type { BookingStatus } from "@/generated/prisma/enums";
import { pickLocalized } from "@/i18n/locale";
import { personName } from "@/lib/auth/first-name";
import { dateToDay, eachNight, isWeekendNight } from "@/lib/booking/dates";
import { toNumber } from "@/lib/booking/terms";
import { db } from "@/lib/db";
import { parseBookingSearch, stayOverlap, type AdminBookingStatus } from "../booking-search";
import { bookingFlagKind, hoursFromBookingToCancel } from "../flags";
import { pageInfo } from "../params";
import { HOST_UNREACHABLE_ACTION } from "./attention";

/**
 * Admin → Bookings (server-only, "moderation"): search by booking code, guest, host, listing
 * number, stay dates and status; the staff booking page; and the booking attempts refused because
 * the host could not be told (phase 1 "host unreachable", from the audit log).
 */

export const ADMIN_BOOKINGS_PAGE_SIZE = 25;
export const ADMIN_BOOKING_VIEWS = ["all", "unreachable"] as const;
export type AdminBookingView = (typeof ADMIN_BOOKING_VIEWS)[number];

export type BookingSearchFilters = {
  q: string;
  status?: AdminBookingStatus;
  from: Date | null;
  to: Date | null;
};

/** The users a search text can mean (name, business name, email, phone, listing number). */
async function matchingUserIds(q: string): Promise<string[]> {
  const terms = parseBookingSearch(q).people;
  const or: Prisma.UserWhereInput[] = [];
  if (terms.text && terms.text.length >= 2) {
    or.push(
      { name: { contains: terms.text, mode: "insensitive" } },
      { firstName: { contains: terms.text, mode: "insensitive" } },
      { businessName: { contains: terms.text, mode: "insensitive" } },
      { email: { contains: terms.text, mode: "insensitive" } },
      { contactEmail: { contains: terms.text, mode: "insensitive" } },
    );
  }
  if (terms.email) or.push({ email: { equals: terms.email, mode: "insensitive" } });
  if (terms.phones.length) or.push({ phoneNumber: { in: terms.phones } });
  if (terms.phoneDigits) or.push({ phoneNumber: { contains: terms.phoneDigits } });
  if (terms.userId) or.push({ id: terms.userId });
  if (or.length === 0) return [];
  const users = await db.user.findMany({ where: { OR: or }, select: { id: true }, take: 200 });
  return users.map((u) => u.id);
}

export async function bookingSearchWhere(filters: BookingSearchFilters): Promise<Prisma.BookingWhereInput> {
  const and: Prisma.BookingWhereInput[] = [];
  const q = filters.q.trim();
  if (q) {
    const { code, people } = parseBookingSearch(q);
    const or: Prisma.BookingWhereInput[] = [];
    if (code) or.push({ code });
    if (people.listingPublicId) or.push({ listing: { publicId: people.listingPublicId } });
    if (people.text && people.text.length >= 2) or.push({ guestName: { contains: people.text, mode: "insensitive" } });
    if (people.phones.length) or.push({ guestPhone: { in: people.phones } });
    if (people.phoneDigits) or.push({ guestPhone: { contains: people.phoneDigits } });
    const userIds = await matchingUserIds(q);
    if (userIds.length) or.push({ guestUserId: { in: userIds } }, { hostUserId: { in: userIds } });
    // Something was typed but nothing can match it.
    and.push(or.length ? { OR: or } : { id: "__none__" });
  }
  if (filters.status) and.push({ status: filters.status });
  const overlap = stayOverlap(filters.from, filters.to);
  if (!overlap) and.push({ id: "__none__" });
  else {
    if (overlap.checkInBefore) and.push({ checkIn: { lt: overlap.checkInBefore } });
    if (overlap.checkOutAfter) and.push({ checkOut: { gt: overlap.checkOutAfter } });
  }
  return and.length ? { AND: and } : {};
}

export type AdminBookingListRow = {
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
  flag: "host_cancellation" | "no_show" | null;
  flagOpen: boolean;
  reportCount: number;
  guest: { id: string; name: string };
  host: { id: string; name: string };
  listing: { id: string; publicId: number; title: string };
};

export async function searchBookings(filters: BookingSearchFilters, requestedPage: number, locale: AppLocale) {
  const where = await bookingSearchWhere(filters);
  const total = await db.booking.count({ where });
  const info = pageInfo(total, requestedPage, ADMIN_BOOKINGS_PAGE_SIZE);
  const rows = await db.booking.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
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
      flaggedForReview: true,
      flagReviewedAt: true,
      guestName: true,
      guestUserId: true,
      hostUserId: true,
      host: { select: { firstName: true, name: true, businessName: true } },
      listing: { select: { id: true, publicId: true, title: true, translations: { where: { locale }, select: { title: true } } } },
      _count: { select: { reports: true } },
    },
  });
  return {
    total,
    page: info.page,
    rows: rows.map(
      (row): AdminBookingListRow => ({
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
        flag: bookingFlagKind(row),
        flagOpen: !!bookingFlagKind(row) && !row.flagReviewedAt,
        reportCount: row._count.reports,
        guest: { id: row.guestUserId, name: row.guestName },
        host: { id: row.hostUserId, name: row.host.businessName || personName(row.host) || row.host.name },
        listing: { id: row.listing.id, publicId: row.listing.publicId, title: row.listing.translations[0]?.title?.trim() || row.listing.title },
      }),
    ),
  };
}

// ─── Host unreachable (phase 1) ───────────────────────────────

export type UnreachableRow = {
  id: string;
  createdAt: Date;
  stage: "before" | "after" | null;
  reason: string | null;
  bookingCode: string | null;
  attempts: { channel: string; accepted: boolean; error: string | null }[];
  listing: { id: string; publicId: number; title: string } | null;
  host: { id: string; name: string } | null;
  guest: { id: string; name: string } | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Booking attempts refused because the host could not be told (newest first). */
export async function listHostUnreachable(requestedPage: number) {
  const where: Prisma.AuditLogWhereInput = { action: HOST_UNREACHABLE_ACTION };
  const total = await db.auditLog.count({ where });
  const info = pageInfo(total, requestedPage, ADMIN_BOOKINGS_PAGE_SIZE);
  const rows = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: info.skip,
    take: ADMIN_BOOKINGS_PAGE_SIZE,
    select: { id: true, createdAt: true, targetId: true, details: true, actor: { select: { id: true, name: true } } },
  });
  const listingIds = [...new Set(rows.map((r) => r.targetId).filter((id): id is string => !!id))];
  const hostIds = [...new Set(rows.map((r) => record(r.details).hostUserId).filter((id): id is string => typeof id === "string"))];
  const [listings, hosts] = await Promise.all([
    listingIds.length ? db.listing.findMany({ where: { id: { in: listingIds } }, select: { id: true, publicId: true, title: true } }) : Promise.resolve([]),
    hostIds.length ? db.user.findMany({ where: { id: { in: hostIds } }, select: { id: true, name: true, firstName: true, businessName: true } }) : Promise.resolve([]),
  ]);
  const listingById = new Map(listings.map((l) => [l.id, l]));
  const hostById = new Map(hosts.map((h) => [h.id, h]));
  return {
    total,
    page: info.page,
    rows: rows.map((row): UnreachableRow => {
      const details = record(row.details);
      const host = typeof details.hostUserId === "string" ? hostById.get(details.hostUserId) : undefined;
      const listing = row.targetId ? listingById.get(row.targetId) : undefined;
      const attempts = Array.isArray(details.attempts) ? details.attempts.map(record) : [];
      return {
        id: row.id,
        createdAt: row.createdAt,
        stage: details.stage === "before" || details.stage === "after" ? details.stage : null,
        reason: typeof details.reason === "string" ? details.reason : null,
        bookingCode: typeof details.bookingCode === "string" ? details.bookingCode : null,
        attempts: attempts.map((a) => ({
          channel: typeof a.channel === "string" ? a.channel : "?",
          accepted: a.accepted === true,
          error: typeof a.error === "string" ? a.error : null,
        })),
        listing: listing ? { id: listing.id, publicId: listing.publicId, title: listing.title } : null,
        host: host ? { id: host.id, name: host.businessName || personName(host) || host.name } : null,
        guest: row.actor ? { id: row.actor.id, name: row.actor.name } : null,
      };
    }),
  };
}

// ─── Booking page ─────────────────────────────────────────────

export type StoredPriceLine = { kind: "weekday" | "weekend"; nights: number; price: number; amount: number };

/** The nightly lines of a stored booking (from its copied prices), like the guest saw them. */
export function storedPriceLines(booking: { checkIn: string; checkOut: string; nightlyPrice: number; weekendPrice: number | null }): StoredPriceLine[] {
  const nights = eachNight(booking.checkIn, booking.checkOut);
  const weekend = booking.weekendPrice && booking.weekendPrice > 0 ? booking.weekendPrice : null;
  const weekendNights = weekend === null ? 0 : nights.filter(isWeekendNight).length;
  const weekdayNights = nights.length - weekendNights;
  const lines: StoredPriceLine[] = [];
  const amount = (price: number, count: number) => Math.round(price * 100 * count) / 100;
  if (weekdayNights > 0) lines.push({ kind: "weekday", nights: weekdayNights, price: booking.nightlyPrice, amount: amount(booking.nightlyPrice, weekdayNights) });
  if (weekend !== null && weekendNights > 0) lines.push({ kind: "weekend", nights: weekendNights, price: weekend, amount: amount(weekend, weekendNights) });
  return lines;
}

export async function getAdminBooking(id: string, locale: AppLocale) {
  const booking = await db.booking.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      status: true,
      checkIn: true,
      checkOut: true,
      nights: true,
      adults: true,
      children: true,
      infants: true,
      nightlyPrice: true,
      weekendPrice: true,
      subtotal: true,
      cleaningFee: true,
      total: true,
      currency: true,
      displayCurrency: true,
      displayTotal: true,
      cancellationPolicy: true,
      paymentMethods: true,
      cancelReasonCode: true,
      cancelReason: true,
      cancelledAt: true,
      cancelledById: true,
      flaggedForReview: true,
      flagReviewedAt: true,
      flagReviewedById: true,
      noShowReportedAt: true,
      messageToHost: true,
      guestName: true,
      guestPhone: true,
      locale: true,
      rulesAcceptedAt: true,
      reminderSentAt: true,
      hostNotifiedAt: true,
      hostNotifiedVia: true,
      roomTypeName: true,
      createdAt: true,
      updatedAt: true,
      guest: { select: { id: true, name: true, firstName: true, status: true, isDemo: true } },
      host: { select: { id: true, name: true, firstName: true, businessName: true, status: true, isDemo: true } },
      listing: {
        select: { id: true, publicId: true, title: true, dealType: true, status: true, isDemo: true, translations: { where: { locale }, select: { title: true } } },
      },
      reports: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, kind: true, reason: true, status: true, priority: true, createdAt: true },
      },
    },
  });
  if (!booking) return null;

  const [history, staff] = await Promise.all([
    db.auditLog.findMany({
      where: { targetType: "Booking", targetId: booking.id },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: { id: true, action: true, createdAt: true, details: true, actor: { select: { id: true, name: true, role: true } } },
    }),
    booking.flagReviewedById ? db.user.findUnique({ where: { id: booking.flagReviewedById }, select: { name: true } }) : Promise.resolve(null),
  ]);

  const checkIn = dateToDay(booking.checkIn);
  const checkOut = dateToDay(booking.checkOut);
  const nightlyPrice = toNumber(booking.nightlyPrice) ?? 0;
  const weekendPrice = toNumber(booking.weekendPrice);
  return {
    booking: {
      ...booking,
      checkIn,
      checkOut,
      nightlyPrice,
      weekendPrice,
      subtotal: toNumber(booking.subtotal) ?? 0,
      cleaningFee: toNumber(booking.cleaningFee) ?? 0,
      total: toNumber(booking.total) ?? 0,
      displayTotal: toNumber(booking.displayTotal),
      roomTypeName: booking.roomTypeName ? pickLocalized(booking.roomTypeName, locale) || null : null,
      listingTitle: booking.listing.translations[0]?.title?.trim() || booking.listing.title,
      hostName: booking.host.businessName || personName(booking.host) || booking.host.name,
      notifiedVia: (booking.hostNotifiedVia ?? "").split(",").map((c) => c.trim()).filter(Boolean),
      flag: bookingFlagKind(booking),
      hoursToCancel: hoursFromBookingToCancel(booking.createdAt, booking.cancelledAt),
      flagReviewedBy: staff?.name ?? null,
    },
    lines: storedPriceLines({ checkIn, checkOut, nightlyPrice, weekendPrice }),
    history: history.map((h) => ({ ...h, details: record(h.details) })),
  };
}

export type AdminBookingDetail = NonNullable<Awaited<ReturnType<typeof getAdminBooking>>>;
