import "server-only";
import type { CurrencyCode } from "@/config/site";
import type { BookingMode, CancellationPolicy, DealType, ListingStatus, PricePeriod } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { cleanPaymentMethods, MAX_DAYS_AHEAD, MAX_STAY_NIGHTS, type PaymentMethod } from "./constants";
import { addDays, dateToDay, dayToDate, tbilisiToday } from "./dates";
import { bookableRoomTypes, isInstantBookable, toNumber, type BookableDatePrice } from "./terms";
import { roomQuantity } from "./room-availability";
import { alertEnvironment, hostAlertSelect, hostAlertTarget } from "@/lib/alerts/host";
import { hostAlertChannels, instantBookingGate, type AlertEnvironment } from "@/lib/alerts/rules";

/**
 * What the guest's review page ("אישור הזמנה") needs to price a stay in the browser exactly as
 * the server will (resolveTerms + quoteStay are pure): the listing's booking terms as plain values.
 * The server still re-checks everything inside the booking transaction.
 */
export type GuestRoomType = {
  id: string;
  /** Localized JSON ({ he, en, … }): read with pickLocalized. */
  names: unknown;
  price: number;
  currency: CurrencyCode;
  pricePeriod: PricePeriod;
  maxGuests: number | null;
  /** Friday and Saturday nights of this room type (null = its nightly price). */
  weekendPrice: number | null;
  /** "כמה חדרים כאלה להציע בבית": identical rooms of this type (hotels count free rooms from it). */
  quantity: number;
};

export type GuestBookingTerms = {
  id: string;
  status: ListingStatus;
  deletedAt: null;
  dealType: DealType;
  bookingMode: BookingMode;
  /**
   * Instant booking is on, the listing is live (isInstantBookable) and the host can be alerted
   * about the booking on a confirming channel (src/lib/alerts). Otherwise the page offers "Ask the host".
   */
  instant: boolean;
  price: number | null;
  pricePeriod: PricePeriod;
  currency: CurrencyCode;
  weekendPrice: number | null;
  cleaningFee: number | null;
  minStayNights: number | null;
  maxGuests: number | null;
  cancellationPolicy: CancellationPolicy;
  paymentMethods: PaymentMethod[];
  checkInFrom: string | null;
  checkOutUntil: string | null;
  /** "גמיש" (round 3): the review says "צ׳ק-אין גמיש" / "צ׳ק-אאוט גמיש". */
  checkInFlexible: boolean;
  checkOutFlexible: boolean;
  isDemo: boolean;
  /** Bookable room types (active, priced per night), in the host's order. */
  roomTypes: GuestRoomType[];
  /** Holiday prices from today on (round 3, brief 6.3), as the server prices the nights. */
  datePrices: (BookableDatePrice & { price: number })[];
  /** % off the nights for 7+ / 28+ nights. */
  weeklyDiscountPct: number | null;
  monthlyDiscountPct: number | null;
};

/** Enough for any listing: date prices never overlap within one listing or room type (./date-prices). */
const DATE_PRICE_LIMIT = 200;

export async function getGuestBookingTerms(
  listingId: string,
  opts: { alerts?: AlertEnvironment } = {},
): Promise<GuestBookingTerms | null> {
  const today = tbilisiToday();
  const row = await db.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      status: true,
      deletedAt: true,
      dealType: true,
      bookingMode: true,
      price: true,
      pricePeriod: true,
      currency: true,
      weekendPrice: true,
      cleaningFee: true,
      minStayNights: true,
      maxGuests: true,
      cancellationPolicy: true,
      paymentMethodsAtCheckIn: true,
      checkInFrom: true,
      checkOutUntil: true,
      checkInFlexible: true,
      checkOutFlexible: true,
      isDemo: true,
      owner: { select: hostAlertSelect },
      weeklyDiscountPct: true,
      monthlyDiscountPct: true,
      roomTypes: {
        select: { id: true, names: true, price: true, currency: true, pricePeriod: true, maxGuests: true, weekendPrice: true, quantity: true, active: true },
        orderBy: { sortOrder: "asc" },
      },
      // Every date price a stay that can still be booked may touch.
      datePrices: {
        where: { endDate: { gt: dayToDate(today) }, startDate: { lt: dayToDate(addDays(today, MAX_DAYS_AHEAD + MAX_STAY_NIGHTS)) } },
        orderBy: { startDate: "asc" },
        take: DATE_PRICE_LIMIT,
        select: { roomTypeId: true, startDate: true, endDate: true, price: true, minNights: true, label: true },
      },
    },
  });
  if (!row || row.deletedAt) return null;
  const rooms = bookableRoomTypes(row).map((room) => ({
    id: room.id,
    names: room.names,
    price: toNumber(room.price) ?? 0,
    currency: room.currency,
    pricePeriod: room.pricePeriod,
    maxGuests: room.maxGuests,
    weekendPrice: toNumber(room.weekendPrice ?? null),
    quantity: roomQuantity(room),
  }));
  return {
    id: row.id,
    status: row.status,
    deletedAt: null,
    dealType: row.dealType,
    bookingMode: row.bookingMode,
    instant: isInstantBookable(row) && instantBookingGate(hostAlertChannels(hostAlertTarget(row.owner), opts.alerts ?? alertEnvironment())).ok,
    price: toNumber(row.price),
    pricePeriod: row.pricePeriod,
    currency: row.currency,
    weekendPrice: toNumber(row.weekendPrice),
    cleaningFee: toNumber(row.cleaningFee),
    minStayNights: row.minStayNights,
    maxGuests: row.maxGuests,
    cancellationPolicy: row.cancellationPolicy,
    paymentMethods: cleanPaymentMethods(row.paymentMethodsAtCheckIn),
    checkInFrom: row.checkInFrom,
    checkOutUntil: row.checkOutUntil,
    checkInFlexible: row.checkInFlexible,
    checkOutFlexible: row.checkOutFlexible,
    isDemo: row.isDemo,
    roomTypes: rooms,
    datePrices: row.datePrices.map((p) => ({
      roomTypeId: p.roomTypeId,
      start: dateToDay(p.startDate),
      end: dateToDay(p.endDate),
      price: toNumber(p.price) ?? 0,
      minNights: p.minNights,
      label: p.label,
    })),
    weeklyDiscountPct: row.weeklyDiscountPct,
    monthlyDiscountPct: row.monthlyDiscountPct,
  };
}
