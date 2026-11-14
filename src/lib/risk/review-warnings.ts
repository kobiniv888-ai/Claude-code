import "server-only";
import type { CurrencyCode } from "@/config/site";
import type { DealType, PropertyType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { isCurrencyCode } from "@/lib/currency/convert";
import { geocodeAddress } from "@/lib/geocode";
import type { LatLng } from "@/lib/geo";
import { getPriceGuide } from "@/lib/pricing/guide-server";
import { GUIDE_PERIOD_BY_UNIT, GUIDE_UNIT_BY_DEAL } from "@/lib/pricing/guide";
import {
  addressPinStatus,
  copySimilarity,
  priceVersusGuide,
  searchSnippet,
  shingles,
  type AddressPinStatus,
  type PriceGuideStatus,
} from "./review-checks";

/**
 * The review screen's extra warnings (SECURITY_REPORT 14.1.c/d/f), data access. Staff only: the
 * admin listing review page (src/app/[locale]/admin/moderation/[id]) calls getReviewWarnings, and
 * the risk engine (./index.ts) adds points for a copied description and a price far below the
 * guide. The rules are in ./review-checks.ts.
 *
 * Each check FAILS SOFT and says so: a geocoder or database error shows "couldn't check", never
 * a pass.
 */

/** At most this many other listings are compared with a description (newest first, same city). */
export const COPY_CANDIDATES = 400;
/** At most this many copies are listed. */
export const COPY_MATCHES_SHOWN = 5;

export type CopyMatch = { listingId: string; publicId: number; title: string; percent: number };

/** Other accounts' listings whose description shares most of this one (the same city when known). */
export async function findCopiedDescriptions(listing: {
  id: string;
  ownerId: string;
  cityId: string | null;
  isDemo: boolean;
  description: string;
}): Promise<CopyMatch[]> {
  const mine = shingles(listing.description);
  if (mine.size === 0) return [];
  const others = await db.listing.findMany({
    where: {
      id: { not: listing.id },
      ownerId: { not: listing.ownerId },
      isDemo: listing.isDemo,
      status: { notIn: ["DRAFT", "DELETED"] },
      ...(listing.cityId ? { cityId: listing.cityId } : {}),
    },
    select: { id: true, publicId: true, title: true, description: true },
    orderBy: { updatedAt: "desc" },
    take: COPY_CANDIDATES,
  });
  const matches: CopyMatch[] = [];
  for (const other of others) {
    const similarity = copySimilarity(mine, shingles(other.description));
    if (similarity.copied) {
      matches.push({ listingId: other.id, publicId: other.publicId, title: other.title, percent: Math.round(similarity.containment * 100) });
    }
  }
  return matches.sort((a, b) => b.percent - a.percent).slice(0, COPY_MATCHES_SHOWN);
}

export type PriceGuideWarning = PriceGuideStatus & { currency?: CurrencyCode; places?: number };

/**
 * The listing's price against the price guide (other owners' similar places on the site) and the
 * reference ranges, in the listing's own currency and the unit its deal type compares. Hotels use
 * their cheapest active room type.
 */
export async function priceGuideCheck(listingId: string): Promise<PriceGuideWarning> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      ownerId: true,
      countryCode: true,
      cityId: true,
      neighborhoodId: true,
      dealType: true,
      propertyType: true,
      bedrooms: true,
      bathrooms: true,
      sizeSqm: true,
      price: true,
      currency: true,
      pricePeriod: true,
      roomTypes: { where: { active: true }, select: { id: true, price: true, currency: true, pricePeriod: true }, orderBy: { price: "asc" }, take: 1 },
    },
  });
  if (!listing?.cityId) return { status: "no_data" };
  const hotel = listing.dealType === "HOTEL_ROOM";
  const room = hotel ? listing.roomTypes[0] : null;
  const amount = hotel ? room?.price : listing.price;
  const currency = hotel ? room?.currency : listing.currency;
  const period = hotel ? room?.pricePeriod : listing.pricePeriod;
  // Only a price in the unit the guide compares (per night, per month, the full price).
  if (amount == null || !currency || !isCurrencyCode(currency) || period !== GUIDE_PERIOD_BY_UNIT[GUIDE_UNIT_BY_DEAL[listing.dealType as DealType]]) {
    return { status: "no_data" };
  }
  const guide = await getPriceGuide({
    listingId: listing.id,
    excludeOwnerId: listing.ownerId,
    countryCode: listing.countryCode,
    cityId: listing.cityId,
    neighborhoodId: listing.neighborhoodId,
    dealType: listing.dealType as DealType,
    propertyType: listing.propertyType as PropertyType,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    sizeSqm: listing.sizeSqm,
    roomTypeId: room?.id ?? null,
    displayCurrency: currency,
  });
  const guideLow = guide.status !== "not_enough" && guide.price ? guide.price.p25 : null;
  const referenceLows = guide.references.filter((r) => !r.perSqm).map((r) => r.low);
  const result = priceVersusGuide(Number(amount), guideLow, referenceLows);
  return { ...result, currency, ...(guide.price ? { places: guide.price.count } : {}) };
}

/** The typed street address geocoded in its city, against the pin (null results = the geocoder failed). */
export async function addressPinCheck(input: { address: string | null; city: string | null; pin: LatLng | null; locale: string }): Promise<AddressPinStatus> {
  const address = input.address?.trim();
  if (!address || !input.pin) return { status: "no_address" };
  const query = [address, input.city].filter(Boolean).join(", ").slice(0, 200);
  try {
    const results = await geocodeAddress(query, input.locale);
    return addressPinStatus(input.pin, results);
  } catch (error) {
    console.error("[risk] address check unavailable:", (error as Error)?.name ?? "error");
    return addressPinStatus(input.pin, null);
  }
}

export type ReviewWarnings = {
  addressPin: AddressPinStatus;
  priceGuide: PriceGuideWarning | { status: "unavailable" };
  copies: CopyMatch[] | null;
  /** A sentence of the description for "search this text" (null when too short). */
  snippet: string | null;
};

/** All three, for the review page (each one fails soft on its own). */
export async function getReviewWarnings(listing: {
  id: string;
  ownerId: string;
  cityId: string | null;
  isDemo: boolean;
  description: string;
  address: string | null;
  cityName: string | null;
  pin: LatLng | null;
  locale: string;
}): Promise<ReviewWarnings> {
  const [addressPin, priceGuide, copies] = await Promise.all([
    addressPinCheck({ address: listing.address, city: listing.cityName, pin: listing.pin, locale: listing.locale }),
    priceGuideCheck(listing.id).catch((error) => {
      console.error("[risk] price-guide check failed:", (error as Error)?.name ?? "error");
      return { status: "unavailable" as const };
    }),
    findCopiedDescriptions(listing).catch((error) => {
      console.error("[risk] copied-text check failed:", (error as Error)?.name ?? "error");
      return null;
    }),
  ]);
  return { addressPin, priceGuide, copies, snippet: searchSnippet(listing.description) };
}
