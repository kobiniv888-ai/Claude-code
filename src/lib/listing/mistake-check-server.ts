import "server-only";
import type { AppLocale, CurrencyCode } from "@/config/site";
import type { Prisma } from "@/generated/prisma/client";
import { isAppLocale, pickLocalized } from "@/i18n/locale";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { getPriceGuide, getRoomTypePriceGuides } from "@/lib/pricing/guide-server";
import { pricePosition, type GuideInput } from "@/lib/pricing/guide";
import { checkListingMistakes, type MistakeInput, type MistakeIssue, type MistakePricePosition, type MistakeResult } from "./mistake-check";
import { visiblePhotos } from "./mistake-errors";
import { localizedValues } from "./mistake-gate-server";

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
 *
 * Every path that puts a listing on the site (publish, unpause, renew, approve, restore) refuses
 * while there are errors: `assertNoListingMistakes` (./mistake-gate-server.ts: errors only, no
 * price guide), inside the status change's transaction.
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
  // Hand-written language versions are shown as written (machine ones come from the original).
  translations: { where: { editedByOwner: true }, select: { locale: true, title: true, description: true } },
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
      sizeSqm: true,
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

/** A price the guide can place (one in the unit it compares). */
function comparable(row: MistakeRow, price: number | null, period: MistakeRow["pricePeriod"]): price is number {
  return !!row.cityId && price !== null && price > 0 && period === GUIDE_PERIOD[row.dealType];
}

/** Where a price sits in the price guide (null: no price, a period the guide doesn't compare, too little data, or the guide failed). */
async function positionOf(
  row: MistakeRow,
  price: number | null,
  period: MistakeRow["pricePeriod"],
  currency: CurrencyCode,
): Promise<MistakePricePosition | null> {
  if (!comparable(row, price, period)) return null;
  try {
    const guide = await getPriceGuide(guideInput(row, null));
    return pricePosition(guide, price, currency);
  } catch (error) {
    console.error(`[mistake-check] price guide for ${row.id} failed, checked without it:`, error);
    return null;
  }
}

/** Where each offered room type's price sits (the guide's data is loaded once for the hotel). */
async function roomPositions(row: MistakeRow): Promise<Map<string, MistakePricePosition | null>> {
  const rooms = row.roomTypes.filter((room) => room.active && comparable(row, num(room.price), room.pricePeriod));
  if (rooms.length === 0) return new Map();
  try {
    const guides = await getRoomTypePriceGuides(guideInput(row, null), rooms);
    return new Map(
      rooms.map((room) => {
        const guide = guides.get(room.id);
        return [room.id, guide ? pricePosition(guide, num(room.price)!, room.currency as CurrencyCode) : null];
      }),
    );
  } catch (error) {
    console.error(`[mistake-check] price guide for ${row.id}'s room types failed, checked without it:`, error);
    return new Map();
  }
}

/** The pure checker's input for a loaded listing (exported for tests). */
export function toMistakeInput(
  row: MistakeRow,
  positions: { listing: MistakePricePosition | null; rooms: Map<string, MistakePricePosition | null> },
): MistakeInput {
  const locale: AppLocale = isAppLocale(row.originalLocale) ? row.originalLocale : "he";
  // Guests see the main photos and those of the room types the hotel offers: a switched-off
  // room type's photos don't count towards the minimum.
  const offered = new Set(row.roomTypes.filter((room) => room.active).map((room) => room.id));
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
    photos: visiblePhotos(row.photos, offered).map((p) => ({ room: p.room, roomTypeId: p.roomTypeId })),
    translations: row.translations
      .filter((t) => t.locale !== row.originalLocale)
      .map((t) => ({ locale: t.locale, title: t.title, description: t.description })),
    // Room types the hotel no longer offers are not checked.
    roomTypes: row.roomTypes
      .filter((room) => room.active)
      .map((room) => ({
        id: room.id,
        name: pickLocalized(room.names, locale) || "",
        names: localizedValues(room.names),
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

type MistakeClient = Pick<typeof db, "listing">;

async function loadRow(listingId: string, client: MistakeClient = db): Promise<MistakeRow> {
  const row = await client.listing.findUnique({ where: { id: listingId }, select: MISTAKE_SELECT });
  if (!row) throw new NotFoundError();
  return row;
}

/**
 * The mistake check of a listing as it is saved now. Throws NotFoundError for an unknown id.
 * `priceGuide: false` skips the price guide (only its warnings depend on it, never an error).
 */
export async function getListingMistakes(listingId: string, options: { priceGuide?: boolean } = {}): Promise<MistakeResult> {
  const row = await loadRow(listingId);
  const noPositions = { listing: null, rooms: new Map<string, MistakePricePosition | null>() };
  if (options.priceGuide === false) return checkListingMistakes(toMistakeInput(row, noPositions));
  const isHotel = row.dealType === "HOTEL_ROOM";
  // Hotels are compared per room type (their own "from" price is the cheapest room).
  const [listing, rooms] = await Promise.all([
    isHotel ? Promise.resolve(null) : positionOf(row, num(row.price), row.pricePeriod, row.currency as CurrencyCode),
    isHotel ? roomPositions(row) : Promise.resolve(new Map<string, MistakePricePosition | null>()),
  ]);
  return checkListingMistakes(toMistakeInput(row, { listing, rooms }));
}

/** The errors that block publishing (no price guide). `client`: a transaction's client, to check under its lock. */
export async function listingMistakeErrors(listingId: string, client: MistakeClient = db): Promise<MistakeIssue[]> {
  const row = await loadRow(listingId, client);
  return checkListingMistakes(toMistakeInput(row, { listing: null, rooms: new Map() })).errors;
}

export { assertNoListingMistakes, ListingMistakesError } from "./mistake-gate-server";
