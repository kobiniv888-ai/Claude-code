import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ListingStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { ContactMethod } from "@/lib/listing/fields";
import { CONTACT_CHANNELS } from "@/lib/listing/fields";
import { contentChangedSinceCheck } from "@/lib/listing/lifecycle";
import { DUPLICATE_PHOTO_MAX_DISTANCE, parseRiskReasons } from "@/lib/risk";
import { canSeePhone, canSeeReporter, staffContactValue, type StaffViewer } from "../staff-visibility";
import { accountPhoneFor, coverPhotoSelect, ownerBadgeSelect, sharedDeviceAccounts, staffNames } from "./shared";

/** The moderation queue and the listing review page (server-only). */

export const MODERATION_TABS = ["in_review", "hidden", "needs_changes", "approved"] as const;
export type ModerationTab = (typeof MODERATION_TABS)[number];

export const MODERATION_SORTS = ["risk", "oldest", "newest"] as const;
export type ModerationSort = (typeof MODERATION_SORTS)[number];

/** "Recently approved" looks back this many days. */
export const RECENTLY_APPROVED_DAYS = 14;
export const MODERATION_PAGE_SIZE = 25;

function tabWhere(tab: ModerationTab, now: Date): Prisma.ListingWhereInput {
  switch (tab) {
    case "in_review":
      return { status: "IN_REVIEW" };
    case "hidden":
      return { status: "HIDDEN" };
    case "needs_changes":
      return { status: "NEEDS_CHANGES" };
    case "approved":
      return {
        status: "LIVE",
        reviewedById: { not: null },
        reviewedAt: { gte: new Date(now.getTime() - RECENTLY_APPROVED_DAYS * 24 * 3600 * 1000) },
      };
  }
}

function tabOrder(tab: ModerationTab, sort: ModerationSort): Prisma.ListingOrderByWithRelationInput[] {
  if (tab === "approved" && sort !== "risk") {
    return [{ reviewedAt: sort === "oldest" ? "asc" : "desc" }];
  }
  if (sort === "risk") return [{ riskScore: { sort: "desc", nulls: "last" } }, { updatedAt: "asc" }];
  return [{ updatedAt: sort === "oldest" ? "asc" : "desc" }];
}

const queueSelect = {
  id: true,
  publicId: true,
  title: true,
  status: true,
  dealType: true,
  propertyType: true,
  price: true,
  currency: true,
  pricePeriod: true,
  riskScore: true,
  riskReasons: true,
  publishedAt: true,
  updatedAt: true,
  reviewedAt: true,
  reportCount: true,
  isDemo: true,
  city: { select: { names: true } },
  photos: coverPhotoSelect,
  owner: {
    select: {
      ...ownerBadgeSelect,
      _count: { select: { listings: { where: { publishedAt: { not: null } } } } },
    },
  },
  reviewedBy: { select: { name: true } },
  _count: { select: { reports: { where: { status: "OPEN" } } } },
} satisfies Prisma.ListingSelect;

export type QueueRow = Prisma.ListingGetPayload<{ select: typeof queueSelect }>;

export async function getModerationTabCounts(now: Date = new Date()): Promise<Record<ModerationTab, number>> {
  const counts = await Promise.all(MODERATION_TABS.map((tab) => db.listing.count({ where: tabWhere(tab, now) })));
  return Object.fromEntries(MODERATION_TABS.map((tab, i) => [tab, counts[i]])) as Record<ModerationTab, number>;
}

export async function getModerationQueue(tab: ModerationTab, sort: ModerationSort, page: number) {
  const now = new Date();
  const where = tabWhere(tab, now);
  const total = await db.listing.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / MODERATION_PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = await db.listing.findMany({
    where,
    orderBy: tabOrder(tab, sort),
    skip: (current - 1) * MODERATION_PAGE_SIZE,
    take: MODERATION_PAGE_SIZE,
    select: queueSelect,
  });
  return {
    total,
    page: current,
    rows: rows.map((row) => ({
      ...row,
      reasons: parseRiskReasons(row.riskReasons),
      /** No other published listing: this is (or was) the account's first. */
      firstListing: row.owner._count.listings === 0 || (row.owner._count.listings === 1 && row.publishedAt !== null),
    })),
  };
}

/** The next listing waiting in review after this one (highest risk first). */
export async function nextInReview(currentId: string): Promise<{ id: string; publicId: number } | null> {
  return db.listing.findFirst({
    where: { status: "IN_REVIEW", id: { not: currentId } },
    orderBy: [{ riskScore: { sort: "desc", nulls: "last" } }, { updatedAt: "asc" }],
    select: { id: true, publicId: true },
  });
}

// ─── Review page ──────────────────────────────────────────────

export function parseContactMethods(value: unknown): ContactMethod[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item): ContactMethod[] => {
      if (!item || typeof item !== "object") return [];
      const { channel, value: v, order } = item as Record<string, unknown>;
      if (typeof channel !== "string" || !(CONTACT_CHANNELS as readonly string[]).includes(channel)) return [];
      if (typeof v !== "string" || !v.trim()) return [];
      return [{ channel: channel as ContactMethod["channel"], value: v.trim(), order: typeof order === "number" ? order : 0 }];
    })
    .sort((a, b) => a.order - b.order);
}

export type DuplicatePhotoMatch = {
  photoId: string;
  photoUrl: string;
  photoStorageKey: string | null;
  otherPhotoId: string;
  otherUrl: string;
  otherStorageKey: string | null;
  distance: number;
  otherListingId: string;
  otherPublicId: number;
  otherTitle: string;
  otherStatus: ListingStatus;
  otherOwnerId: string;
  otherOwnerName: string;
};

/** Photos of other listings that look the same (perceptual-hash distance ≤ 6 of 64 bits). */
export async function findDuplicatePhotos(listingId: string, limit = 40): Promise<DuplicatePhotoMatch[]> {
  return db.$queryRaw<DuplicatePhotoMatch[]>`
    WITH mine AS MATERIALIZED (
      SELECT p."id", p."phash", p."url", p."storageKey"
      FROM "ListingPhoto" p
      WHERE p."listingId" = ${listingId} AND p."phash" ~ '^[0-9a-f]{16}$'
    )
    SELECT m."id" AS "photoId", m."url" AS "photoUrl", m."storageKey" AS "photoStorageKey",
           o."id" AS "otherPhotoId", o."url" AS "otherUrl", o."storageKey" AS "otherStorageKey",
           bit_count(('x' || o."phash")::bit(64) # ('x' || m."phash")::bit(64))::int AS "distance",
           l."id" AS "otherListingId", l."publicId" AS "otherPublicId", l."title" AS "otherTitle",
           l."status"::text AS "otherStatus", l."ownerId" AS "otherOwnerId", u."name" AS "otherOwnerName"
    FROM mine m
    JOIN "ListingPhoto" o
      ON o."listingId" <> ${listingId}
     AND o."phash" ~ '^[0-9a-f]{16}$'
     AND bit_count(('x' || o."phash")::bit(64) # ('x' || m."phash")::bit(64)) <= ${DUPLICATE_PHOTO_MAX_DISTANCE}
    JOIN "Listing" l ON l."id" = o."listingId"
    JOIN "User" u ON u."id" = l."ownerId"
    ORDER BY "distance" ASC, l."publicId" ASC
    LIMIT ${limit}`;
}

const reviewSelect = {
  id: true,
  publicId: true,
  ownerId: true,
  status: true,
  dealType: true,
  propertyType: true,
  countryCode: true,
  address: true,
  lat: true,
  lng: true,
  approxLat: true,
  approxLng: true,
  originalLocale: true,
  title: true,
  description: true,
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
  cadastralCode: true,
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
  price: true,
  currency: true,
  pricePeriod: true,
  priceUsd: true,
  deposit: true,
  cleaningFee: true,
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
  contactMethods: true,
  contactHoursFrom: true,
  contactHoursTo: true,
  noReplyOnShabbat: true,
  viewCount: true,
  contactCount: true,
  saveCount: true,
  reportCount: true,
  riskScore: true,
  riskReasons: true,
  moderationReason: true,
  moderationNote: true,
  reviewedAt: true,
  ownerVerifiedAt: true,
  propertyVerifiedAt: true,
  publishedAt: true,
  expiresAt: true,
  contentUpdatedAt: true,
  lastCheckedAt: true,
  isDemo: true,
  createdAt: true,
  updatedAt: true,
  city: { select: { names: true, slug: true } },
  neighborhood: { select: { names: true } },
  reviewedBy: { select: { id: true, name: true } },
  photos: {
    orderBy: [{ sortOrder: "asc" }],
    select: { id: true, url: true, storageKey: true, width: true, height: true, isCover: true, alt: true, phash: true },
  },
  translations: {
    orderBy: { locale: "asc" },
    select: { locale: true, title: true, description: true, isOriginal: true, isAuto: true, editedByOwner: true, updatedAt: true },
  },
  roomTypes: {
    orderBy: { sortOrder: "asc" },
    select: { id: true, names: true, price: true, currency: true, pricePeriod: true, maxGuests: true, quantity: true },
  },
  owner: {
    select: {
      ...ownerBadgeSelect,
      email: true,
      locale: true,
      idVerifiedById: true,
      lastSeenAt: true,
      suspendedUntil: true,
      statusReason: true,
    },
  },
} satisfies Prisma.ListingSelect;

export type ReviewListing = Prisma.ListingGetPayload<{ select: typeof reviewSelect }>;

/**
 * The listing review page. Who sent each report about it is ADMIN only (Q12, ../staff-visibility.ts),
 * and so are phone numbers (founder's answer (c)): the owner's account phone (`ownerPhone`) and the
 * phone numbers among the listing's contact channels (`contacts`) reach other staff as their last
 * 2 digits only; the raw `contactMethods` value is left out of `listing` for them.
 */
export async function getListingForReview(id: string, viewer: StaffViewer) {
  const row = await db.listing.findUnique({ where: { id }, select: reviewSelect });
  if (!row) return null;
  const listing = canSeePhone(viewer) ? row : { ...row, contactMethods: null };

  const ownerId = listing.ownerId;
  const [checksStale, duplicates, otherListings, reports, ownerReportsAgainst, ownerListingReports, devices, notes, staff, idRequest, ownerPhone] =
    await Promise.all([
      // The host saved a change after the automatic checks ran: the precheck box may be out of date.
      listing.riskScore === null ? Promise.resolve(false) : contentChangedSinceCheck(row).catch(() => true),
      findDuplicatePhotos(listing.id),
      db.listing.findMany({
        where: { ownerId, id: { not: listing.id } },
        orderBy: { updatedAt: "desc" },
        take: 12,
        select: { id: true, publicId: true, title: true, status: true, riskScore: true, photos: coverPhotoSelect },
      }),
      db.report.findMany({
        where: { listingId: listing.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          reason: true,
          details: true,
          status: true,
          resolution: true,
          createdAt: true,
          handledAt: true,
          reporterId: true,
          handledBy: { select: { name: true } },
        },
      }),
      db.report.count({ where: { targetUserId: ownerId } }),
      db.report.count({ where: { listing: { ownerId } } }),
      sharedDeviceAccounts(ownerId),
      db.adminNote.findMany({
        where: { subjectUserId: ownerId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, body: true, createdAt: true, author: { select: { name: true } } },
      }),
      staffNames([listing.owner.idVerifiedById]),
      db.verificationRequest.findFirst({
        where: { userId: ownerId, OR: [{ listingId: listing.id }, { type: "ID" }], status: "PENDING" },
        select: { id: true, type: true },
      }),
      accountPhoneFor(viewer, ownerId),
    ]);

  const senderIds = [...new Set(reports.map((r) => r.reporterId).filter((v): v is string => !!v))];
  const senders =
    canSeeReporter(viewer) && senderIds.length
      ? new Map((await db.user.findMany({ where: { id: { in: senderIds } }, select: { id: true, name: true } })).map((u) => [u.id, u]))
      : new Map<string, { id: string; name: string }>();

  return {
    listing,
    checksStale,
    reasons: parseRiskReasons(listing.riskReasons),
    /** Phone numbers among them: "••• ••• ••45" for staff other than an ADMIN (`withheld`). */
    contacts: parseContactMethods(row.contactMethods).map((c) => ({ ...c, ...staffContactValue(viewer, c.channel, c.value) })),
    ownerPhone,
    duplicates,
    otherListings,
    reports: reports.map(({ reporterId, ...r }) => ({ ...r, reporter: reporterId ? (senders.get(reporterId) ?? null) : null })),
    reporterWithheld: !canSeeReporter(viewer),
    ownerReportsAgainst,
    ownerListingReports,
    devices,
    notes,
    idVerifiedBy: listing.owner.idVerifiedById ? (staff.get(listing.owner.idVerifiedById) ?? null) : null,
    pendingVerification: idRequest,
  };
}
