import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ListingStatus } from "@/generated/prisma/enums";
import { isAppLocale, pickLocalized } from "@/i18n/locale";
import { siteConfig, type AppLocale, type CurrencyCode } from "@/config/site";
import type { CurrentUser } from "@/lib/auth/session";
import { hmacHash, safeEqual } from "@/lib/crypto";
import { isEnabledCurrency } from "@/lib/currency/convert";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { CONTACT_CHANNELS, DEFAULT_PRICE_PERIOD, type ContactMethod } from "@/lib/listing/fields";
import { photoUrl } from "@/lib/media";
import { getCities, getNeighborhoods } from "@/lib/places";
import { getSettings } from "@/lib/settings";
import { isTranslationEnabled } from "@/lib/translate";
import type { WizardValues } from "./schemas";
import { applies, stepsFor, type ListingKind } from "./steps";
import type {
  DayRange,
  DraftSummary,
  WizardCity,
  WizardContext,
  WizardListing,
  WizardMode,
  WizardPhoto,
  WizardRoomType,
} from "./types";

/**
 * Server helpers for the post-a-listing wizard: loading a listing the user owns into the
 * shape the browser edits, and turning step data back into database updates.
 */

/** Listings in these states can be opened in the wizard (DELETED is a 404). */
export const EDITABLE_STATUSES: ListingStatus[] = [
  "DRAFT",
  "IN_REVIEW",
  "NEEDS_CHANGES",
  "LIVE",
  "PAUSED",
  "EXPIRED",
  "RENTED",
  "SOLD",
  "REJECTED",
  "HIDDEN",
];

const photoSelect = {
  id: true,
  url: true,
  storageKey: true,
  width: true,
  height: true,
  isCover: true,
  alt: true,
  sortOrder: true,
  roomTypeId: true,
} satisfies Prisma.ListingPhotoSelect;

type PhotoRow = Prisma.ListingPhotoGetPayload<{ select: typeof photoSelect }>;

export function toWizardPhoto(photo: PhotoRow): WizardPhoto {
  return {
    id: photo.id,
    url: photoUrl(photo, "md"),
    thumbUrl: photoUrl(photo, "sm"),
    width: photo.width,
    height: photo.height,
    isCover: photo.isCover,
    alt: photo.alt ?? "",
    roomTypeId: photo.roomTypeId,
  };
}

/** The listing row (any non-deleted status) if `userId` owns it, else null. */
export async function findOwnedListing(listingId: string, userId: string) {
  if (typeof listingId !== "string" || listingId.length === 0 || listingId.length > 64) return null;
  return db.listing.findFirst({
    where: { id: listingId, ownerId: userId, status: { in: EDITABLE_STATUSES }, deletedAt: null },
  });
}

/** Like findOwnedListing, but throws NotFoundError (for server actions). */
export async function requireOwnedListing(listingId: string, userId: string) {
  const listing = await findOwnedListing(listingId, userId);
  if (!listing) throw new NotFoundError();
  return listing;
}

export type ListingRow = NonNullable<Awaited<ReturnType<typeof findOwnedListing>>>;

const num = (value: Prisma.Decimal | number | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value);

export function parseContactMethods(value: unknown): ContactMethod[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: ContactMethod[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { channel, value: v, order } = item as Record<string, unknown>;
    if (typeof channel !== "string" || !(CONTACT_CHANNELS as readonly string[]).includes(channel)) continue;
    if (seen.has(channel)) continue;
    seen.add(channel);
    out.push({
      channel: channel as ContactMethod["channel"],
      value: typeof v === "string" ? v : "",
      order: typeof order === "number" ? order : out.length,
    });
  }
  return out.sort((a, b) => a.order - b.order).map((m, index) => ({ ...m, order: index }));
}

export function toWizardValues(listing: ListingRow, businessName: string | null): WizardValues {
  const currency = (isEnabledCurrency(listing.currency) ? listing.currency : siteConfig.currencies.fallback) as CurrencyCode;
  return {
    dealType: listing.dealType,
    propertyType: listing.propertyType,
    businessName: businessName ?? "",
    cityId: listing.cityId,
    neighborhoodId: listing.neighborhoodId,
    address: listing.address ?? "",
    lat: listing.lat,
    lng: listing.lng,
    rooms: listing.rooms,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    bedsSingle: listing.bedsSingle,
    bedsDouble: listing.bedsDouble,
    bedsSofa: listing.bedsSofa,
    maxGuests: listing.maxGuests,
    sizeSqm: listing.sizeSqm,
    floor: listing.floor,
    totalFloors: listing.totalFloors,
    elevator: listing.elevator,
    yearBuilt: listing.yearBuilt,
    buildingAge: listing.buildingAge,
    furnished: listing.furnished,
    condition: listing.condition,
    heating: listing.heating,
    views: listing.views,
    cadastralCode: listing.cadastralCode ?? "",
    sharedRoomFor: listing.sharedRoomFor,
    originalLocale: isAppLocale(listing.originalLocale) ? listing.originalLocale : "he",
    title: listing.title,
    description: listing.description,
    videoUrl: listing.videoUrl ?? "",
    tour360Url: listing.tour360Url ?? "",
    amenities: listing.amenities,
    petsAllowed: listing.petsAllowed,
    smokingAllowed: listing.smokingAllowed,
    partiesAllowed: listing.partiesAllowed,
    checkInFrom: listing.checkInFrom ?? "",
    checkOutUntil: listing.checkOutUntil ?? "",
    quietHoursFrom: listing.quietHoursFrom ?? "",
    quietHoursTo: listing.quietHoursTo ?? "",
    kitchenKosher: listing.kitchenKosher,
    shabbatFeatures: listing.shabbatFeatures,
    jewishFeatures: listing.jewishFeatures,
    hotelJewishFeatures: listing.hotelJewishFeatures,
    kosherCertName: listing.kosherCertName ?? "",
    kosherCertPhotoKey: listing.kosherCertPhotoKey,
    price: num(listing.price),
    currency,
    pricePeriod: listing.pricePeriod,
    deposit: num(listing.deposit),
    cleaningFee: num(listing.cleaningFee),
    utilitiesIncluded: listing.utilitiesIncluded,
    utilitiesEstimate: num(listing.utilitiesEstimate),
    minStayNights: listing.minStayNights,
    weeklyDiscountPct: listing.weeklyDiscountPct,
    monthlyDiscountPct: listing.monthlyDiscountPct,
    icalImportUrls: listing.icalImportUrls,
    contactMethods: parseContactMethods(listing.contactMethods),
    contactHoursFrom: listing.contactHoursFrom ?? "",
    contactHoursTo: listing.contactHoursTo ?? "",
    noReplyOnShabbat: listing.noReplyOnShabbat,
  };
}

// ─── Dates ────────────────────────────────────────────────────

export function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** DB blocks have an exclusive end date; the wizard uses inclusive ranges. */
function toInclusiveRange(start: Date, endExclusive: Date): DayRange {
  const last = new Date(endExclusive.getTime() - 24 * 3600 * 1000);
  return { start: dayString(start), end: dayString(last < start ? start : last) };
}

// ─── Loading ──────────────────────────────────────────────────

async function loadCities(locale: AppLocale): Promise<WizardCity[]> {
  const cities = await getCities();
  return Promise.all(
    cities.map(async (city) => ({
      id: city.id,
      slug: city.slug,
      name: pickLocalized(city.names, locale),
      lat: city.lat,
      lng: city.lng,
      neighborhoods: (await getNeighborhoods(city.id)).map((n) => ({
        id: n.id,
        name: pickLocalized(n.names, locale),
        lat: n.lat,
        lng: n.lng,
      })),
    })),
  );
}

const EDIT_TOKEN_TTL_MS = 7 * 24 * 3600 * 1000;

/** A signed "opened the editor at" timestamp, so saveChanges knows what changed since. */
export function signEditToken(listingId: string, openedAt: Date): string {
  const ts = String(openedAt.getTime());
  return `${ts}.${hmacHash(`wizard-edit:${listingId}:${ts}`)}`;
}

/** The time the editor was opened, or null for a missing, forged or expired token. */
export function verifyEditToken(listingId: string, token: unknown): Date | null {
  if (typeof token !== "string") return null;
  const [ts, signature] = token.split(".");
  if (!ts || !signature || !/^\d{10,16}$/.test(ts)) return null;
  if (!safeEqual(signature, hmacHash(`wizard-edit:${listingId}:${ts}`))) return null;
  const openedAt = new Date(Number(ts));
  if (Date.now() - openedAt.getTime() > EDIT_TOKEN_TTL_MS || openedAt.getTime() > Date.now() + 60_000) return null;
  return openedAt;
}

/** "/listing/1234" — the listing page redirects to its full slug (like the lifecycle emails). */
export function publicPathFor(listing: { publicId: number; status: ListingStatus }): string | null {
  if (listing.status === "DRAFT") return null;
  return `/listing/${listing.publicId}`;
}

export async function loadWizard(
  listingId: string,
  user: CurrentUser,
  mode: WizardMode,
  locale: AppLocale,
): Promise<{ listing: WizardListing; context: WizardContext } | null> {
  const listing = await findOwnedListing(listingId, user.id);
  if (!listing) return null;

  const [photos, roomTypes, blocks, translations, cities, settings, translationEnabled] = await Promise.all([
    db.listingPhoto.findMany({
      where: { listingId: listing.id },
      select: photoSelect,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    db.roomType.findMany({ where: { listingId: listing.id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.availabilityBlock.findMany({
      where: { listingId: listing.id, endDate: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
      orderBy: { startDate: "asc" },
      take: 1000,
    }),
    db.listingTranslation.findMany({ where: { listingId: listing.id } }),
    loadCities(locale),
    getSettings(),
    Promise.resolve(isTranslationEnabled()),
  ]);

  const mainPhotos = photos.filter((p) => !p.roomTypeId).map(toWizardPhoto);
  const values = toWizardValues(listing, user.businessName);
  const fresh =
    listing.status === "DRAFT" &&
    listing.wizardStep <= 1 &&
    listing.updatedAt.getTime() - listing.createdAt.getTime() < 2000;

  const wizardRoomTypes: WizardRoomType[] = roomTypes.map((room) => ({
    id: room.id,
    name: pickLocalized(room.names, values.originalLocale),
    price: Number(room.price),
    currency: (isEnabledCurrency(room.currency) ? room.currency : values.currency) as CurrencyCode,
    pricePeriod: room.pricePeriod,
    maxGuests: room.maxGuests,
    bedsSingle: room.bedsSingle,
    bedsDouble: room.bedsDouble,
    sizeSqm: room.sizeSqm,
    quantity: room.quantity,
    photos: photos.filter((p) => p.roomTypeId === room.id).map(toWizardPhoto),
  }));

  return {
    listing: {
      id: listing.id,
      publicId: listing.publicId,
      status: listing.status,
      wizardStep: listing.wizardStep,
      fresh,
      values,
      photos: mainPhotos,
      roomTypes: wizardRoomTypes,
      blocked: blocks.filter((b) => b.source === "OWNER").map((b) => toInclusiveRange(b.startDate, b.endDate)),
      icalBlocked: blocks.filter((b) => b.source === "ICAL").map((b) => toInclusiveRange(b.startDate, b.endDate)),
      translations: translations
        .filter((t) => isAppLocale(t.locale))
        .map((t) => ({
          locale: t.locale as AppLocale,
          title: t.title,
          description: t.description,
          isAuto: t.isAuto,
          editedByOwner: t.editedByOwner,
          updatedAt: t.updatedAt.toISOString(),
        })),
      icalExportUrl: `${siteConfig.url.replace(/\/+$/, "")}/api/ical/${listing.icalToken}`,
      rulesAccepted: listing.rulesAcceptedAt !== null,
      publicPath: publicPathFor(listing),
      updatedAt: listing.updatedAt.toISOString(),
    },
    context: {
      mode,
      cities,
      user: {
        accountType: user.accountType,
        businessName: user.businessName ?? "",
        phoneNumber: user.phoneNumber,
        phoneVerified: user.phoneNumberVerified,
        email: user.emailIsPlaceholder ? null : user.email,
      },
      listingExpiryDays: settings.listingExpiryDays,
      translationEnabled,
      editToken: mode === "edit" ? signEditToken(listing.id, new Date()) : null,
    },
  };
}

/** The user's drafts for "Continue your draft", newest first. */
export async function loadDrafts(userId: string, locale: AppLocale): Promise<DraftSummary[]> {
  const drafts = await db.listing.findMany({
    where: { ownerId: userId, status: "DRAFT", deletedAt: null },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: {
      id: true,
      publicId: true,
      title: true,
      dealType: true,
      propertyType: true,
      wizardStep: true,
      updatedAt: true,
      city: { select: { names: true } },
      photos: {
        where: { roomTypeId: null },
        orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
        take: 1,
        select: { url: true, storageKey: true },
      },
      _count: { select: { photos: { where: { roomTypeId: null } } } },
    },
  });
  return drafts.map((d) => {
    const kind: ListingKind = { dealType: d.dealType, propertyType: d.propertyType };
    const stepCount = stepsFor(kind).length;
    return {
      id: d.id,
      publicId: d.publicId,
      title: d.title,
      dealType: d.dealType,
      propertyType: d.propertyType,
      cityName: d.city ? pickLocalized(d.city.names, locale) : null,
      wizardStep: Math.min(Math.max(d.wizardStep, 1), stepCount),
      stepCount,
      coverUrl: d.photos[0] ? photoUrl(d.photos[0], "sm") : null,
      photoCount: d._count.photos,
      updatedAt: d.updatedAt.toISOString(),
    };
  });
}

// ─── Clearing fields that do not apply ────────────────────────

/**
 * Database values for fields that do not apply to this deal/property type — applied on
 * publish so stale values from an earlier choice never show publicly.
 */
export function nonApplicableResets(kind: ListingKind): Prisma.ListingUpdateInput {
  const reset: Prisma.ListingUpdateInput = {};
  const off = (field: Parameters<typeof applies>[0]) => !applies(field, kind);
  if (off("rooms")) reset.rooms = null;
  if (off("bedrooms")) reset.bedrooms = null;
  if (off("bathrooms")) reset.bathrooms = null;
  if (off("beds")) Object.assign(reset, { bedsSingle: null, bedsDouble: null, bedsSofa: null });
  if (off("maxGuests")) reset.maxGuests = null;
  if (off("sizeSqm")) reset.sizeSqm = null;
  if (off("floor")) reset.floor = null;
  if (off("elevator")) reset.elevator = null;
  if (off("furnished")) reset.furnished = null;
  if (off("condition")) reset.condition = null;
  if (off("sharedRoomFor")) reset.sharedRoomFor = null;
  if (off("houseRules")) {
    Object.assign(reset, { petsAllowed: null, smokingAllowed: null, quietHoursFrom: null, quietHoursTo: null });
  }
  if (off("checkInOut")) Object.assign(reset, { checkInFrom: null, checkOutUntil: null });
  if (off("partiesAllowed")) reset.partiesAllowed = null;
  if (off("shabbatFeatures")) Object.assign(reset, { shabbatFeatures: [], isShabbatFriendly: false });
  if (off("hotelJewishFeatures")) reset.hotelJewishFeatures = [];
  if (off("kosherCertificate")) Object.assign(reset, { kosherCertName: null, kosherCertPhotoKey: null });
  if (off("deposit")) reset.deposit = null;
  if (off("cleaningFee")) reset.cleaningFee = null;
  if (off("utilities")) Object.assign(reset, { utilitiesIncluded: null, utilitiesEstimate: null });
  if (off("minStay")) reset.minStayNights = null;
  if (off("discounts")) Object.assign(reset, { weeklyDiscountPct: null, monthlyDiscountPct: null });
  if (off("ical")) reset.icalImportUrls = [];
  return reset;
}

/** Host-only Jewish features make no sense on a sale listing. */
export const HOST_FEATURE_KEYS = ["host_keeps_shabbat", "host_speaks_hebrew"] as const;

export function defaultPricePeriod(kind: ListingKind) {
  return DEFAULT_PRICE_PERIOD[kind.dealType];
}
