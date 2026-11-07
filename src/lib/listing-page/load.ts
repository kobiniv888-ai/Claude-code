import "server-only";
import { personName } from "@/lib/auth/first-name";
import { cache } from "react";
import { locales, siteConfig, type AppLocale, type CurrencyCode } from "@/config/site";
import type { Locale, Prisma } from "@/generated/prisma/client";
import { isAppLocale, pickLocalized } from "@/i18n/locale";
import { can } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/session";
import { hasStaffRights } from "@/lib/auth/session";
import { showsDocumentBadge } from "@/config/verification";
import { visitedMonth } from "@/lib/listing/visited";
import { parseContactMethods } from "@/lib/contact/links";
import { db } from "@/lib/db";
import { isPromoted, localizedTitle } from "@/lib/listing/mappers";
import { listingPath } from "@/lib/listing/urls";
import { photoUrl } from "@/lib/media";
import { parseNearby } from "@/lib/nearby";
import { georgiaToday } from "./calendar";
import { cheapestRoomType } from "./headline";
import { usesRoomInventory } from "@/lib/booking/constants";
import { freeSegments, hotelClosedRanges, roomQuantity, type RoomBlock } from "@/lib/booking/room-availability";
import { isBookableRoomType } from "@/lib/booking/terms";
import { publicPriceLabel } from "@/lib/booking/price-label";
import type { ListingAccessInput, ListingViewer } from "./access";
import type { ListingPageData, OwnerSummary, PagePhoto } from "./types";

/**
 * Loads one listing for /listing/[id] (server-only). Selects public columns only — never
 * address, lat/lng, cadastral code, the kosher certificate photo or contact values.
 * Cached per request, so generateMetadata and the page share one query.
 */

const DAY_MS = 24 * 3600 * 1000;
const MAX_PHOTOS = siteConfig.listings.maxPhotos;
/** About six months of booked dates: the page calendar can page ahead that far. */
const CALENDAR_DAYS = 190;

type DecimalLike = { toString(): string } | null;
const num = (value: DecimalLike): number | null => {
  if (value === null) return null;
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : null;
};

const photoSelect = { id: true, url: true, storageKey: true, alt: true, blurDataUrl: true, room: true } satisfies Prisma.ListingPhotoSelect;
const photoOrder = [{ isCover: "desc" }, { sortOrder: "asc" }] satisfies Prisma.ListingPhotoOrderByWithRelationInput[];

export const OWNER_PUBLIC_SELECT = {
  id: true,
  name: true,
  firstName: true,
  image: true,
  createdAt: true,
  phoneNumberVerified: true,
  idVerifiedAt: true,
  businessVerifiedAt: true,
  accountType: true,
  businessName: true,
  spokenLanguages: true,
  keepsShabbat: true,
  welcomePledgeVersion: true,
  timezone: true,
  avgReplyMinutes: true,
  replyRate: true,
  isDemo: true,
  status: true,
  deletedAt: true,
} satisfies Prisma.UserSelect;

type OwnerRow = Prisma.UserGetPayload<{ select: typeof OWNER_PUBLIC_SELECT }>;

export function toOwnerSummary(owner: OwnerRow): OwnerSummary {
  const business = owner.accountType === "BUSINESS";
  return {
    id: owner.id,
    // Never a phone number or an email as a name (bug 8.2).
    name: (business && owner.businessName?.trim()) || personName(owner) || "",
    image: owner.image,
    badges: {
      phoneVerified: owner.phoneNumberVerified === true,
      // Document badges are hidden while there are no document checks (src/config/verification.ts).
      idVerified: showsDocumentBadge(owner.idVerifiedAt),
      business,
      businessVerified: business && showsDocumentBadge(owner.businessVerifiedAt),
      keepsShabbat: owner.keepsShabbat,
      demo: owner.isDemo,
    },
    languages: owner.spokenLanguages.slice(0, 12),
    welcomePledgeVersion: owner.welcomePledgeVersion,
    memberSince: owner.createdAt.toISOString(),
    avgReplyMinutes: owner.avgReplyMinutes,
    replyRate: owner.replyRate,
    timezone: owner.timezone,
  };
}

function toPhoto(
  row: { id: string; url: string; storageKey: string | null; alt: string | null; blurDataUrl: string | null; room?: PagePhoto["room"] },
  fallbackAlt: string,
): PagePhoto {
  return {
    id: row.id,
    large: photoUrl(row, "lg"),
    medium: photoUrl(row, "md"),
    alt: row.alt?.trim() || fallbackAlt,
    blurDataUrl: row.blurDataUrl,
    // The host's room label (round 3, brief 6.1): "All photos" groups by room.
    room: row.room ?? null,
  };
}

function listingSelect(locale: AppLocale, today: Date, until: Date) {
  return {
    id: true,
    publicId: true,
    ownerId: true,
    status: true,
    isDemo: true,
    deletedAt: true,
    expiresAt: true,
    dealType: true,
    countryCode: true,
    propertyType: true,
    originalLocale: true,
    title: true,
    description: true,
    approxLat: true,
    approxLng: true,
    rooms: true,
    bedrooms: true,
    bathrooms: true,
    bedsSingle: true,
    bedsDouble: true,
    bedsSofa: true,
    maxGuests: true,
    sizeSqm: true,
    floor: true,
    totalFloors: true,
    elevator: true,
    yearBuilt: true,
    buildingAge: true,
    furnished: true,
    condition: true,
    heating: true,
    views: true,
    amenities: true,
    kitchenKosher: true,
    shabbatFeatures: true,
    jewishFeatures: true,
    isShabbatFriendly: true,
    kosherCertName: true,
    hotelJewishFeatures: true,
    sharedRoomFor: true,
    synagogueWalkMin: true,
    chabadWalkMin: true,
    nearby: true,
    price: true,
    currency: true,
    pricePeriod: true,
    priceDroppedAt: true,
    deposit: true,
    cleaningFee: true,
    weekendPrice: true,
    bookingMode: true,
    cancellationPolicy: true,
    utilitiesIncluded: true,
    utilitiesEstimate: true,
    minStayNights: true,
    weeklyDiscountPct: true,
    monthlyDiscountPct: true,
    checkInFrom: true,
    checkOutUntil: true,
    checkInFlexible: true,
    checkOutFlexible: true,
    smokingAllowed: true,
    petsAllowed: true,
    partiesAllowed: true,
    quietHoursFrom: true,
    quietHoursTo: true,
    videoUrl: true,
    tour360Url: true,
    // Read on the server only to list the channel TYPES; values never leave this module.
    contactMethods: true,
    contactHoursFrom: true,
    contactHoursTo: true,
    noReplyOnShabbat: true,
    viewCount: true,
    contentUpdatedAt: true,
    publishedAt: true,
    featuredUntil: true,
    ownerVerifiedAt: true,
    propertyVerifiedAt: true,
    // "ביקרנו במקום": the date only; visitedNote and visitedById are staff-only and never selected here.
    visitedAt: true,
    owner: { select: OWNER_PUBLIC_SELECT },
    city: { select: { slug: true, names: true, lat: true, lng: true, timezone: true } },
    neighborhood: { select: { names: true } },
    translations: {
      where: { locale: locale as Locale },
      take: 1,
      select: { title: true, description: true, isAuto: true, isOriginal: true, editedByOwner: true },
    },
    photos: { where: { roomTypeId: null }, orderBy: photoOrder, take: MAX_PHOTOS, select: photoSelect },
    // Switched-off room types are not offered to guests (round 3, founder's answer 3).
    roomTypes: {
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 20,
      select: {
        id: true,
        names: true,
        description: true,
        price: true,
        currency: true,
        pricePeriod: true,
        priceUsd: true,
        weekendPrice: true,
        maxGuests: true,
        bedsSingle: true,
        bedsDouble: true,
        bedsSofa: true,
        sizeSqm: true,
        amenities: true,
        quantity: true,
        active: true,
        photos: { orderBy: photoOrder, take: 12, select: photoSelect },
      },
    },
    priceChanges: { orderBy: { changedAt: "desc" }, take: 10, select: { oldPrice: true, newPrice: true, currency: true, changedAt: true } },
    // Hotels count rooms per room type (src/lib/booking/room-availability.ts): every booking is a row.
    availability: {
      where: { endDate: { gt: today }, startDate: { lt: until } },
      orderBy: { startDate: "asc" },
      take: 3000,
      select: { startDate: true, endDate: true, roomTypeId: true, rooms: true },
    },
    // Holiday prices in the calendar's months (round 3, brief 6.3): the dates sheet's live price.
    datePrices: {
      where: { endDate: { gt: today }, startDate: { lt: until } },
      orderBy: { startDate: "asc" },
      take: 120,
      select: { roomTypeId: true, startDate: true, endDate: true, price: true, minNights: true, label: true },
    },
  } satisfies Prisma.ListingSelect;
}

export type LoadedListing = {
  data: ListingPageData;
  access: ListingAccessInput;
  ownerId: string;
};

const dayString = (d: Date) => d.toISOString().slice(0, 10);

async function load(publicId: number, locale: AppLocale): Promise<LoadedListing | null> {
  const now = new Date();
  const todayStr = georgiaToday(now);
  const today = new Date(`${todayStr}T00:00:00.000Z`);
  const until = new Date(today.getTime() + CALENDAR_DAYS * DAY_MS);
  const row = await db.listing.findUnique({ where: { publicId }, select: listingSelect(locale, today, until) });
  if (!row) return null;

  const titles = localizedTitle(row, locale);
  const translation = row.translations[0];
  const useTranslation = !!translation && row.originalLocale !== locale && !!translation.title.trim();
  const description = useTranslation && translation.description.trim() ? translation.description : row.description;
  const cityName = row.city ? pickLocalized(row.city.names, locale) : null;
  const fallbackAlt = titles.title || row.title;

  let photoRows = row.photos;
  if (photoRows.length === 0) {
    // Hotels may keep every photo on a room type: show those in the gallery too.
    const seen = new Set<string>();
    photoRows = row.roomTypes
      .flatMap((r) => r.photos)
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
      .slice(0, MAX_PHOTOS);
  }
  const photos = photoRows.map((p) => toPhoto(p, fallbackAlt));

  // Hotels: free rooms per room type on the calendar's nights; the whole place is closed only
  // when no room type has a free room (one booking never closes the hotel).
  const blockRows: RoomBlock[] = row.availability.map((b) => ({ start: dayString(b.startDate), end: dayString(b.endDate), roomTypeId: b.roomTypeId, rooms: b.rooms }));
  const inventory = usesRoomInventory(row.dealType);
  const offered = inventory ? row.roomTypes.filter(isBookableRoomType) : [];
  const roomTypes = row.roomTypes.map((room) => {
    const name = pickLocalized(room.names, locale) || fallbackAlt;
    const bookable = offered.some((r) => r.id === room.id);
    return {
      id: room.id,
      name,
      description: room.description ? pickLocalized(room.description, locale) || null : null,
      price: num(room.price),
      currency: room.currency as CurrencyCode,
      pricePeriod: room.pricePeriod,
      weekendPrice: num(room.weekendPrice),
      maxGuests: room.maxGuests,
      bedsSingle: room.bedsSingle,
      bedsDouble: room.bedsDouble,
      bedsSofa: room.bedsSofa,
      sizeSqm: room.sizeSqm,
      amenities: room.amenities,
      photos: room.photos.map((p) => toPhoto(p, name)),
      ...(bookable
        ? { quantity: roomQuantity(room), segments: freeSegments(room, blockRows, todayStr, dayString(until)) }
        : {}),
    };
  });

  let price = num(row.price);
  let currency = row.currency as CurrencyCode;
  let pricePeriod = row.pricePeriod;
  let priceIsFrom = false;
  if (!(price && price > 0) && roomTypes.length) {
    // By value, not by the number: ₾190 is cheaper than $120 (room types may differ in currency).
    const cheapest = cheapestRoomType(roomTypes.map((room, i) => ({ ...room, priceUsd: num(row.roomTypes[i].priceUsd) })));
    if (cheapest) {
      price = cheapest.price;
      currency = cheapest.currency;
      pricePeriod = cheapest.pricePeriod;
      priceIsFrom = true;
    }
  }

  const data: ListingPageData = {
    id: row.id,
    publicId: row.publicId,
    status: row.status,
    isDemo: row.isDemo,
    dealType: row.dealType,
    propertyType: row.propertyType,
    title: { shown: titles.title, original: row.title.trim() },
    description: { shown: description.trim(), original: row.description.trim() },
    isTranslated: useTranslation,
    isAutoTranslated: useTranslation && !!translation?.isAuto && !translation.isOriginal && !translation.editedByOwner,
    originalLocale: isAppLocale(row.originalLocale) ? row.originalLocale : "he",
    city: row.city && cityName ? { slug: row.city.slug, name: cityName, lat: row.city.lat, lng: row.city.lng, timezone: row.city.timezone } : null,
    neighborhoodName: row.neighborhood ? pickLocalized(row.neighborhood.names, locale) || null : null,
    countryCode: row.countryCode,
    approx: row.approxLat !== null && row.approxLng !== null ? { lat: row.approxLat, lng: row.approxLng } : null,
    price,
    currency,
    listingCurrency: row.currency as CurrencyCode,
    pricePeriod,
    priceIsFrom,
    priceDroppedAt: row.priceDroppedAt?.toISOString() ?? null,
    rooms: row.rooms,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    bedsSingle: row.bedsSingle,
    bedsDouble: row.bedsDouble,
    bedsSofa: row.bedsSofa,
    maxGuests: row.maxGuests ?? (roomTypes.length ? Math.max(0, ...roomTypes.map((r) => r.maxGuests ?? 0)) || null : null),
    sizeSqm: row.sizeSqm,
    floor: row.floor,
    totalFloors: row.totalFloors,
    elevator: row.elevator,
    yearBuilt: row.yearBuilt,
    buildingAge: row.buildingAge,
    furnished: row.furnished,
    condition: row.condition,
    heating: row.heating,
    views: row.views,
    amenities: row.amenities,
    kitchenKosher: row.kitchenKosher,
    shabbatFeatures: row.shabbatFeatures,
    jewishFeatures: row.jewishFeatures,
    isShabbatFriendly: row.isShabbatFriendly,
    kosherCertName: row.kosherCertName?.trim() || null,
    hotelJewishFeatures: row.hotelJewishFeatures,
    sharedRoomFor: row.sharedRoomFor,
    synagogueWalkMin: row.synagogueWalkMin,
    chabadWalkMin: row.chabadWalkMin,
    nearby: parseNearby(row.nearby),
    deposit: num(row.deposit),
    cleaningFee: num(row.cleaningFee),
    weekendPrice: num(row.weekendPrice),
    bookingMode: row.bookingMode,
    utilitiesIncluded: row.utilitiesIncluded,
    utilitiesEstimate: num(row.utilitiesEstimate),
    minStayNights: row.minStayNights,
    weeklyDiscountPct: row.weeklyDiscountPct,
    monthlyDiscountPct: row.monthlyDiscountPct,
    checkInFrom: row.checkInFrom,
    checkOutUntil: row.checkOutUntil,
    checkInFlexible: row.checkInFlexible,
    checkOutFlexible: row.checkOutFlexible,
    cancellationPolicy: row.cancellationPolicy,
    smokingAllowed: row.smokingAllowed,
    petsAllowed: row.petsAllowed,
    partiesAllowed: row.partiesAllowed,
    quietHoursFrom: row.quietHoursFrom,
    quietHoursTo: row.quietHoursTo,
    videoUrl: row.videoUrl,
    tour360Url: row.tour360Url,
    contactChannels: parseContactMethods(row.contactMethods).map((m) => m.channel),
    contactHoursFrom: row.contactHoursFrom,
    contactHoursTo: row.contactHoursTo,
    noReplyOnShabbat: row.noReplyOnShabbat,
    viewCount: row.viewCount,
    contentUpdatedAt: row.contentUpdatedAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    ownerVerified: showsDocumentBadge(row.ownerVerifiedAt),
    propertyVerified: showsDocumentBadge(row.propertyVerifiedAt),
    visitedMonth: visitedMonth(row),
    promoted: isPromoted(row, undefined, now),
    isNew: !!row.publishedAt && now.getTime() - row.publishedAt.getTime() <= siteConfig.listings.newLabelDays * DAY_MS,
    photos,
    ogImage: photoRows[0] ? photoUrl(photoRows[0], "og") : null,
    roomTypes,
    priceChanges: row.priceChanges
      .map((c) => ({ oldPrice: num(c.oldPrice) ?? 0, newPrice: num(c.newPrice) ?? 0, currency: c.currency as CurrencyCode, changedAt: c.changedAt.toISOString() }))
      .filter((c) => c.oldPrice > 0 && c.newPrice > 0),
    blocks: inventory
      ? hotelClosedRanges(offered, blockRows, todayStr, dayString(until))
      : row.availability.map((b) => ({ start: dayString(b.startDate), end: dayString(b.endDate) })),
    datePrices: row.datePrices.map((p) => ({
      roomTypeId: p.roomTypeId,
      start: dayString(p.startDate),
      end: dayString(p.endDate),
      price: num(p.price) ?? 0,
      minNights: p.minNights,
      // Public text: a note with contact details (saved before the check) is dropped.
      label: publicPriceLabel(p.label),
    })),
    owner: toOwnerSummary(row.owner),
  };

  return {
    data,
    ownerId: row.ownerId,
    access: {
      status: row.status,
      ownerId: row.ownerId,
      isDemo: row.isDemo,
      deletedAt: row.deletedAt,
      expiresAt: row.expiresAt,
      owner: { status: row.owner.status, deletedAt: row.owner.deletedAt },
    },
  };
}

/** The listing with this public number in the visitor's language, or null. */
export const getListingPage = cache(load);

/**
 * The listing's path in every language (the slug follows the title shown in that language),
 * for hreflang alternates that do not redirect.
 */
export async function getListingPaths(listingId: string): Promise<Record<AppLocale, string> | null> {
  const row = await db.listing.findUnique({
    where: { id: listingId },
    select: { publicId: true, title: true, originalLocale: true, translations: { select: { locale: true, title: true } } },
  });
  if (!row) return null;
  return listingPathsByLocale(row);
}

/**
 * The canonical path of a listing in each language (/listing/<id>-<slug of the title in that
 * language>): what the page redirects to, its hreflang alternates and the sitemap entries.
 */
export function listingPathsByLocale(row: {
  publicId: number;
  title: string;
  originalLocale: Locale;
  translations: { locale: Locale; title: string }[];
}): Record<AppLocale, string> {
  return Object.fromEntries(
    locales.map((locale) => [locale, listingPath(row.publicId, localizedTitle({ ...row, translations: row.translations.filter((tr) => tr.locale === locale) }, locale).title)]),
  ) as Record<AppLocale, string>;
}

/** The viewer for listingAccess(): staff with moderation/reports/user rights may preview anything. */
export function toListingViewer(user: CurrentUser | null): ListingViewer {
  if (!user) return null;
  // 2-step login done (only demo staff may skip it, in development); demo staff only on a test address.
  const staffReady = hasStaffRights(user);
  const canPreviewAny = staffReady && (can(user.role, "moderation") || can(user.role, "reports.view") || can(user.role, "users.view"));
  return { id: user.id, canPreviewAny };
}

/** Has this user saved the listing (the heart on the page)? */
export async function isListingSaved(userId: string, listingId: string): Promise<boolean> {
  const row = await db.favorite.findUnique({ where: { userId_listingId: { userId, listingId } }, select: { id: true } });
  return !!row;
}
