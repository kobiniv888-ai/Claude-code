import "server-only";
import type { CurrencyCode } from "@/config/site";
import type { BookingMode, CancellationPolicy, DealType, ListingStatus, PricePeriod } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { cleanPaymentMethods, type PaymentMethod } from "./constants";
import { bookableRoomTypes, isInstantBookable, toNumber } from "./terms";
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
  isDemo: boolean;
  /** Bookable room types (priced per night), in the host's order. */
  roomTypes: GuestRoomType[];
};

export async function getGuestBookingTerms(
  listingId: string,
  opts: { alerts?: AlertEnvironment } = {},
): Promise<GuestBookingTerms | null> {
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
      isDemo: true,
      owner: { select: hostAlertSelect },
      roomTypes: {
        select: { id: true, names: true, price: true, currency: true, pricePeriod: true, maxGuests: true },
        orderBy: { sortOrder: "asc" },
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
    isDemo: row.isDemo,
    roomTypes: rooms,
  };
}
