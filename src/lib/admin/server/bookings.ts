import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AppLocale, CurrencyCode } from "@/config/site";
import type { BookingStatus } from "@/generated/prisma/enums";
import { pickLocalized } from "@/i18n/locale";
import { personName } from "@/lib/auth/first-name";
import { dateToDay } from "@/lib/booking/dates";
import { bookingPriceLines } from "@/lib/booking/price-lines";
import { toNumber } from "@/lib/booking/terms";
import { db } from "@/lib/db";
import { taintObject } from "@/lib/security/taint";
import { parseBookingSearch, stayOverlap, type AdminBookingStatus } from "../booking-search";
import { bookingFlagKind, hoursFromBookingToCancel } from "../flags";
import { pageInfo } from "../params";
import { canSeeGuestPhone, canSeeReporter, guestWithheldFor, staffPhone, type StaffPhone, type StaffViewer } from "../staff-visibility";
import { HOST_UNREACHABLE_ACTION } from "./attention";
import { turnedAwayBookingIds } from "./shared";

/**
 * Admin → Bookings (server-only, "moderation"): search by booking code, guest, host, listing
 * number, stay dates and status; the staff booking page; and the booking attempts refused because
 * the host could not be told (phase 1 "host unreachable", from the audit log).
 *
 * The guest's phone is ADMIN only (founder's decision Q12, ../staff-visibility.ts): the booking
 * page reads Booking.guestPhone only for a viewer who may see it, and only they may search bookings
 * by a phone number (a search is an answer too: "this number booked that place"). Other staff see
 * its last 2 digits only (founder's answer (c)).
 *
 * The guest of a booking with a turned-away report sent that report, and who sent a report is ADMIN
 * only too: for other staff such a booking comes without its guest (name, account, phone digits)
 * on the booking page and in the search, and a search for a guest never finds it.
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

/**
 * The user filter a search text can mean (name, business name, email, phone, user id), or null.
 * Used as a relation filter on the booking's guest and host, so every matching user counts (no
 * capped pre-fetch of user ids).
 */
export function userSearchWhere(q: string, phones = true): Prisma.UserWhereInput | null {
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
  // Without the guest-phone right (Q12) a phone number finds no booking, not even through the
  // guest's account (the booking's phone is the account's verified number).
  if (phones && terms.phones.length) or.push({ phoneNumber: { in: terms.phones } });
  if (phones && terms.phoneDigits) or.push({ phoneNumber: { contains: terms.phoneDigits } });
  if (terms.userId) or.push({ id: terms.userId });
  return or.length ? { OR: or } : null;
}

export async function bookingSearchWhere(filters: BookingSearchFilters, viewer: Pick<StaffViewer, "role">): Promise<Prisma.BookingWhereInput> {
  const and: Prisma.BookingWhereInput[] = [];
  const q = filters.q.trim();
  if (q) {
    const { code, people } = parseBookingSearch(q);
    const or: Prisma.BookingWhereInput[] = [];
    const phones = canSeeGuestPhone(viewer);
    if (code) or.push({ code });
    if (people.listingPublicId) or.push({ listing: { publicId: people.listingPublicId } });
    // Without the reporter right a guest search never finds a booking with a turned-away report:
    // that the guest booked it would name the report's sender (Q12).
    const guestSide: Prisma.BookingWhereInput = canSeeReporter(viewer) ? {} : { reports: { none: { kind: "TURNED_AWAY" } } };
    if (people.text && people.text.length >= 2) or.push({ guestName: { contains: people.text, mode: "insensitive" }, ...guestSide });
    if (phones && people.phones.length) or.push({ guestPhone: { in: people.phones } });
    if (phones && people.phoneDigits) or.push({ guestPhone: { contains: people.phoneDigits } });
    const users = userSearchWhere(q, phones);
    if (users) or.push({ guest: users, ...guestSide }, { host: users });
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
  /** Null when withheld: the booking has a turned-away report and the viewer may not see its sender (Q12). */
  guest: { id: string; name: string } | null;
  host: { id: string; name: string };
  listing: { id: string; publicId: number; title: string };
};

export async function searchBookings(filters: BookingSearchFilters, requestedPage: number, locale: AppLocale, viewer: StaffViewer) {
  const where = await bookingSearchWhere(filters, viewer);
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
  const turnedAway = canSeeReporter(viewer) ? new Set<string>() : await turnedAwayBookingIds(rows.map((r) => r.id));
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
        guest: guestWithheldFor(viewer, turnedAway.has(row.id)) ? null : { id: row.guestUserId, name: row.guestName },
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

export async function getAdminBooking(id: string, locale: AppLocale, viewer: StaffViewer) {
  const showPhone = canSeeGuestPhone(viewer);
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
      discount: true,
      rooms: true,
      priceLines: true,
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
      // The guest's review of the stay (round 3, brief 8.1): staff open it at /admin/reviews/<id>.
      review: { select: { id: true, rating: true, hidden: true } },
    },
  });
  if (!booking) return null;
  // The raw row (guest name, message, the listing's exact address) never reaches a page as it is
  // (React taint, SECURITY_REPORT 5.k); the page gets the DTO built below.
  taintObject("raw admin booking row", booking);
  // A turned-away report on this booking was sent by its guest: withheld from staff who may not see
  // who sent a report (Q12), with the guest's name, account, phone digits and their own history lines.
  const guestWithheld = guestWithheldFor(viewer, booking.reports.some((r) => r.kind === "TURNED_AWAY"));
  // The number for an ADMIN, the last 2 digits for other staff (Q12, (c)); read in its own query.
  const phone: StaffPhone = guestWithheld
    ? staffPhone(viewer, null)
    : staffPhone(viewer, (await db.booking.findUnique({ where: { id: booking.id }, select: { guestPhone: true } }))?.guestPhone);

  const [history, staff] = await Promise.all([
    db.auditLog.findMany({
      // The booking's history: what happened to it, not who looked at it (booking.view).
      where: { targetType: "Booking", targetId: booking.id, action: { not: "booking.view" } },
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
  const subtotal = toNumber(booking.subtotal) ?? 0;
  const cleaningFee = toNumber(booking.cleaningFee) ?? 0;
  const total = toNumber(booking.total) ?? 0;
  // The lines the guest confirmed (Booking.priceLines, round 3, brief 6.3); for older bookings they
  // are rebuilt from the copied prices, and always add up to the stored total.
  const lines = bookingPriceLines({
    checkIn,
    checkOut,
    nights: booking.nights,
    nightlyPrice,
    weekendPrice,
    subtotal,
    cleaningFee,
    discount: toNumber(booking.discount),
    total,
    rooms: booking.rooms,
    priceLines: booking.priceLines,
  });
  const { guest, guestName, ...rest } = booking;
  return {
    booking: {
      ...rest,
      /** Null when withheld (a turned-away report by this guest; Q12): see `guestWithheld`. */
      guest: guestWithheld ? null : guest,
      guestName: guestWithheld ? null : guestName,
      guestWithheld,
      /** The viewer is this booking's guest (the own-item rule), without the guest's id on the page. */
      guestIsViewer: guest.id === viewer.id,
      /** ADMIN only (Q12); null for other staff (guestPhoneWithheld, guestPhoneMasked). */
      guestPhone: phone.phoneNumber,
      guestPhoneMasked: phone.phoneMasked,
      guestPhoneWithheld: !showPhone,
      checkIn,
      checkOut,
      nightlyPrice,
      weekendPrice,
      subtotal,
      cleaningFee,
      discount: toNumber(booking.discount),
      total,
      displayTotal: toNumber(booking.displayTotal),
      roomTypeName: booking.roomTypeName ? pickLocalized(booking.roomTypeName, locale) || null : null,
      listingTitle: booking.listing.translations[0]?.title?.trim() || booking.listing.title,
      hostName: booking.host.businessName || personName(booking.host) || booking.host.name,
      notifiedVia: (booking.hostNotifiedVia ?? "").split(",").map((c) => c.trim()).filter(Boolean),
      flag: bookingFlagKind(booking),
      hoursToCancel: hoursFromBookingToCancel(booking.createdAt, booking.cancelledAt),
      flagReviewedBy: staff?.name ?? null,
    },
    /** The itemized price (nights, date prices, discount, cleaning fee), adding up to the total. */
    lines,
    // The guest's own history lines name them (the actor): withheld like the guest.
    history: history.map((h) => ({ ...h, actor: guestWithheld && h.actor?.id === guest.id ? null : h.actor, details: record(h.details) })),
  };
}

export type AdminBookingDetail = NonNullable<Awaited<ReturnType<typeof getAdminBooking>>>;
