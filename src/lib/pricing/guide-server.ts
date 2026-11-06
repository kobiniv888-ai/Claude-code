import "server-only";
import type { AppLocale, CurrencyCode } from "@/config/site";
import type { DealType, PricePeriod, PropertyType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { pickLocalized } from "@/i18n/locale";
import { db } from "@/lib/db";
import { getRates } from "@/lib/currency";
import { convert, isCurrencyCode, type Rates } from "@/lib/currency/convert";
import {
  computeGuide,
  guideAsked,
  GUIDE_UNIT_BY_DEAL,
  guideWidening,
  guidePeriodFor,
  roomSleeps,
  roundGuide,
  type GuideCandidate,
  type GuideInput,
  type GuideQuery,
  type GuideReference,
  type GuideResult,
  type GuideWidening,
} from "./guide";
import { isStaleReference, matchReferencePrices, referenceMonth } from "./reference";

/**
 * The price guide's data access (round 3, brief 5). Server-only; the math and the privacy rules
 * are in ./guide.ts.
 *
 *   const guide = await getPriceGuide({ excludeOwnerId: user.id, cityId, dealType, propertyType,
 *     bedrooms, displayCurrency: "GEL" });
 *
 * Numbers come only from LIVE, non-demo listings of OTHER owners (never `excludeOwnerId`'s, never
 * `listingId`), priced in the unit their deal type compares (per night, per month, full price).
 * Hotels compare room types (their price and weekend price, what their beds sleep, their size).
 * Prices are converted to `displayCurrency` with today's rates. Reference prices (active, not
 * older than 24 months) come separately, converted too.
 *
 * HOSTS' TOOL ONLY: callers check the session (and ownership of `listingId`) and rate-limit
 * (./actions.ts, the "מדריך מחירים" page, the mistake check). Never call it for a guest.
 */

/** At most this many places are read per guide (newest first): plenty for one city and type. */
const MAX_CANDIDATES = 5000;
/** Reference ranges shown with a guide. */
const MAX_REFERENCES = 3;
/** Room types compared per hotel on the listing's guide. */
const MAX_ROOM_TYPES = 20;

type GuideData = {
  rates: Rates;
  candidates: GuideCandidate[];
  references: GuideReference[];
};

const num = (value: Prisma.Decimal | number | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value);

/** An amount in `from` → the guide's currency; null for an unknown currency or no amount. */
function toDisplay(amount: number | null, from: string, to: CurrencyCode, rates: Rates): { value: number; converted: boolean } | null {
  if (amount === null || !Number.isFinite(amount) || amount <= 0 || !isCurrencyCode(from)) return null;
  return from === to ? { value: amount, converted: false } : { value: convert(amount, from, to, rates), converted: true };
}

/** LIVE, non-demo listings of other owners in the same city, deal type and property type. */
function othersWhere(input: GuideInput): Prisma.ListingWhereInput {
  return {
    status: "LIVE",
    isDemo: false,
    deletedAt: null,
    cityId: input.cityId,
    dealType: input.dealType,
    propertyType: input.propertyType,
    ownerId: { not: input.excludeOwnerId },
    owner: { isDemo: false },
    ...(input.listingId ? { id: { not: input.listingId } } : {}),
    ...(input.countryCode ? { countryCode: input.countryCode } : {}),
  };
}

async function loadCandidates(input: GuideInput, rates: Rates): Promise<GuideCandidate[]> {
  const currency = input.displayCurrency;
  if (input.dealType === "HOTEL_ROOM") {
    const rooms = await db.roomType.findMany({
      where: { active: true, price: { gt: 0 }, pricePeriod: "NIGHT", listing: othersWhere(input) },
      select: {
        price: true,
        weekendPrice: true,
        currency: true,
        bedsSingle: true,
        bedsDouble: true,
        bedsSofa: true,
        maxGuests: true,
        sizeSqm: true,
        listing: { select: { id: true, ownerId: true, neighborhoodId: true, views: true, buildingAge: true, amenities: true } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_CANDIDATES,
    });
    return rooms.flatMap((room) => {
      const price = toDisplay(num(room.price), room.currency, currency, rates);
      if (!price) return [];
      const weekend = toDisplay(num(room.weekendPrice), room.currency, currency, rates);
      return [
        {
          listingId: room.listing.id,
          ownerId: room.listing.ownerId,
          neighborhoodId: room.listing.neighborhoodId,
          bedrooms: null,
          guests: roomSleeps(room),
          bathrooms: null,
          hasKitchen: room.listing.amenities.includes("full_kitchen"),
          seaView: room.listing.views.includes("SEA"),
          newBuilding: room.listing.buildingAge === null ? null : room.listing.buildingAge === "NEW",
          sizeSqm: room.sizeSqm,
          price: price.value,
          weekendPrice: weekend?.value ?? null,
          converted: price.converted || !!weekend?.converted,
        },
      ];
    });
  }

  const listings = await db.listing.findMany({
    where: { ...othersWhere(input), price: { gt: 0 }, pricePeriod: guidePeriodFor(input.dealType) },
    select: {
      id: true,
      ownerId: true,
      neighborhoodId: true,
      bedrooms: true,
      bathrooms: true,
      amenities: true,
      views: true,
      buildingAge: true,
      sizeSqm: true,
      price: true,
      weekendPrice: true,
      currency: true,
    },
    orderBy: { publishedAt: "desc" },
    take: MAX_CANDIDATES,
  });
  return listings.flatMap((listing) => {
    const price = toDisplay(num(listing.price), listing.currency, currency, rates);
    if (!price) return [];
    const weekend = GUIDE_UNIT_BY_DEAL[input.dealType] === "night" ? toDisplay(num(listing.weekendPrice), listing.currency, currency, rates) : null;
    return [
      {
        listingId: listing.id,
        ownerId: listing.ownerId,
        neighborhoodId: listing.neighborhoodId,
        bedrooms: listing.bedrooms,
        guests: null,
        bathrooms: num(listing.bathrooms),
        hasKitchen: listing.amenities.includes("full_kitchen"),
        seaView: listing.views.includes("SEA"),
        newBuilding: listing.buildingAge === null ? null : listing.buildingAge === "NEW",
        sizeSqm: listing.sizeSqm,
        price: price.value,
        weekendPrice: weekend?.value ?? null,
        converted: price.converted || !!weekend?.converted,
      },
    ];
  });
}

/** Active reference ranges that fit, most specific first, at most 3, in the guide's currency. */
async function loadReferences(input: GuideInput, rates: Rates): Promise<GuideReference[]> {
  const period = guidePeriodFor(input.dealType);
  const rows = await db.referencePrice.findMany({
    where: { cityId: input.cityId, dealType: input.dealType, active: true, unit: period },
    select: {
      cityId: true,
      neighborhoodId: true,
      dealType: true,
      propertyType: true,
      bedrooms: true,
      active: true,
      sourceMonth: true,
      unit: true,
      perSqm: true,
      low: true,
      high: true,
      currency: true,
      sourceName: true,
      sourceUrl: true,
    },
    orderBy: { sourceMonth: "desc" },
    take: 100,
  });
  const hotel = input.dealType === "HOTEL_ROOM";
  const fitting = matchReferencePrices(rows, {
    cityId: input.cityId,
    neighborhoodId: input.neighborhoodId ?? null,
    dealType: input.dealType,
    propertyType: input.propertyType,
    bedrooms: hotel ? null : (input.bedrooms ?? null),
  }).filter((row) => !isStaleReference(row.sourceMonth));
  return fitting.slice(0, MAX_REFERENCES).flatMap((row) => {
    const low = toDisplay(num(row.low), row.currency, input.displayCurrency, rates);
    const high = toDisplay(num(row.high), row.currency, input.displayCurrency, rates);
    if (!low || !high) return [];
    const converted = low.converted || high.converted;
    return [
      {
        low: converted ? roundGuide(low.value, "down") : low.value,
        high: converted ? roundGuide(high.value, "up") : high.value,
        currency: input.displayCurrency,
        unit: GUIDE_UNIT_BY_DEAL[input.dealType],
        sourceName: row.sourceName,
        ...(row.sourceUrl ? { sourceUrl: row.sourceUrl } : {}),
        sourceMonth: referenceMonth(row.sourceMonth),
        perSqm: row.perSqm,
        ...(converted ? { converted: true } : {}),
      },
    ];
  });
}

async function loadGuideData(input: GuideInput): Promise<GuideData> {
  const rates = await getRates();
  const [candidates, references] = await Promise.all([loadCandidates(input, rates), loadReferences(input, rates)]);
  return { rates, candidates, references };
}

/** The room's own size and beds (hotels): what a room type is compared by. */
type RoomFacts = { guests: number | null; sizeSqm: number | null };

function queryFor(input: GuideInput, room: RoomFacts | null): GuideQuery {
  const hotel = input.dealType === "HOTEL_ROOM";
  return {
    dealType: input.dealType,
    propertyType: input.propertyType,
    neighborhoodId: input.neighborhoodId ?? null,
    bedrooms: hotel ? null : (input.bedrooms ?? null),
    guests: hotel ? (room ? room.guests : (input.roomGuests ?? null)) : null,
    bathrooms: input.bathrooms ?? null,
    hasKitchen: input.hasKitchen ?? null,
    seaView: input.seaView ?? null,
    newBuilding: input.newBuilding ?? null,
    sizeSqm: room ? room.sizeSqm : (input.sizeSqm ?? null),
  };
}

function guideFromData(input: GuideInput, data: GuideData, room: RoomFacts | null): GuideResult {
  const guide = computeGuide(data.candidates, queryFor(input, room), { cityId: input.cityId, currency: input.displayCurrency });
  return { ...guide, references: data.references, rates: { ...data.rates } };
}

/** The guide and what it had to widen past (the neighborhood, the size). */
function guideWithWidening(input: GuideInput, data: GuideData, room: RoomFacts | null): { guide: GuideResult; widened: GuideWidening[] } {
  const guide = guideFromData(input, data, room);
  return { guide, widened: guideWidening(guide, guideAsked(queryFor(input, room))) };
}

/** The guide for one place (or one hotel room type). See the file comment for who may call it. */
export async function getPriceGuide(input: GuideInput): Promise<GuideResult> {
  let room: RoomFacts | null = null;
  if (input.dealType === "HOTEL_ROOM" && input.roomTypeId) {
    const row = await db.roomType.findFirst({
      where: { id: input.roomTypeId, ...(input.listingId ? { listingId: input.listingId } : {}) },
      select: { bedsSingle: true, bedsDouble: true, bedsSofa: true, maxGuests: true, sizeSqm: true },
    });
    if (row) room = { guests: roomSleeps(row), sizeSqm: row.sizeSqm };
  }
  return guideFromData(input, await loadGuideData(input), room);
}

// ─── A host's own listing (the post form, the edit page, "מדריך מחירים") ───

export type ListingGuideItem = {
  /** Hotels: the room type compared (null for other listings). */
  roomTypeId: string | null;
  /** The room type's name in the owner's language (user text: show with dir="auto"). */
  roomName: string | null;
  /** The saved price, its weekend price, currency and period (null: none yet). */
  price: number | null;
  weekendPrice: number | null;
  currency: CurrencyCode;
  period: PricePeriod;
  guide: GuideResult;
  /** What the guide had to widen past for lack of data (say so next to the numbers). */
  widened: GuideWidening[];
};

export type ListingGuideView = {
  listingId: string;
  publicId: number;
  title: string;
  dealType: DealType;
  propertyType: PropertyType;
  /** Public names of the listing's city and neighborhood, in the page's language. */
  place: { city: string; neighborhood: string | null } | null;
  /** No city chosen yet: nothing to compare. */
  needsCity: boolean;
  /** A hotel with no room type offered yet. */
  needsRooms: boolean;
  items: ListingGuideItem[];
};

const LISTING_GUIDE_SELECT = {
  id: true,
  publicId: true,
  ownerId: true,
  title: true,
  countryCode: true,
  cityId: true,
  neighborhoodId: true,
  city: { select: { names: true } },
  neighborhood: { select: { names: true } },
  dealType: true,
  propertyType: true,
  bedrooms: true,
  bathrooms: true,
  amenities: true,
  views: true,
  buildingAge: true,
  sizeSqm: true,
  price: true,
  weekendPrice: true,
  currency: true,
  pricePeriod: true,
  roomTypes: {
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: MAX_ROOM_TYPES,
    select: {
      id: true,
      names: true,
      price: true,
      weekendPrice: true,
      currency: true,
      pricePeriod: true,
      bedsSingle: true,
      bedsDouble: true,
      bedsSofa: true,
      maxGuests: true,
      sizeSqm: true,
    },
  },
} satisfies Prisma.ListingSelect;

type ListingGuideRow = Prisma.ListingGetPayload<{ select: typeof LISTING_GUIDE_SELECT }>;

/** What a listing is compared by (the same mapping as the mistake check's). */
export function guideInputFromListing(row: Omit<ListingGuideRow, "roomTypes" | "city" | "neighborhood">, currency: CurrencyCode): GuideInput | null {
  if (!row.cityId) return null;
  return {
    listingId: row.id,
    excludeOwnerId: row.ownerId,
    countryCode: row.countryCode,
    cityId: row.cityId,
    neighborhoodId: row.neighborhoodId,
    dealType: row.dealType,
    propertyType: row.propertyType,
    bedrooms: row.bedrooms,
    bathrooms: num(row.bathrooms),
    // An unticked amenity or view is "not said", not "no".
    hasKitchen: row.amenities.includes("full_kitchen") ? true : null,
    seaView: row.views.includes("SEA") ? true : null,
    newBuilding: row.buildingAge === null ? null : row.buildingAge === "NEW",
    sizeSqm: row.sizeSqm,
    displayCurrency: currency,
  };
}

const asCurrency = (value: string, fallback: CurrencyCode): CurrencyCode => (isCurrencyCode(value) ? value : fallback);

/**
 * The guide for one of `ownerId`'s listings (any status but deleted), in `currency` (default: the
 * listing's own). Hotels get one guide per room type they offer. null when it isn't theirs.
 */
export async function getListingPriceGuides(
  listingId: string,
  ownerId: string,
  opts: { locale: AppLocale; currency?: CurrencyCode | null },
): Promise<ListingGuideView | null> {
  const row = await db.listing.findFirst({
    where: { id: listingId, ownerId, deletedAt: null, status: { not: "DELETED" } },
    select: LISTING_GUIDE_SELECT,
  });
  if (!row) return null;
  const listingCurrency = asCurrency(row.currency, "USD");
  const currency = opts.currency ?? listingCurrency;
  const hotel = row.dealType === "HOTEL_ROOM";
  const base = {
    listingId: row.id,
    publicId: row.publicId,
    title: row.title,
    dealType: row.dealType,
    propertyType: row.propertyType,
    place: row.city
      ? { city: pickLocalized(row.city.names, opts.locale), neighborhood: row.neighborhood ? pickLocalized(row.neighborhood.names, opts.locale) || null : null }
      : null,
  };
  const input = guideInputFromListing(row, currency);
  if (!input) return { ...base, needsCity: true, needsRooms: false, items: [] };
  if (hotel && row.roomTypes.length === 0) return { ...base, needsCity: false, needsRooms: true, items: [] };

  const data = await loadGuideData(input);
  const items: ListingGuideItem[] = hotel
    ? row.roomTypes.map((room) => ({
        roomTypeId: room.id,
        roomName: pickLocalized(room.names, opts.locale) || null,
        price: num(room.price),
        weekendPrice: num(room.weekendPrice),
        currency: asCurrency(room.currency, listingCurrency),
        period: room.pricePeriod,
        ...guideWithWidening({ ...input, roomTypeId: room.id }, data, { guests: roomSleeps(room), sizeSqm: room.sizeSqm }),
      }))
    : [
        {
          roomTypeId: null,
          roomName: null,
          price: num(row.price),
          weekendPrice: num(row.weekendPrice),
          currency: listingCurrency,
          period: row.pricePeriod,
          ...guideWithWidening(input, data, null),
        },
      ];
  return { ...base, needsCity: false, needsRooms: false, items };
}

// ─── The "מדריך מחירים" page ─────────────────────────────────

export type GuideListingOption = { id: string; publicId: number; title: string; dealType: DealType; hasCity: boolean };
export type GuideCityOption = { id: string; slug: string; name: string };

/** The host's listings (not deleted, newest first) for the page's picker; empty = not a host. */
export async function getGuideListingOptions(ownerId: string): Promise<GuideListingOption[]> {
  const rows = await db.listing.findMany({
    where: { ownerId, deletedAt: null, status: { not: "DELETED" } },
    select: { id: true, publicId: true, title: true, dealType: true, cityId: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return rows.map((r) => ({ id: r.id, publicId: r.publicId, title: r.title, dealType: r.dealType, hasCity: r.cityId !== null }));
}

/** Active cities, in the site's order, with their names in `locale`. */
export async function getGuideCities(locale: AppLocale): Promise<GuideCityOption[]> {
  const rows = await db.city.findMany({
    where: { active: true },
    select: { id: true, slug: true, names: true },
    orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
  });
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: pickLocalized(r.names, locale) }));
}

export type CustomGuideQuery = {
  ownerId: string;
  citySlug: string;
  dealType: DealType;
  propertyType: PropertyType;
  /** Bedrooms (hotels: how many guests the room sleeps); null = all sizes. 5 means 5 and more. */
  size: number | null;
  currency: CurrencyCode;
  locale: AppLocale;
};

export type CustomGuideView = {
  cityName: string;
  dealType: DealType;
  propertyType: PropertyType;
  guide: GuideResult;
  widened: GuideWidening[];
};

/**
 * The "מדריך מחירים" page's own question (a city, deal type, property type and size): the same
 * guide, never counting `ownerId`'s listings. null for an unknown or inactive city.
 */
export async function getCustomPriceGuide(query: CustomGuideQuery): Promise<CustomGuideView | null> {
  const city = await db.city.findFirst({ where: { slug: query.citySlug, active: true }, select: { id: true, names: true, countryCode: true } });
  if (!city) return null;
  const hotel = query.dealType === "HOTEL_ROOM";
  const input: GuideInput = {
    excludeOwnerId: query.ownerId,
    countryCode: city.countryCode,
    cityId: city.id,
    dealType: query.dealType,
    propertyType: query.propertyType,
    bedrooms: hotel ? null : query.size,
    roomGuests: hotel ? query.size : null,
    displayCurrency: query.currency,
  };
  const data = await loadGuideData(input);
  return {
    cityName: pickLocalized(city.names, query.locale),
    dealType: query.dealType,
    propertyType: query.propertyType,
    ...guideWithWidening(input, data, null),
  };
}
