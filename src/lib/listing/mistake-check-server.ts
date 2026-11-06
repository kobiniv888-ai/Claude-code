import "server-only";
import type { AppLocale, CurrencyCode } from "@/config/site";
import type { Prisma } from "@/generated/prisma/client";
import { isAppLocale, pickLocalized } from "@/i18n/locale";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { getPriceGuide } from "@/lib/pricing/guide-server";
import { pricePosition, type GuideInput } from "@/lib/pricing/guide";
import { checkListingMistakes, type MistakeInput, type MistakePricePosition, type MistakeResult } from "./mistake-check";

/**
 * The mistake check of a saved listing (round 3, brief 6.1): loads the listing, its photos and room
 * types, asks the price guide where its price sits, and runs ./mistake-check.ts.
 *
 *   const { errors, warnings } = await getListingMistakes(listing.id);
 *
 * Used by the publish action and "Save changes" (they refuse while `errors` is not empty), by the
 * host's "בדיקה לפני פרסום" panel (./mistake-check-actions.ts, owner only) and by the admin review
 * page. Hosts' tools only: never shown to guests. The price guide is advisory: when it fails the
 * check runs without it (no price warning), it never blocks publishing.
 */

const MISTAKE_SELECT = {
  id: true,
  ownerId: true,
  countryCode: true,
  dealType: true,
  propertyType: true,
  originalLocale: true,
  title: true,
  description: true,
  address: true,
  lat: true,
  lng: true,
  cityId: true,
  neighborhoodId: true,
  city: { select: { slug: true, lat: true, lng: true } },
  currency: true,
  price: true,
  pricePeriod: true,
  maxGuests: true,
  bedrooms: true,
  bathrooms: true,
  bedsSingle: true,
  bedsDouble: true,
  bedsSofa: true,
  sizeSqm: true,
  amenities: true,
  views: true,
  buildingAge: true,
  checkInFrom: true,
  checkOutUntil: true,
  checkInFlexible: true,
  checkOutFlexible: true,
  photos: { select: { room: true, roomTypeId: true } },
  roomTypes: {
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      names: true,
      price: true,
      currency: true,
      pricePeriod: true,
      maxGuests: true,
      bedsSingle: true,
      bedsDouble: true,
      bedsSofa: true,
      active: true,
    },
  },
} satisfies Prisma.ListingSelect;

type MistakeRow = Prisma.ListingGetPayload<{ select: typeof MISTAKE_SELECT }>;

/** The unit each deal type is priced in, as the price guide compares it. */
const GUIDE_PERIOD: Record<MistakeRow["dealType"], MistakeRow["pricePeriod"]> = {
  SHORT_STAY: "NIGHT",
  HOTEL_ROOM: "NIGHT",
  MONTHLY_RENT: "MONTH",
  SALE: "TOTAL",
};

const num = (value: Prisma.Decimal | number | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value);

function guideInput(row: MistakeRow, roomTypeId: string | null): GuideInput {
  return {
    listingId: row.id,
    excludeOwnerId: row.ownerId,
    countryCode: row.countryCode,
    cityId: row.cityId!,
    neighborhoodId: row.neighborhoodId,
    dealType: row.dealType,
    propertyType: row.propertyType,
    bedrooms: row.bedrooms,
    bathrooms: num(row.bathrooms),
    hasKitchen: row.amenities.includes("full_kitchen") ? true : null,
    seaView: row.views.includes("SEA") ? true : null,
    newBuilding: row.buildingAge === null ? null : row.buildingAge === "NEW",
    sizeSqm: row.sizeSqm,
    roomTypeId,
    displayCurrency: row.currency as CurrencyCode,
  };
}

/** Where a price sits in the price guide (null: no price, a period the guide doesn't compare, too little data, or the guide failed). */
async function positionOf(
  row: MistakeRow,
  price: number | null,
  period: MistakeRow["pricePeriod"],
  currency: CurrencyCode,
  roomTypeId: string | null,
): Promise<MistakePricePosition | null> {
  if (!row.cityId || price === null || price <= 0 || period !== GUIDE_PERIOD[row.dealType]) return null;
  try {
    const guide = await getPriceGuide(guideInput(row, roomTypeId));
    return pricePosition(guide, price, currency);
  } catch (error) {
    console.error(`[mistake-check] price guide for ${row.id} failed, checked without it:`, error);
    return null;
  }
}

/** The pure checker's input for a loaded listing (exported for tests). */
export function toMistakeInput(
  row: MistakeRow,
  positions: { listing: MistakePricePosition | null; rooms: Map<string, MistakePricePosition | null> },
): MistakeInput {
  const locale: AppLocale = isAppLocale(row.originalLocale) ? row.originalLocale : "he";
  return {
    dealType: row.dealType,
    propertyType: row.propertyType,
    originalLocale: locale,
    title: row.title,
    description: row.description,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    city: row.city ? { slug: row.city.slug, lat: row.city.lat, lng: row.city.lng } : null,
    currency: row.currency as CurrencyCode,
    maxGuests: row.maxGuests,
    bedsSingle: row.bedsSingle,
    bedsDouble: row.bedsDouble,
    bedsSofa: row.bedsSofa,
    bathrooms: num(row.bathrooms),
    checkInFrom: row.checkInFrom,
    checkOutUntil: row.checkOutUntil,
    checkInFlexible: row.checkInFlexible,
    checkOutFlexible: row.checkOutFlexible,
    photos: row.photos.map((p) => ({ room: p.room, roomTypeId: p.roomTypeId })),
    // Room types the hotel no longer offers are not checked.
    roomTypes: row.roomTypes
      .filter((room) => room.active)
      .map((room) => ({
        id: room.id,
        name: pickLocalized(room.names, locale) || "",
        maxGuests: room.maxGuests,
        bedsSingle: room.bedsSingle,
        bedsDouble: room.bedsDouble,
        bedsSofa: room.bedsSofa,
        currency: room.currency as CurrencyCode,
        pricePosition: positions.rooms.get(room.id) ?? null,
      })),
    pricePosition: positions.listing,
  };
}

/** The mistake check of a listing as it is saved now. Throws NotFoundError for an unknown id. */
export async function getListingMistakes(listingId: string): Promise<MistakeResult> {
  const row = await db.listing.findUnique({ where: { id: listingId }, select: MISTAKE_SELECT });
  if (!row) throw new NotFoundError();
  const isHotel = row.dealType === "HOTEL_ROOM";
  const [listing, ...rooms] = await Promise.all([
    // Hotels are compared per room type (their own "from" price is the cheapest room).
    isHotel ? Promise.resolve(null) : positionOf(row, num(row.price), row.pricePeriod, row.currency as CurrencyCode, null),
    ...(isHotel
      ? row.roomTypes
          .filter((room) => room.active)
          .map((room) => positionOf(row, num(room.price), room.pricePeriod, room.currency as CurrencyCode, room.id))
      : []),
  ]);
  const activeRooms = isHotel ? row.roomTypes.filter((room) => room.active) : [];
  const positions = { listing, rooms: new Map(activeRooms.map((room, i) => [room.id, rooms[i] ?? null])) };
  return checkListingMistakes(toMistakeInput(row, positions));
}
