/**
 * Which listings can be booked on the site, and the price terms of a booking (client-safe, pure).
 *
 * Hotels with room types: the guest picks a room type and pays its nightly price (in the room
 * type's currency); the whole listing is still booked as one unit for now (docs/redesign-2/PLAN.md).
 * The listing's weekend price does not apply to room types, and its cleaning fee only when the
 * room type uses the listing's currency.
 */
import type { CurrencyCode } from "@/config/site";
import type { BookingMode, DealType, ListingStatus, PricePeriod } from "@/generated/prisma/enums";
import { isBookableDealType } from "./constants";
import type { BookingErrorCode } from "./errors";
import type { PricingTerms } from "./pricing";

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
};

/** Instant booking is on, the listing is live, and it is a short stay or a hotel. */
export function isInstantBookable(listing: Pick<BookableListing, "status" | "deletedAt" | "dealType" | "bookingMode">): boolean {
  return (
    listing.status === "LIVE" &&
    listing.deletedAt === null &&
    listing.bookingMode === "INSTANT" &&
    isBookableDealType(listing.dealType)
  );
}

/** Room types that can be booked (priced per night). */
export function bookableRoomTypes(listing: Pick<BookableListing, "roomTypes">): BookableRoomType[] {
  return listing.roomTypes.filter((room) => room.pricePeriod === "NIGHT" && (toNumber(room.price) ?? 0) > 0);
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
        weekendPrice: null,
        cleaningFee: room.currency === listing.currency ? toNumber(listing.cleaningFee) : null,
        minStayNights: listing.minStayNights,
        maxGuests: room.maxGuests ?? listing.maxGuests,
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
    },
  };
}
