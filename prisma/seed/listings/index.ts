/**
 * 25 demo listings (isDemo). Each run rewrites the listing and its children (translations,
 * photos, room types, price history, booked dates) from the data files, then computes the derived
 * fields with the same code the site uses: approximate map point, USD prices, Shabbat badge and
 * search text (prepareListingDerivedFields) and walking times to the demo Jewish places
 * (computeListingProximity without OpenStreetMap calls).
 */
import { locales } from "@/config/site";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prepareListingDerivedFields } from "@/lib/listing/lifecycle";
import { computeListingProximity } from "@/lib/nearby";
import { georgiaDate, randomInt, seededRandom, unsplashPhotoUrl } from "../lib";
import type { PlaceIds } from "../places";
import { demoUser, demoUserId } from "../users";
import { BATUMI_LISTINGS } from "./batumi";
import { KUTAISI_LISTINGS } from "./kutaisi";
import { MOUNTAIN_LISTINGS } from "./mountains";
import { PHOTOS } from "./photos";
import { TBILISI_LISTINGS } from "./tbilisi";
import { contactMethodsFor, demoListingId, listingTimeline, priceChangesFor } from "./timeline";
import type { ListingSeed } from "./types";

export { demoListingId } from "./timeline";

export const ALL_LISTINGS: ListingSeed[] = [...TBILISI_LISTINGS, ...KUTAISI_LISTINGS, ...BATUMI_LISTINGS, ...MOUNTAIN_LISTINGS].sort(
  (a, b) => a.n - b.n,
);

const PUBLISHED_STATUSES = new Set(["LIVE", "PAUSED", "RENTED", "EXPIRED"]);

/** Each owner's first published listing was checked by the demo moderator (first listings always are). */
function firstListingNumbers(listings: ListingSeed[]): Set<number> {
  const age = (l: ListingSeed) => (l.status === "EXPIRED" ? l.days + 60 : l.days);
  const first = new Map<string, ListingSeed>();
  for (const listing of listings) {
    if (!PUBLISHED_STATUSES.has(listing.status)) continue;
    const current = first.get(listing.owner);
    if (!current || age(listing) > age(current)) first.set(listing.owner, listing);
  }
  return new Set([...first.values()].map((l) => l.n));
}

/** Plausible counters for cards; the activity step replaces them for owner #1's listings. */
function counters(seed: ListingSeed): Pick<Prisma.ListingCreateManyInput, "viewCount" | "contactCount" | "saveCount"> {
  if (!PUBLISHED_STATUSES.has(seed.status)) return { viewCount: 0, contactCount: 0, saveCount: 0 };
  const rand = seededRandom(`counters-${seed.n}`);
  const viewCount = Math.max(seed.days, 1) * randomInt(rand, 9, 24);
  return { viewCount, contactCount: Math.round(viewCount / randomInt(rand, 14, 22)), saveCount: Math.round(viewCount / randomInt(rand, 25, 40)) };
}

export async function seedListings(db: PrismaClient, places: PlaceIds, now: Date): Promise<number> {
  const firstListings = firstListingNumbers(ALL_LISTINGS);
  for (const seed of ALL_LISTINGS) {
    await seedListing(db, seed, places, now, firstListings.has(seed.n));
  }
  return ALL_LISTINGS.length;
}

async function seedListing(db: PrismaClient, seed: ListingSeed, places: PlaceIds, now: Date, isFirstListing: boolean) {
  const id = demoListingId(seed.n);
  for (const locale of locales) {
    const text = seed.text[locale];
    if (!text?.title.trim() || !text.description.trim()) throw new Error(`${id}: missing ${locale} title or description`);
  }
  const cityId = places.cities.get(seed.city);
  const neighborhoodId = places.neighborhoods.get(`${seed.city}/${seed.neighborhood}`);
  if (!cityId || !neighborhoodId) throw new Error(`${id}: unknown place ${seed.city}/${seed.neighborhood}`);

  const owner = demoUser(seed.owner);
  const timeline = listingTimeline(seed, now);
  const original = seed.text[seed.originalLocale];
  const contactMethods = contactMethodsFor(seed, owner.phone);
  const priceChanges = priceChangesFor(seed, now);
  const lastChange = priceChanges.at(-1);
  const moderatorId = demoUserId("moderator");
  const reviewedByModerator = seed.status === "NEEDS_CHANGES" || isFirstListing;

  const data = {
    ...seed.fields,
    ...counters(seed),
    ownerId: demoUserId(seed.owner),
    status: seed.status,
    countryCode: "GE",
    cityId,
    neighborhoodId,
    address: seed.address,
    lat: seed.lat,
    lng: seed.lng,
    originalLocale: seed.originalLocale,
    title: original.title,
    description: original.description,
    contactMethods: contactMethods ?? undefined,
    noReplyOnShabbat: owner.keepsShabbat ?? false,
    previousPrice: lastChange && lastChange.newPrice < lastChange.oldPrice ? lastChange.oldPrice : null,
    priceDroppedAt: lastChange && lastChange.newPrice < lastChange.oldPrice ? lastChange.changedAt : null,
    riskScore: seed.moderation?.riskScore ?? (PUBLISHED_STATUSES.has(seed.status) ? 0 : null),
    riskReasons: (seed.moderation?.riskReasons ?? []) as unknown as Prisma.InputJsonValue,
    moderationReason: seed.moderation?.moderationReason ?? null,
    moderationNote: seed.moderation?.moderationNote ?? null,
    reviewedById: reviewedByModerator ? moderatorId : null,
    reviewedAt: timeline.reviewedAt ?? (isFirstListing ? timeline.publishedAt : null),
    ownerVerifiedAt: seed.ownerVerified ? timeline.createdAt : null,
    createdAt: timeline.createdAt,
    publishedAt: timeline.publishedAt,
    expiresAt: timeline.expiresAt,
    expiryWarnedAt: timeline.expiryWarnedAt,
    renewedAt: null,
    bumpedAt: timeline.bumpedAt,
    featuredUntil: timeline.featuredUntil,
    contentUpdatedAt: timeline.contentUpdatedAt,
    rulesAcceptedAt: timeline.rulesAcceptedAt,
    wizardStep: timeline.wizardStep,
    reportCount: 0,
    isDemo: true,
    deletedAt: null,
  } satisfies Prisma.ListingUncheckedUpdateInput;

  await db.listing.upsert({ where: { id }, create: { id, ...data }, update: data });

  for (const locale of locales) {
    const text = seed.text[locale];
    const isOriginal = locale === seed.originalLocale;
    const translation = { title: text.title, description: text.description, isOriginal, isAuto: !isOriginal, editedByOwner: false };
    await db.listingTranslation.upsert({
      where: { listingId_locale: { listingId: id, locale } },
      create: { listingId: id, locale, ...translation },
      update: translation,
    });
  }

  // Children are rebuilt from the data so a re-run never duplicates them.
  await db.listingPhoto.deleteMany({ where: { listingId: id } });
  await db.roomType.deleteMany({ where: { listingId: id } });
  await db.priceChange.deleteMany({ where: { listingId: id } });
  await db.availabilityBlock.deleteMany({ where: { listingId: id } });

  const roomOfPhoto = new Map<string, string>();
  for (const [i, room] of (seed.roomTypes ?? []).entries()) {
    const roomId = `${id}-room-${i + 1}`;
    await db.roomType.create({
      data: {
        id: roomId,
        listingId: id,
        names: room.names,
        description: room.description,
        price: room.price,
        currency: seed.fields.currency,
        pricePeriod: "NIGHT",
        maxGuests: room.maxGuests,
        bedsSingle: room.bedsSingle ?? null,
        bedsDouble: room.bedsDouble ?? null,
        sizeSqm: room.sizeSqm,
        quantity: room.quantity,
        sortOrder: i,
      },
    });
    for (const photo of room.photos) {
      if (!seed.photos.includes(photo)) throw new Error(`${id}: room photo ${photo} is not one of the listing's photos`);
      roomOfPhoto.set(photo, roomId);
    }
  }

  if (seed.photos.length > 0) {
    await db.listingPhoto.createMany({
      data: seed.photos.map((key, i) => ({
        id: `${id}-photo-${i + 1}`,
        listingId: id,
        roomTypeId: roomOfPhoto.get(key) ?? null,
        url: unsplashPhotoUrl(PHOTOS[key]),
        sortOrder: i,
        isCover: i === 0,
        createdAt: timeline.createdAt,
      })),
    });
  }

  if (priceChanges.length > 0) {
    await db.priceChange.createMany({
      data: priceChanges.map((change) => ({ listingId: id, currency: seed.fields.currency, ...change })),
    });
  }

  if (seed.booked?.length) {
    await db.availabilityBlock.createMany({
      data: seed.booked.map((block) => ({
        listingId: id,
        startDate: georgiaDate(block.start, now),
        endDate: georgiaDate(block.start + block.nights, now),
        source: "OWNER" as const,
      })),
    });
  }

  await prepareListingDerivedFields(id);
  await computeListingProximity(id, { useOverpass: false });
}
