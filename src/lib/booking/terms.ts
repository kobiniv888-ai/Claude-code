/**
 * Which listings can be booked on the site, and the price terms of a booking (client-safe, pure).
 *
 * Hotels (round 3, founder's answer 3): the guest picks a room type and how many rooms of it, and
 * pays its nightly price (in the room type's currency) for every room; a booking holds those rooms
 * only (./room-availability). A hotel must have an ACTIVE room type with a nightly price to take
 * instant bookings, and a hotel booking always names a room type. Guests per booking: up to the
 * room type's maximum × rooms. The listing's weekend price does not apply to room types (a room
 * type has its own), and its cleaning fee (per room) only when the room type uses the listing's
 * currency.
 *
 * Date prices (round 3, brief 6.3): a listing's own date prices (roomTypeId null) price the
 * listing's nights and every room type in the listing's currency; a room type's own date prices
 * come first for that room type. The long-stay discounts are the listing's, for every room type.
 */
import type { CurrencyCode } from "@/config/site";
import type { BookingMode, DealType, ListingStatus, PricePeriod } from "@/generated/prisma/enums";
import { isInstantDealType, MAX_ROOMS_PER_BOOKING, usesRoomInventory } from "./constants";
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
  /** "כמה חדרים כאלה להציע בבית": identical rooms of this type (default 1). */
  quantity?: number | null;
  /** false = switched off by the host: not offered to new guests (default true). */
  active?: boolean | null;
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

type RoomTypeOffer = Pick<BookableRoomType, "pricePeriod" | "price" | "active">;

/** A room type guests can book: switched on and priced per night. */
export function isBookableRoomType(room: RoomTypeOffer): boolean {
  return room.active !== false && room.pricePeriod === "NIGHT" && (toNumber(room.price) ?? 0) > 0;
}

/** Room types that can be booked (active, priced per night), in the host's order. */
export function bookableRoomTypes<T extends RoomTypeOffer>(listing: { roomTypes: readonly T[] }): T[] {
  return listing.roomTypes.filter(isBookableRoomType);
}

/**
 * Instant booking is on, the listing is live, and it is a short stay or a hotel. A hotel needs at
 * least one active room type with a nightly price (founder's answer 3): without `roomTypes`, or
 * with none bookable, it stays contact-only even when saved as INSTANT.
 */
export function isInstantBookable(
  listing: Pick<BookableListing, "status" | "deletedAt" | "dealType" | "bookingMode"> & { roomTypes?: readonly RoomTypeOffer[] },
): boolean {
  return (
    listing.status === "LIVE" &&
    listing.deletedAt === null &&
    listing.bookingMode === "INSTANT" &&
    isInstantDealType(listing.dealType) &&
    (!usesRoomInventory(listing.dealType) || bookableRoomTypes({ roomTypes: listing.roomTypes ?? [] }).length > 0)
  );
}

/** Rooms in one booking: 1 for listings booked as a whole; 1–MAX_ROOMS_PER_BOOKING for hotels. */
export function roomsFor(dealType: DealType | string, rooms: number | null | undefined): number {
  if (!usesRoomInventory(dealType)) return 1;
  const n = typeof rooms === "number" && Number.isInteger(rooms) ? rooms : 1;
  return Math.min(MAX_ROOMS_PER_BOOKING, Math.max(1, n));
}

/** The room type's maximum guests for `rooms` rooms (null = no limit set). */
export function roomGuestLimit(maxGuests: number | null | undefined, rooms: number): number | null {
  return typeof maxGuests === "number" && maxGuests > 0 ? maxGuests * Math.max(1, rooms) : null;
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

/**
 * The price terms for a stay at this listing (and room type, for hotels). `rooms`: hotels only,
 * how many rooms of the room type (1–MAX_ROOMS_PER_BOOKING); every other listing books 1.
 */
export function resolveTerms(listing: BookableListing, roomTypeId: string | null | undefined, rooms?: number | null): ResolvedTerms {
  const offered = bookableRoomTypes(listing);
  const listingNightly = listing.pricePeriod === "NIGHT" ? toNumber(listing.price) : null;
  const count = roomsFor(listing.dealType, rooms);

  if (roomTypeId) {
    const room = offered.find((r) => r.id === roomTypeId);
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
        maxGuests: roomGuestLimit(room.maxGuests ?? listing.maxGuests, count),
        datePrices: datePricesFor(listing, room),
        weeklyDiscountPct: listing.weeklyDiscountPct ?? null,
        monthlyDiscountPct: listing.monthlyDiscountPct ?? null,
        rooms: count,
      },
    };
  }
  // A hotel is always booked by room type (one booking never holds the whole hotel); other
  // listings whose rooms carry the prices must say which room too.
  if (usesRoomInventory(listing.dealType)) return { ok: false, error: "room_type_required" };
  if (offered.length > 0 && !(listingNightly && listingNightly > 0)) return { ok: false, error: "room_type_required" };
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
