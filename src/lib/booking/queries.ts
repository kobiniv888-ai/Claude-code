import "server-only";
import type { AppLocale, CurrencyCode } from "@/config/site";
import type { Prisma } from "@/generated/prisma/client";
import type { BookingStatus, CancellationPolicy, DealType } from "@/generated/prisma/enums";
import { pickLocalized } from "@/i18n/locale";
import { personName } from "@/lib/auth/first-name";
import { verifiedPhoneOf } from "@/lib/auth/phone-once";
import { db } from "@/lib/db";
import { taintObject } from "@/lib/security/taint";
import { listingSlugParam } from "@/lib/listing/urls";
import { photoUrl } from "@/lib/media";
import { normalizeBookingCode } from "./code";
import { bookingIcsPath, hostBookingPath, tripPath } from "./constants";
import { dateToDay } from "./dates";
import {
  canGuestCancel,
  canHostCancel,
  canReportNoShow,
  canRevealHostContact,
  freeCancellationDeadline,
  isLateCancellation,
  isUpcoming,
} from "./policy";
import { bookingPriceLines } from "./price-lines";
import type { PriceLine } from "./pricing";
import { directionsFor, hostContactFor, type Directions, type HostContact } from "./reveal";
import { toNumber } from "./terms";

/**
 * Bookings for "הנסיעות שלי" (the guest) and "הזמנות לנכסים שלי" (the host), with the reveal
 * rules applied: the exact address and the host's phone / WhatsApp only reach the guest of a
 * CONFIRMED or COMPLETED booking; the guest's name and verified phone reach the host of the
 * booking. Every function takes the signed-in user's id and only returns that user's bookings.
 */

const summarySelect = {
  id: true,
  code: true,
  status: true,
  checkIn: true,
  checkOut: true,
  nights: true,
  adults: true,
  children: true,
  infants: true,
  total: true,
  currency: true,
  displayCurrency: true,
  displayTotal: true,
  roomTypeName: true,
  rooms: true,
  cancellationPolicy: true,
  createdAt: true,
  cancelledAt: true,
  guestUserId: true,
  guestName: true,
  flaggedForReview: true,
  listing: {
    select: {
      id: true,
      publicId: true,
      title: true,
      dealType: true,
      checkInFrom: true,
      translations: { select: { locale: true, title: true } },
      photos: { orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }], take: 1, select: { url: true, storageKey: true } },
    },
  },
} satisfies Prisma.BookingSelect;

type SummaryRow = Prisma.BookingGetPayload<{ select: typeof summarySelect }>;

/** The copied prices of a booking, for its itemized lines (round 3, brief 6.3). */
const priceSelect = {
  nightlyPrice: true,
  weekendPrice: true,
  subtotal: true,
  cleaningFee: true,
  discount: true,
  rooms: true,
  priceLines: true,
} satisfies Prisma.BookingSelect;

type PriceRow = Prisma.BookingGetPayload<{ select: typeof priceSelect }> & Pick<SummaryRow, "checkIn" | "checkOut" | "nights" | "total">;

/**
 * The lines the guest saw before confirming ("₾55 × 3 לילות", "הנחה לשבוע −10%", "דמי ניקיון"),
 * in the booking's currency: Booking.priceLines, or rebuilt from the copied prices for bookings
 * made before round 3, phase 4.
 */
function priceLinesOf(row: PriceRow): PriceLine[] {
  return bookingPriceLines({
    checkIn: dateToDay(row.checkIn),
    checkOut: dateToDay(row.checkOut),
    nights: row.nights,
    nightlyPrice: toNumber(row.nightlyPrice) ?? 0,
    weekendPrice: toNumber(row.weekendPrice),
    subtotal: toNumber(row.subtotal) ?? 0,
    cleaningFee: toNumber(row.cleaningFee) ?? 0,
    discount: toNumber(row.discount),
    total: toNumber(row.total) ?? 0,
    rooms: row.rooms,
    priceLines: row.priceLines,
  });
}

export type BookingSummary = {
  id: string;
  code: string;
  status: BookingStatus;
  /** "YYYY-MM-DD" (Georgia). */
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  infants: number;
  /** In the host's currency, paid at check-in. */
  total: number;
  currency: CurrencyCode;
  /** The guest's estimate when booked (null when it was the host's currency). */
  display: { currency: CurrencyCode; total: number } | null;
  roomTypeName: string | null;
  /** Hotels: rooms of the room type in this booking (1 otherwise). */
  rooms: number;
  cancellationPolicy: CancellationPolicy;
  createdAt: Date;
  cancelledAt: Date | null;
  upcoming: boolean;
  listing: {
    id: string;
    publicId: number;
    /** In the viewer's language when translated; render with dir="auto". */
    title: string;
    dealType: DealType;
    /** "/listing/1234-slug" (use with Link from @/i18n/navigation). */
    path: string;
    photo: string | null;
  };
};

function titleIn(row: SummaryRow, locale: AppLocale): string {
  return row.listing.translations.find((t) => t.locale === locale)?.title?.trim() || row.listing.title;
}

function toSummary(row: SummaryRow, locale: AppLocale, now: Date): BookingSummary {
  const checkIn = dateToDay(row.checkIn);
  const checkOut = dateToDay(row.checkOut);
  const displayTotal = toNumber(row.displayTotal);
  const title = titleIn(row, locale);
  const photo = row.listing.photos[0];
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    checkIn,
    checkOut,
    nights: row.nights,
    adults: row.adults,
    children: row.children,
    infants: row.infants,
    total: toNumber(row.total) ?? 0,
    currency: row.currency,
    display: row.displayCurrency && displayTotal !== null ? { currency: row.displayCurrency, total: displayTotal } : null,
    roomTypeName: row.roomTypeName ? pickLocalized(row.roomTypeName, locale) || null : null,
    rooms: row.rooms,
    cancellationPolicy: row.cancellationPolicy,
    createdAt: row.createdAt,
    cancelledAt: row.cancelledAt,
    upcoming: isUpcoming({ status: row.status, checkIn, checkOut }, now),
    listing: {
      id: row.listing.id,
      publicId: row.listing.publicId,
      title,
      dealType: row.listing.dealType,
      path: `/listing/${listingSlugParam(row.listing.publicId, title)}`,
      photo: photo ? photoUrl(photo, "sm") : null,
    },
  };
}

const LIST_LIMIT = 200;

// ─── Guest ────────────────────────────────────────────────────

/**
 * "הנסיעות שלי": upcoming (confirmed, not yet checked out — soonest first) and past
 * (completed, cancelled, no-show — latest first).
 */
export async function getGuestTrips(
  guestUserId: string,
  locale: AppLocale,
  now: Date = new Date(),
): Promise<{ upcoming: BookingSummary[]; past: BookingSummary[] }> {
  const rows = await db.booking.findMany({
    where: { guestUserId },
    select: summarySelect,
    orderBy: { checkIn: "desc" },
    take: LIST_LIMIT,
  });
  const all = rows.map((row) => toSummary(row, locale, now));
  return {
    upcoming: all.filter((b) => b.upcoming).sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    past: all.filter((b) => !b.upcoming),
  };
}

export type CancellationInfo = {
  policy: CancellationPolicy;
  /** End of free cancellation (the check-in time minus the policy's hours). */
  freeUntil: Date;
  /** Cancelling now would be "late" (recorded, never charged). */
  lateNow: boolean;
};

export type GuestTrip = BookingSummary & {
  /** The itemized price, in `currency` (adds up to `total`). */
  priceLines: PriceLine[];
  messageToHost: string | null;
  paymentMethods: string[];
  cancelReasonCode: string | null;
  cancelReason: string | null;
  cancellation: CancellationInfo;
  canCancel: boolean;
  checkInFrom: string | null;
  checkOutUntil: string | null;
  /** "גמיש" (round 3): "צ׳ק-אין גמיש" / "צ׳ק-אאוט גמיש" on the trip page and the calendar file. */
  checkInFlexible: boolean;
  checkOutFlexible: boolean;
  /** Shown only to the guest of a confirmed or completed booking; null otherwise. */
  reveal: {
    address: string | null;
    lat: number | null;
    lng: number | null;
    directions: Directions | null;
    hostName: string | null;
    contact: HostContact;
  } | null;
  /** "/api/ical/booking/BT-…" — the "add to calendar" file (confirmed bookings). */
  icsPath: string | null;
  path: string;
};

/** One trip of the signed-in guest, by booking code ("BT-7K3Q9"); null when not theirs. */
export async function getGuestTrip(
  guestUserId: string,
  codeInput: string,
  locale: AppLocale,
  now: Date = new Date(),
): Promise<GuestTrip | null> {
  const code = normalizeBookingCode(codeInput);
  if (!code) return null;
  const row = await db.booking.findFirst({
    where: { code, guestUserId },
    select: {
      ...summarySelect,
      ...priceSelect,
      messageToHost: true,
      paymentMethods: true,
      cancelReasonCode: true,
      cancelReason: true,
      listing: {
        select: {
          ...summarySelect.listing.select,
          checkOutUntil: true,
          checkInFlexible: true,
          checkOutFlexible: true,
          address: true,
          lat: true,
          lng: true,
          contactMethods: true,
          owner: { select: { name: true, firstName: true, phoneNumber: true, phoneNumberVerified: true } },
        },
      },
    },
  });
  if (!row) return null;
  // The raw row holds the exact address, pin and the host's phone: only the shaped trip below may
  // reach the page (React taint, SECURITY_REPORT 5.k).
  taintObject("raw booking row", row);
  taintObject("raw listing row (exact address)", row.listing);
  const summary = toSummary(row, locale, now);
  const reveal = canRevealHostContact(row, guestUserId, now)
    ? {
        address: row.listing.address,
        lat: row.listing.lat,
        lng: row.listing.lng,
        directions: directionsFor(row.listing.lat, row.listing.lng),
        hostName: personName(row.listing.owner),
        contact: hostContactFor(row.listing.contactMethods, verifiedPhoneOf(row.listing.owner)),
      }
    : null;
  const state = { status: row.status, checkIn: summary.checkIn, checkOut: summary.checkOut };
  return {
    ...summary,
    priceLines: priceLinesOf(row),
    messageToHost: row.messageToHost,
    paymentMethods: row.paymentMethods,
    cancelReasonCode: row.cancelReasonCode,
    cancelReason: row.cancelReason,
    cancellation: {
      policy: row.cancellationPolicy,
      freeUntil: freeCancellationDeadline(row.cancellationPolicy, summary.checkIn, row.listing.checkInFrom),
      lateNow: isLateCancellation(row.cancellationPolicy, summary.checkIn, now, row.listing.checkInFrom),
    },
    canCancel: canGuestCancel(state, now),
    checkInFrom: row.listing.checkInFrom,
    checkOutUntil: row.listing.checkOutUntil,
    checkInFlexible: row.listing.checkInFlexible,
    checkOutFlexible: row.listing.checkOutFlexible,
    reveal,
    icsPath: row.status === "CONFIRMED" ? bookingIcsPath(row.code) : null,
    path: tripPath(row.code),
  };
}

// ─── Host ─────────────────────────────────────────────────────

export type HostBookingSummary = BookingSummary & {
  guestName: string;
  /** Host cancellation within 48 hours of the booking (shown to staff; hosts see nothing special). */
  flaggedForReview: boolean;
  path: string;
};

/**
 * "הזמנות לנכסים שלי": the host's bookings, optionally for one listing. `scope` "upcoming" =
 * confirmed and not yet checked out (soonest first); "past" = the rest (latest first).
 */
export async function getHostBookings(
  hostUserId: string,
  locale: AppLocale,
  options: { listingId?: string; scope?: "upcoming" | "past" | "all"; now?: Date } = {},
): Promise<HostBookingSummary[]> {
  const now = options.now ?? new Date();
  const rows = await db.booking.findMany({
    where: { hostUserId, ...(options.listingId ? { listingId: options.listingId } : {}) },
    select: summarySelect,
    orderBy: { checkIn: "desc" },
    take: LIST_LIMIT,
  });
  const list = rows.map((row) => ({
    ...toSummary(row, locale, now),
    guestName: row.guestName,
    flaggedForReview: row.flaggedForReview,
    path: hostBookingPath(row.code),
  }));
  const scope = options.scope ?? "all";
  if (scope === "upcoming") {
    return list.filter((b) => b.upcoming).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  }
  if (scope === "past") return list.filter((b) => !b.upcoming);
  // "all": upcoming first (soonest first), then the rest.
  return [
    ...list.filter((b) => b.upcoming).sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    ...list.filter((b) => !b.upcoming),
  ];
}

export type HostBooking = HostBookingSummary & {
  /** The itemized price the guest confirmed, in `currency` (adds up to `total`). */
  priceLines: PriceLine[];
  /** E.164, verified when booked: call / WhatsApp the guest. */
  guestPhone: string;
  messageToHost: string | null;
  paymentMethods: string[];
  cancelReasonCode: string | null;
  cancelReason: string | null;
  noShowReportedAt: Date | null;
  cancellation: CancellationInfo;
  canCancel: boolean;
  canReportNoShow: boolean;
};

/** One booking of the signed-in host, by code; null when not theirs. */
export async function getHostBooking(
  hostUserId: string,
  codeInput: string,
  locale: AppLocale,
  now: Date = new Date(),
): Promise<HostBooking | null> {
  const code = normalizeBookingCode(codeInput);
  if (!code) return null;
  const row = await db.booking.findFirst({
    where: { code, hostUserId },
    select: {
      ...summarySelect,
      ...priceSelect,
      guestPhone: true,
      messageToHost: true,
      paymentMethods: true,
      cancelReasonCode: true,
      cancelReason: true,
      noShowReportedAt: true,
      review: { select: { id: true } },
    },
  });
  if (!row) return null;
  const summary = toSummary(row, locale, now);
  const state = { status: row.status, checkIn: summary.checkIn, checkOut: summary.checkOut };
  return {
    ...summary,
    guestName: row.guestName,
    flaggedForReview: row.flaggedForReview,
    path: hostBookingPath(row.code),
    priceLines: priceLinesOf(row),
    guestPhone: row.guestPhone,
    messageToHost: row.messageToHost,
    paymentMethods: row.paymentMethods,
    cancelReasonCode: row.cancelReasonCode,
    cancelReason: row.cancelReason,
    noShowReportedAt: row.noShowReportedAt,
    cancellation: {
      policy: row.cancellationPolicy,
      freeUntil: freeCancellationDeadline(row.cancellationPolicy, summary.checkIn, row.listing.checkInFrom),
      lateNow: isLateCancellation(row.cancellationPolicy, summary.checkIn, now, row.listing.checkInFrom),
    },
    canCancel: canHostCancel(state, now),
    // Never once the guest reviewed the stay (markNoShow refuses too: "no_show_reviewed").
    canReportNoShow: !row.review && canReportNoShow(state, now),
  };
}

/** Does this host have bookings at all (to show "הזמנות לנכסים שלי" in the account menu)? */
export async function hostHasBookings(hostUserId: string): Promise<boolean> {
  return (await db.booking.findFirst({ where: { hostUserId }, select: { id: true } })) !== null;
}
