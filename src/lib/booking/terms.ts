/**
 * Which listings can be booked on the site, and the price terms of a booking (client-safe, pure).
 *
 * Hotels with room types: the guest picks a room type and pays its nightly price (in the room
 * type's currency); the whole listing is still booked as one unit for now (docs/redesign-2/PLAN.md).
 * The listing's weekend price does not apply to room types (a room type has its own), and its
 * cleaning fee only when the room type uses the listing's currency.
 *
 * Date prices (round 3, brief 6.3): a listing's own date prices (roomTypeId null) price the
 * listing's nights and every room type in the listing's currency; a room type's own date prices
 * come first for that room type. The long-stay discounts are the listing's, for every room type.
 */
import type { CurrencyCode } from "@/config/site";
import type { BookingMode, DealType, ListingStatus, PricePeriod } from "@/generated/prisma/enums";
import { isInstantDealType } from "./constants";
import type { BookingErrorCode } from "./errors";
import { cleanPriceLabel, type DatePriceTerm, type PricingTerms } from "./pricing";

type Money = number | { toString(): string } | null | undefined;

export function toNumber(value: Money): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

export type BookableRoomType = {
  id: string;
  names: unknown;
  price: Money;
  currency: CurrencyCode;
  pricePeriod: PricePeriod;
  maxGuests: number | null;
  /** Friday and Saturday nights of this room type (optional; the room's price otherwise). */
  weekendPrice?: Money;
};

/** A DatePrice row as plain values: `end` is EXCLUSIVE; roomTypeId null = the whole listing. */
export type BookableDatePrice = {
  roomTypeId: string | null;
  start: string;
  end: string;
  price: Money;
  minNights: number | null;
  /** { he, en, … } (any subset): the host's note. */
  label: unknown;
};

export type BookableListing = {
  status: ListingStatus;
  deletedAt: Date | null;
  dealType: DealType;
  bookingMode: BookingMode;
  price: Money;
  pricePeriod: PricePeriod;
  currency: CurrencyCode;
  weekendPrice: Money;
  cleaningFee: Money;
  minStayNights: number | null;
  maxGuests: number | null;
  roomTypes: BookableRoomType[];
  /** Date prices that may touch the stay (more is fine; any order). */
  datePrices?: BookableDatePrice[];
  weeklyDiscountPct?: number | null;
  monthlyDiscountPct?: number | null;
};

/**
 * Instant booking is on, the listing is live, and it is a short stay. Hotels are contact-only for
 * now (INSTANT_DEAL_TYPES), even when an older save left them INSTANT.
 */
export function isInstantBookable(listing: Pick<BookableListing, "status" | "deletedAt" | "dealType" | "bookingMode">): boolean {
  return (
    listing.status === "LIVE" &&
    listing.deletedAt === null &&
    listing.bookingMode === "INSTANT" &&
    isInstantDealType(listing.dealType)
  );
}

/** Room types that can be booked (priced per night). */
export function bookableRoomTypes(listing: Pick<BookableListing, "roomTypes">): BookableRoomType[] {
  return listing.roomTypes.filter((room) => room.pricePeriod === "NIGHT" && (toNumber(room.price) ?? 0) > 0);
}

function datePriceTerms(list: readonly BookableDatePrice[]): DatePriceTerm[] {
  return list.map((p) => ({ start: p.start, end: p.end, price: toNumber(p.price) ?? 0, minNights: p.minNights, label: cleanPriceLabel(p.label) ?? null }));
}

/**
 * The date prices of one price scope: a room type's own first (they win where both cover a night),
 * then the listing's own when they are in the same currency; or, without a room type, the listing's.
 */
export function datePricesFor(listing: Pick<BookableListing, "datePrices" | "currency">, room: Pick<BookableRoomType, "id" | "currency"> | null): DatePriceTerm[] {
  const all = listing.datePrices ?? [];
  const own = all.filter((p) => p.roomTypeId === null);
  if (!room) return datePriceTerms(own);
  return datePriceTerms([...all.filter((p) => p.roomTypeId === room.id), ...(room.currency === listing.currency ? own : [])]);
}

export type ResolvedTerms =
  | { ok: true; terms: PricingTerms; roomType: BookableRoomType | null }
  | { ok: false; error: BookingErrorCode };

/** The price terms for a stay at this listing (and room type, for hotels). */
export function resolveTerms(listing: BookableListing, roomTypeId: string | null | undefined): ResolvedTerms {
  const rooms = bookableRoomTypes(listing);
  const listingNightly = listing.pricePeriod === "NIGHT" ? toNumber(listing.price) : null;

  if (roomTypeId) {
    const room = rooms.find((r) => r.id === roomTypeId);
    if (!room) return { ok: false, error: "room_type_required" };
    return {
      ok: true,
      roomType: room,
      terms: {
        currency: room.currency,
        nightlyPrice: toNumber(room.price),
        weekendPrice: toNumber(room.weekendPrice ?? null),
        cleaningFee: room.currency === listing.currency ? toNumber(listing.cleaningFee) : null,
        minStayNights: listing.minStayNights,
        maxGuests: room.maxGuests ?? listing.maxGuests,
        datePrices: datePricesFor(listing, room),
        weeklyDiscountPct: listing.weeklyDiscountPct ?? null,
        monthlyDiscountPct: listing.monthlyDiscountPct ?? null,
      },
    };
  }
  // A hotel whose rooms carry the prices must say which room.
  if (rooms.length > 0 && !(listingNightly && listingNightly > 0)) return { ok: false, error: "room_type_required" };
  if (!(listingNightly && listingNightly > 0)) return { ok: false, error: "no_price" };
  return {
    ok: true,
    roomType: null,
    terms: {
      currency: listing.currency,
      nightlyPrice: listingNightly,
      weekendPrice: toNumber(listing.weekendPrice),
      cleaningFee: toNumber(listing.cleaningFee),
      minStayNights: listing.minStayNights,
      maxGuests: listing.maxGuests,
      datePrices: datePricesFor(listing, null),
      weeklyDiscountPct: listing.weeklyDiscountPct ?? null,
      monthlyDiscountPct: listing.monthlyDiscountPct ?? null,
    },
  };
}
