/**
 * Database rows → public card data. The select below is the ONLY place that decides which
 * columns a card reads: it never selects the exact address, lat/lng, cadastral code or contact
 * values, so they cannot leak into search results.
 */
import { siteConfig, type AppLocale, type CurrencyCode } from "@/config/site";
import type { Prisma } from "@/generated/prisma/client";
import type { Locale } from "@/generated/prisma/enums";
import { pickLocalized } from "@/i18n/locale";
import { photoUrl } from "@/lib/media";
import type { ListingCardBadges, ListingCardData, ListingMapPoint } from "@/lib/listing/types";
import { listingPath } from "@/lib/listing/urls";
import { hasWelcomePledge, PLEDGE_CURRENT_VERSION } from "@/lib/pledge";

const DAY_MS = 86_400_000;
const MAX_CARD_PHOTOS = 6;

const photoOrder = [{ isCover: "desc" }, { sortOrder: "asc" }] satisfies Prisma.ListingPhotoOrderByWithRelationInput[];
const cheapestRoom = {
  orderBy: [{ priceUsd: { sort: "asc", nulls: "last" } }, { sortOrder: "asc" }],
  take: 1,
  select: { price: true, currency: true, pricePeriod: true, priceUsd: true, maxGuests: true },
} satisfies Prisma.Listing$roomTypesArgs;

/** Owner columns a card reads: public badge facts only (no contact details, no private data). */
export const CARD_OWNER_SELECT = {
  accountType: true,
  idVerifiedAt: true,
  welcomePledgeVersion: true,
  keepsShabbat: true,
  spokenLanguages: true,
} as const satisfies Prisma.UserSelect;

/** Columns a listing card needs (with the title in `locale`). */
export function listingCardSelect(locale: AppLocale) {
  return {
    id: true,
    publicId: true,
    title: true,
    originalLocale: true,
    dealType: true,
    propertyType: true,
    bedrooms: true,
    bathrooms: true,
    sizeSqm: true,
    maxGuests: true,
    price: true,
    currency: true,
    pricePeriod: true,
    priceUsd: true,
    isShabbatFriendly: true,
    kitchenKosher: true,
    synagogueWalkMin: true,
    jewishFeatures: true,
    hotelJewishFeatures: true,
    publishedAt: true,
    priceDroppedAt: true,
    featuredUntil: true,
    isDemo: true,
    ownerVerifiedAt: true,
    approxLat: true,
    approxLng: true,
    owner: { select: CARD_OWNER_SELECT },
    city: { select: { names: true } },
    neighborhood: { select: { names: true } },
    translations: { where: { locale: locale as Locale }, take: 1, select: { title: true, isAuto: true, isOriginal: true } },
    photos: { orderBy: photoOrder, take: MAX_CARD_PHOTOS, select: { url: true, storageKey: true, alt: true, blurDataUrl: true } },
    // Card v2: the total for the "+N photos" slide, and the floor in the icon row.
    _count: { select: { photos: true } },
    floor: true,
    roomTypes: cheapestRoom,
  } satisfies Prisma.ListingSelect;
}

export type ListingCardRow = Prisma.ListingGetPayload<{ select: ReturnType<typeof listingCardSelect> }>;

/** Columns a map marker needs. */
export function listingMapSelect(locale: AppLocale) {
  return {
    id: true,
    publicId: true,
    title: true,
    originalLocale: true,
    approxLat: true,
    approxLng: true,
    price: true,
    currency: true,
    pricePeriod: true,
    translations: { where: { locale: locale as Locale }, take: 1, select: { title: true } },
    photos: { orderBy: photoOrder, take: 1, select: { url: true, storageKey: true } },
    roomTypes: cheapestRoom,
  } satisfies Prisma.ListingSelect;
}

export type ListingMapRow = Prisma.ListingGetPayload<{ select: ReturnType<typeof listingMapSelect> }>;

export type CardMapContext = {
  locale: AppLocale;
  now?: Date;
  /** settings.featuredListingIds */
  featuredIds?: ReadonlySet<string> | readonly string[];
  /** The visitor's saved listing ids. */
  favoriteIds?: ReadonlySet<string>;
  /** settings.pledgeRequiredVersion (default: the current pledge version). */
  pledgeRequiredVersion?: number;
};

type DecimalLike = { toString(): string } | number | null;

function toNumber(value: DecimalLike): number | null {
  if (value === null) return null;
  const n = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

function within(date: Date | null, days: number, now: Date): boolean {
  return !!date && now.getTime() - date.getTime() <= days * DAY_MS && date.getTime() <= now.getTime() + DAY_MS;
}

/** The listing's own price, or "from" its cheapest room type (hotels). */
function cardPrice(row: Pick<ListingCardRow, "price" | "currency" | "pricePeriod" | "priceUsd" | "roomTypes">) {
  const own = toNumber(row.price);
  if (own !== null && own > 0) {
    return { price: own, currency: row.currency, pricePeriod: row.pricePeriod, priceUsd: toNumber(row.priceUsd), priceIsFrom: false };
  }
  const room = row.roomTypes[0];
  const roomPrice = room ? toNumber(room.price) : null;
  if (room && roomPrice !== null && roomPrice > 0) {
    return { price: roomPrice, currency: room.currency, pricePeriod: room.pricePeriod, priceUsd: toNumber(room.priceUsd), priceIsFrom: true };
  }
  return { price: null, currency: row.currency, pricePeriod: row.pricePeriod, priceUsd: toNumber(row.priceUsd), priceIsFrom: false };
}

/** Title in the visitor's language: a translation row, else the original. */
export function localizedTitle(
  row: { title: string; originalLocale?: Locale; translations: { title: string; isAuto?: boolean; isOriginal?: boolean }[] },
  locale: AppLocale,
): { title: string; isAuto: boolean } {
  const translation = row.translations[0];
  if (translation?.title.trim() && row.originalLocale !== locale) {
    return { title: translation.title.trim(), isAuto: !!translation.isAuto && !translation.isOriginal };
  }
  return { title: row.title.trim(), isAuto: false };
}

export function isPromoted(
  row: { id: string; featuredUntil: Date | null },
  featuredIds: ReadonlySet<string> | readonly string[] | undefined,
  now: Date,
): boolean {
  if (row.featuredUntil && row.featuredUntil.getTime() > now.getTime()) return true;
  if (!featuredIds) return false;
  return featuredIds instanceof Set ? featuredIds.has(row.id) : (featuredIds as readonly string[]).includes(row.id);
}

const KOSHER_MEAL_FEATURES = new Set(["kosher_meals", "kosher_breakfast"]);

/** The Jewish-life badges of a card (pure; shared with the listing page). */
export function jewishBadges(
  row: Pick<ListingCardRow, "jewishFeatures" | "hotelJewishFeatures"> & { owner: Pick<ListingCardRow["owner"], "welcomePledgeVersion" | "keepsShabbat" | "spokenLanguages"> },
  pledgeRequiredVersion: number = PLEDGE_CURRENT_VERSION,
): Pick<ListingCardBadges, "welcomes" | "speaksHebrew" | "keepsShabbat" | "kosherMeals"> {
  return {
    welcomes: hasWelcomePledge(row.owner, { pledgeRequiredVersion }),
    speaksHebrew: row.jewishFeatures.includes("host_speaks_hebrew") || row.owner.spokenLanguages.includes("he"),
    keepsShabbat: row.owner.keepsShabbat || row.jewishFeatures.includes("host_keeps_shabbat"),
    kosherMeals: row.hotelJewishFeatures.some((feature) => KOSHER_MEAL_FEATURES.has(feature)),
  };
}

export function toListingCard(row: ListingCardRow, ctx: CardMapContext): ListingCardData {
  const now = ctx.now ?? new Date();
  const { title, isAuto } = localizedTitle(row, ctx.locale);
  const price = cardPrice(row);
  const { newLabelDays, priceDropLabelDays } = siteConfig.listings;

  return {
    id: row.id,
    publicId: row.publicId,
    href: listingPath(row.publicId, title),
    title,
    titleIsAutoTranslated: isAuto,
    cityName: row.city ? pickLocalized(row.city.names, ctx.locale) || null : null,
    neighborhoodName: row.neighborhood ? pickLocalized(row.neighborhood.names, ctx.locale) || null : null,
    photos: row.photos.map((photo) => ({
      url: photoUrl(photo, "md"),
      alt: photo.alt?.trim() || title,
      ...(photo.blurDataUrl ? { blurDataUrl: photo.blurDataUrl } : {}),
    })),
    price: price.price,
    currency: price.currency as CurrencyCode,
    pricePeriod: price.pricePeriod,
    priceIsFrom: price.priceIsFrom,
    priceUsd: price.priceUsd,
    dealType: row.dealType,
    propertyType: row.propertyType,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    sizeSqm: row.sizeSqm,
    maxGuests: row.maxGuests ?? row.roomTypes[0]?.maxGuests ?? null,
    photoCount: row._count.photos,
    floor: row.floor,
    badges: {
      ...jewishBadges(row, ctx.pledgeRequiredVersion),
      verified: !!row.owner.idVerifiedAt || !!row.ownerVerifiedAt,
      business: row.owner.accountType === "BUSINESS",
      shabbatFriendly: row.isShabbatFriendly,
      kosherKitchen: row.kitchenKosher === "KOSHER",
      synagogueWalkMin: row.synagogueWalkMin,
      isNew: within(row.publishedAt, newLabelDays, now),
      priceDropped: within(row.priceDroppedAt, priceDropLabelDays, now),
      promoted: isPromoted(row, ctx.featuredIds, now),
      demo: row.isDemo,
    },
    lat: row.approxLat,
    lng: row.approxLng,
    isFavorite: ctx.favoriteIds?.has(row.id) ?? false,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

/** A map marker; null when the listing has no approximate point yet. */
export function toListingMapPoint(row: ListingMapRow, locale: AppLocale): ListingMapPoint | null {
  if (row.approxLat === null || row.approxLng === null) return null;
  const { title } = localizedTitle(row, locale);
  const price = cardPrice({ ...row, priceUsd: null });
  const photo = row.photos[0];
  return {
    publicId: row.publicId,
    lat: row.approxLat,
    lng: row.approxLng,
    price: price.price,
    currency: price.currency as CurrencyCode,
    pricePeriod: price.pricePeriod,
    priceIsFrom: price.priceIsFrom,
    title,
    href: listingPath(row.publicId, title),
    photo: photo ? photoUrl(photo, "sm") : null,
  };
}
