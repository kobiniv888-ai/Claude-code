/**
 * 20 demo listings (isDemo) with local stock photos (public/photos/listings, see
 * scripts/photos/fetch-demo-photos.ts). Each run deletes demo listings of earlier seeds that are
 * gone, then rewrites the listing and its children (translations,
 * photos, room types, price history, booked dates) from the data files, then computes the derived
 * fields with the same code the site uses: approximate map point, the walking time to the sea /
 * ski lifts from the static OpenStreetMap data (brief 7.3), USD prices, Shabbat badge and search
 * text (prepareListingDerivedFields) and walking times to the demo Jewish places
 * (computeListingProximity without OpenStreetMap calls).
 */
import { locales } from "@/config/site";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prepareListingDerivedFields } from "@/lib/listing/lifecycle";
import { computeListingProximity } from "@/lib/nearby";
import { PLEDGE_CURRENT_VERSION } from "@/lib/pledge";
import { georgiaDate, randomInt, seededRandom } from "../lib";
import type { PlaceIds } from "../places";
import { demoUser, demoUserId } from "../users";
import { ALL_LISTINGS, demoPhotoPath, REMOVED_LISTING_NUMBERS } from "./all";
import { blocksOutsideDatePrices, bookingSettingsFor, demoDatePricesFor } from "./booking-settings";
import photoManifest from "./photo-manifest.json";
import { demoPhotoRoom } from "./photos";
import { contactMethodsFor, demoListingId, listingTimeline, priceChangesFor } from "./timeline";
import type { ListingSeed } from "./types";

export { demoListingId } from "./timeline";
export { ALL_LISTINGS } from "./all";

type PhotoManifestEntry = { width: number; height: number; bytes: number; blurDataURL: string };
const PHOTO_MANIFEST = photoManifest as Record<string, PhotoManifestEntry>;

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
  // Demo listings an earlier seed created that are no longer in the data (children cascade).
  await db.listing.deleteMany({ where: { id: { in: REMOVED_LISTING_NUMBERS.map((n) => demoListingId(n)) }, isDemo: true } });
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
    ...bookingSettingsFor(seed),
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
    // Demo hosts accepted the current pledge; the listing keeps a snapshot from when it was submitted.
    welcomePledgeVersion: timeline.rulesAcceptedAt ? PLEDGE_CURRENT_VERSION : null,
    welcomePledgeAt: timeline.rulesAcceptedAt,
    wizardStep: timeline.wizardStep,
    reportCount: 0,
    isDemo: true,
    deletedAt: null,
  } satisfies Prisma.ListingUncheckedUpdateInput;

  await db.listing.upsert({ where: { id }, create: { id, ...data }, update: data });

  for (const locale of locales) {
    const text = seed.text[locale];
    const isOriginal = locale === seed.originalLocale;
    // The demo texts were written by hand in all five languages (round 3, brief 2.4): the other
    // languages show as the owner's own version ("Translated by the owner"), never as automatic.
    const translation = { title: text.title, description: text.description, isOriginal, isAuto: false, editedByOwner: !isOriginal };
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
  await db.datePrice.deleteMany({ where: { listingId: id } });
  // Booked nights (source BOOKING) belong to bookings: the bookings step rewrites the demo ones.
  await db.availabilityBlock.deleteMany({ where: { listingId: id, source: { not: "BOOKING" } } });

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
        weekendPrice: room.weekendPrice ?? null,
        maxGuests: room.maxGuests,
        bedsSingle: room.bedsSingle ?? null,
        bedsDouble: room.bedsDouble ?? null,
        bedsSofa: room.bedsSofa ?? null,
        sizeSqm: room.sizeSqm,
        amenities: room.amenities ?? [],
        quantity: room.quantity,
        active: true,
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
      data: seed.photos.map((key, i) => {
        const url = demoPhotoPath(seed, key);
        const file = PHOTO_MANIFEST[url];
        if (!file) throw new Error(`${id}: photo ${url} is missing — run: npx tsx scripts/photos/fetch-demo-photos.ts`);
        return {
          id: `${id}-photo-${i + 1}`,
          listingId: id,
          roomTypeId: roomOfPhoto.get(key) ?? null,
          room: demoPhotoRoom(key),
          url,
          width: file.width,
          height: file.height,
          bytes: file.bytes,
          blurDataUrl: file.blurDataURL,
          sortOrder: i,
          isCover: i === 0,
          createdAt: timeline.createdAt,
        };
      }),
    });
  }

  if (priceChanges.length > 0) {
    await db.priceChange.createMany({
      data: priceChanges.map((change) => ({ listingId: id, currency: seed.fields.currency, ...change })),
    });
  }

  // Demo holiday prices (round 3, brief 6.3).
  const datePrices = demoDatePricesFor(seed, now);
  if (datePrices.length > 0) await db.datePrice.createMany({ data: datePrices.map((p) => ({ listingId: id, ...p })) });

  if (seed.booked?.length) {
    // A demo owner block never covers the demo holiday price, so its nights stay bookable (they
    // are what the dates sheet and the review page show it with).
    const blocks = blocksOutsideDatePrices(
      seed.booked.map((block) => ({ startDate: georgiaDate(block.start, now), endDate: georgiaDate(block.start + block.nights, now) })),
      datePrices,
    );
    if (blocks.length > 0) {
      await db.availabilityBlock.createMany({ data: blocks.map((block) => ({ listingId: id, ...block, source: "OWNER" as const })) });
    }
  }

  await prepareListingDerivedFields(id);
  await computeListingProximity(id, { useOverpass: false });
}
