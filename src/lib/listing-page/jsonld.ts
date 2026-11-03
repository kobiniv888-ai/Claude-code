/**
 * schema.org structured data for a listing page (client-safe, pure). Never includes exact
 * coordinates, the street address or contact details — only the city and neighborhood.
 */
import type { PropertyType } from "@/generated/prisma/enums";
import { countryConfig } from "@/config/countries";
import type { ListingPageData } from "./types";

const TYPE_BY_PROPERTY: Record<PropertyType, string> = {
  APARTMENT: "Apartment",
  STUDIO: "Apartment",
  PENTHOUSE: "Apartment",
  HOUSE: "House",
  VILLA: "House",
  COTTAGE: "House",
  ROOM: "Room",
  HOTEL: "Hotel",
  GUESTHOUSE: "BedAndBreakfast",
  HOSTEL: "Hostel",
};

const UNIT_BY_PERIOD = { NIGHT: "DAY", WEEK: "WEE", MONTH: "MON" } as const;

export function schemaTypeFor(propertyType: PropertyType): string {
  return TYPE_BY_PROPERTY[propertyType] ?? "Accommodation";
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function offer(data: Pick<ListingPageData, "price" | "currency" | "pricePeriod" | "dealType" | "priceIsFrom">, url: string) {
  if (!data.price || data.price <= 0) return null;
  const base: Record<string, unknown> = {
    "@type": "Offer",
    url,
    priceCurrency: data.currency,
    price: data.price,
    availability: "https://schema.org/InStock",
    businessFunction: data.dealType === "SALE" ? "http://purl.org/goodrelations/v1#Sell" : "http://purl.org/goodrelations/v1#LeaseOut",
  };
  if (data.pricePeriod !== "TOTAL") {
    base.priceSpecification = {
      "@type": "UnitPriceSpecification",
      price: data.price,
      priceCurrency: data.currency,
      unitCode: UNIT_BY_PERIOD[data.pricePeriod],
      ...(data.priceIsFrom ? { minPrice: data.price } : {}),
    };
  }
  return base;
}

export function buildListingJsonLd(
  data: ListingPageData,
  opts: { url: string; images: string[]; inLanguage: string },
): Record<string, unknown> {
  const isLodging = data.propertyType === "HOTEL" || data.propertyType === "GUESTHOUSE" || data.propertyType === "HOSTEL";
  const place: Record<string, unknown> = {
    "@type": schemaTypeFor(data.propertyType),
    name: clip(data.title.shown, 120),
    description: clip(data.description.shown, 500),
    url: opts.url,
    inLanguage: opts.inLanguage,
    ...(opts.images.length ? { image: opts.images.slice(0, 6) } : {}),
    address: {
      "@type": "PostalAddress",
      addressCountry: countryConfig(data.countryCode).code,
      ...(data.city ? { addressLocality: data.city.name } : {}),
      ...(data.neighborhoodName ? { addressRegion: data.neighborhoodName } : {}),
    },
  };
  if (!isLodging) {
    if (data.rooms) place.numberOfRooms = data.rooms;
    if (data.bedrooms !== null) place.numberOfBedrooms = data.bedrooms;
    if (data.bathrooms !== null) place.numberOfBathroomsTotal = data.bathrooms;
    if (data.sizeSqm) place.floorSize = { "@type": "QuantitativeValue", value: data.sizeSqm, unitCode: "MTK" };
    if (data.maxGuests && data.dealType !== "SALE") place.occupancy = { "@type": "QuantitativeValue", maxValue: data.maxGuests };
    if (data.yearBuilt) place.yearBuilt = data.yearBuilt;
  }
  if (data.petsAllowed !== null) place.petsAllowed = data.petsAllowed;
  if (data.checkInFrom) place.checkinTime = data.checkInFrom;
  if (data.checkOutUntil) place.checkoutTime = data.checkOutUntil;

  const main = offer(data, opts.url);
  if (isLodging && data.roomTypes.length) {
    const offers = data.roomTypes
      .map((room) => {
        const o = offer({ ...data, price: room.price, currency: room.currency, pricePeriod: room.pricePeriod, priceIsFrom: false }, opts.url);
        return o ? { ...o, itemOffered: { "@type": "HotelRoom", name: clip(room.name, 120) } } : null;
      })
      .filter(Boolean);
    if (offers.length) place.makesOffer = offers;
  } else if (main) {
    place.offers = main;
  }
  return { "@context": "https://schema.org", ...place };
}
