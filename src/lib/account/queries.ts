import "server-only";
import { safeDisplayName } from "@/lib/auth/first-name";
import { settingsFirstName } from "./greeting";
import type { AppLocale, CurrencyCode } from "@/config/site";
import type { Prisma } from "@/generated/prisma/client";
import type { AccountType, DealType, ListingStatus, Locale, PricePeriod, VerificationStatus, VerificationType } from "@/generated/prisma/enums";
import { pickLocalized } from "@/i18n/locale";
import { authProviders } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { isPlaceholderEmail } from "@/lib/email";
import { CARD_OWNER_SELECT, listingCardSelect, toListingCard } from "@/lib/listing/mappers";
import type { ListingCardData } from "@/lib/listing/types";
import { listingPath } from "@/lib/listing/urls";
import { photoUrl } from "@/lib/media";
import { getSettings } from "@/lib/settings";
import {
  countsByFilter,
  EXPIRING_SOON_DAYS,
  OWNER_VISIBLE_STATUSES,
  statusesForFilter,
  type ListingFilter,
} from "./listing-status";
import { parseNotificationPrefs, type NotificationPrefs } from "./settings-schema";
import { latestRequest, verificationProgress, type RequestSummary, type VerificationProgress } from "./verification";
import { isHostAccount } from "@/lib/auth/phone-check-policy";

/**
 * Read-side of the "My account" dashboard (server-only). Every query is scoped to the signed-in
 * user's id — callers pass `user.id` from requireUser(), never an id from the request.
 */

const DAY_MS = 86_400_000;

type DecimalLike = { toString(): string } | null;

function money(value: DecimalLike): number | null {
  if (value === null) return null;
  const n = Number(value.toString());
  return Number.isFinite(n) && n > 0 ? n : null;
}

const coverPhoto = {
  orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
  take: 1,
  select: { url: true, storageKey: true },
} satisfies Prisma.Listing$photosArgs;

const cheapestRoom = {
  orderBy: [{ priceUsd: { sort: "asc", nulls: "last" } }, { sortOrder: "asc" }],
  take: 1,
  select: { price: true, currency: true, pricePeriod: true },
} satisfies Prisma.Listing$roomTypesArgs;

function priceOf(row: {
  price: DecimalLike;
  currency: string;
  pricePeriod: PricePeriod;
  roomTypes: { price: DecimalLike; currency: string; pricePeriod: PricePeriod }[];
}): { amount: number | null; currency: CurrencyCode; period: PricePeriod; from: boolean } {
  const own = money(row.price);
  if (own !== null) return { amount: own, currency: row.currency as CurrencyCode, period: row.pricePeriod, from: false };
  const room = row.roomTypes[0];
  const roomPrice = room ? money(room.price) : null;
  if (room && roomPrice !== null) {
    return { amount: roomPrice, currency: room.currency as CurrencyCode, period: room.pricePeriod, from: true };
  }
  return { amount: null, currency: row.currency as CurrencyCode, period: row.pricePeriod, from: false };
}

const ownerVisible = (ownerId: string): Prisma.ListingWhereInput => ({
  ownerId,
  deletedAt: null,
  status: { in: [...OWNER_VISIBLE_STATUSES] },
});

async function statusCounts(ownerId: string): Promise<Partial<Record<ListingStatus, number>>> {
  const rows = await db.listing.groupBy({ by: ["status"], where: ownerVisible(ownerId), _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
}

// ─── My listings ──────────────────────────────────────────────

export type MyListing = {
  id: string;
  publicId: number;
  status: ListingStatus;
  dealType: DealType;
  /** The owner's own title (empty for an untouched draft). */
  title: string;
  href: string;
  coverUrl: string | null;
  place: string | null;
  price: { amount: number | null; currency: CurrencyCode; period: PricePeriod; from: boolean };
  views: number;
  contacts: number;
  saves: number;
  expiresAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  moderationReason: string | null;
  moderationNote: string | null;
  wizardStep: number;
  ownerVerified: boolean;
};

function myListingSelect() {
  return {
    id: true,
    publicId: true,
    status: true,
    dealType: true,
    title: true,
    price: true,
    currency: true,
    pricePeriod: true,
    viewCount: true,
    contactCount: true,
    saveCount: true,
    expiresAt: true,
    publishedAt: true,
    updatedAt: true,
    moderationReason: true,
    moderationNote: true,
    wizardStep: true,
    ownerVerifiedAt: true,
    city: { select: { names: true } },
    neighborhood: { select: { names: true } },
    photos: coverPhoto,
    roomTypes: cheapestRoom,
  } satisfies Prisma.ListingSelect;
}

type MyListingRow = Prisma.ListingGetPayload<{ select: ReturnType<typeof myListingSelect> }>;

function toMyListing(row: MyListingRow, locale: AppLocale): MyListing {
  const place = [row.neighborhood ? pickLocalized(row.neighborhood.names, locale) : "", row.city ? pickLocalized(row.city.names, locale) : ""]
    .filter(Boolean)
    .join(" · ");
  const photo = row.photos[0];
  return {
    id: row.id,
    publicId: row.publicId,
    status: row.status,
    dealType: row.dealType,
    title: row.title.trim(),
    href: listingPath(row.publicId, row.title),
    coverUrl: photo ? photoUrl(photo, "sm") : null,
    place: place || null,
    price: priceOf(row),
    views: row.viewCount,
    contacts: row.contactCount,
    saves: row.saveCount,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    moderationReason: row.moderationReason,
    moderationNote: row.moderationNote?.trim() || null,
    wizardStep: row.wizardStep,
    ownerVerified: !!row.ownerVerifiedAt,
  };
}

export const MY_LISTINGS_PAGE_SIZE = 20;

export async function getMyListings(
  ownerId: string,
  opts: { filter: ListingFilter; page: number; locale: AppLocale },
): Promise<{ items: MyListing[]; counts: Record<ListingFilter, number>; page: number; pageCount: number; total: number }> {
  const counts = countsByFilter(await statusCounts(ownerId));
  const total = counts[opts.filter];
  const pageCount = Math.max(1, Math.ceil(total / MY_LISTINGS_PAGE_SIZE));
  const page = Math.min(Math.max(1, opts.page), pageCount);
  const rows = await db.listing.findMany({
    where: { ...ownerVisible(ownerId), status: { in: [...statusesForFilter(opts.filter)] } },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    skip: (page - 1) * MY_LISTINGS_PAGE_SIZE,
    take: MY_LISTINGS_PAGE_SIZE,
    select: myListingSelect(),
  });
  return { items: rows.map((row) => toMyListing(row, opts.locale)), counts, page, pageCount, total };
}

/** One of the user's own listings (any status but deleted) — for the stats page. */
export async function getOwnListing(ownerId: string, listingId: string, locale: AppLocale): Promise<MyListing | null> {
  const row = await db.listing.findFirst({ where: { id: listingId, ...ownerVisible(ownerId) }, select: myListingSelect() });
  return row ? toMyListing(row, locale) : null;
}

// ─── Overview ─────────────────────────────────────────────────

export type AttentionItem =
  | { kind: "needsChanges"; listingId: string; publicId: number; title: string; reason: string | null; note: string | null }
  | { kind: "expiring"; listingId: string; publicId: number; title: string; expiresAt: string }
  | { kind: "expired"; count: number }
  | { kind: "drafts"; count: number }
  | { kind: "ticket"; number: number; subject: string };

export type AccountOverview = {
  counts: Record<ListingFilter, number>;
  attention: AttentionItem[];
  favorites: number;
  openTickets: number;
  progress: VerificationProgress;
};

export async function getAccountOverview(user: {
  id: string;
  phoneNumberVerified: boolean;
  idVerifiedAt: Date | null;
}): Promise<AccountOverview> {
  const now = new Date();
  const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * DAY_MS);
  const [byStatus, needsChanges, expiring, waitingTickets, openTickets, favorites, requests, ownerVerified] = await Promise.all([
    statusCounts(user.id),
    db.listing.findMany({
      where: { ownerId: user.id, deletedAt: null, status: "NEEDS_CHANGES" },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, publicId: true, title: true, moderationReason: true, moderationNote: true },
    }),
    db.listing.findMany({
      where: { ownerId: user.id, deletedAt: null, status: "LIVE", expiresAt: { gt: now, lte: soon } },
      orderBy: { expiresAt: "asc" },
      take: 5,
      select: { id: true, publicId: true, title: true, expiresAt: true },
    }),
    db.ticket.findMany({
      where: { userId: user.id, status: "WAITING_FOR_USER" },
      orderBy: { lastMessageAt: "desc" },
      take: 5,
      select: { number: true, subject: true },
    }),
    db.ticket.count({ where: { userId: user.id, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_USER"] } } }),
    db.favorite.count({ where: { userId: user.id } }),
    db.verificationRequest.findMany({
      where: { userId: user.id, type: { in: ["ID", "OWNERSHIP"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, type: true, status: true, listingId: true, createdAt: true, reviewedAt: true, decisionReason: true },
    }),
    db.listing.count({ where: { ownerId: user.id, deletedAt: null, ownerVerifiedAt: { not: null } } }),
  ]);

  const counts = countsByFilter(byStatus);
  const attention: AttentionItem[] = [
    ...needsChanges.map((l): AttentionItem => ({
      kind: "needsChanges",
      listingId: l.id,
      publicId: l.publicId,
      title: l.title.trim(),
      reason: l.moderationReason,
      note: l.moderationNote?.trim() || null,
    })),
    ...expiring.map((l): AttentionItem => ({
      kind: "expiring",
      listingId: l.id,
      publicId: l.publicId,
      title: l.title.trim(),
      expiresAt: l.expiresAt!.toISOString(),
    })),
    ...waitingTickets.map((t): AttentionItem => ({ kind: "ticket", number: t.number, subject: t.subject })),
  ];
  if (counts.expired > 0) attention.push({ kind: "expired", count: counts.expired });
  if (counts.drafts > 0) attention.push({ kind: "drafts", count: counts.drafts });

  const listingsToVerify = counts.all - counts.drafts;
  return {
    counts,
    attention,
    favorites,
    openTickets,
    progress: verificationProgress({
      phoneVerified: user.phoneNumberVerified,
      isHost: isHostAccount(counts.all),
      idVerified: !!user.idVerifiedAt,
      idLatest: latestRequest(requests, "ID"),
      hasListings: listingsToVerify > 0,
      ownerVerifiedListings: ownerVerified,
      ownershipLatest: latestRequest(requests, "OWNERSHIP"),
    }),
  };
}

// ─── Favorites ────────────────────────────────────────────────

export type FavoriteItem =
  | { available: true; listingId: string; note: string | null; savedAt: string; card: ListingCardData }
  | { available: false; listingId: string; note: string | null; savedAt: string; title: string; publicId: number };

export const FAVORITES_LIMIT = 300;

export async function getFavoriteItems(userId: string, locale: AppLocale): Promise<FavoriteItem[]> {
  const settings = await getSettings();
  const now = new Date();
  const base = listingCardSelect(locale);
  const rows = await db.favorite.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: FAVORITES_LIMIT,
    select: {
      note: true,
      createdAt: true,
      listing: {
        select: {
          ...base,
          status: true,
          deletedAt: true,
          expiresAt: true,
          owner: { select: { ...CARD_OWNER_SELECT, status: true, deletedAt: true } },
        },
      },
    },
  });
  const featured = new Set(settings.featuredListingIds);
  return rows.map((row): FavoriteItem => {
    const l = row.listing;
    const visible =
      l.status === "LIVE" &&
      !l.deletedAt &&
      (!l.expiresAt || l.expiresAt > now) &&
      (settings.demoDataVisible || !l.isDemo) &&
      !l.owner.deletedAt &&
      (l.owner.status === "ACTIVE" || l.owner.status === "WARNED");
    const common = { listingId: l.id, note: row.note, savedAt: row.createdAt.toISOString() };
    if (!visible) return { ...common, available: false, title: l.title.trim(), publicId: l.publicId };
    const card = toListingCard(l, {
      locale,
      now,
      featuredIds: featured,
      favoriteIds: new Set([l.id]),
      pledgeRequiredVersion: settings.pledgeRequiredVersion,
    });
    return { ...common, available: true, card };
  });
}

// ─── Verification center ──────────────────────────────────────

export type VerificationListing = {
  id: string;
  publicId: number;
  title: string;
  status: ListingStatus;
  ownerVerified: boolean;
  cadastralCode: string | null;
};

export type VerificationRequestView = {
  id: string;
  type: VerificationType;
  status: VerificationStatus;
  listingId: string | null;
  createdAt: string;
  reviewedAt: string | null;
  decisionReason: string | null;
  documentsDeleted: boolean;
};

export type VerificationCenter = {
  phoneNumber: string | null;
  phoneVerified: boolean;
  /** Has a listing, drafts included: may be offered the SMS phone check here (phone-check-policy). */
  isHost: boolean;
  idVerifiedAt: string | null;
  businessVerifiedAt: string | null;
  accountType: AccountType;
  requests: VerificationRequestView[];
  listings: VerificationListing[];
};

export async function getVerificationCenter(userId: string): Promise<VerificationCenter> {
  const [user, requests, listings, listingCount] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { phoneNumber: true, phoneNumberVerified: true, idVerifiedAt: true, businessVerifiedAt: true, accountType: true },
    }),
    db.verificationRequest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        type: true,
        status: true,
        listingId: true,
        createdAt: true,
        reviewedAt: true,
        decisionReason: true,
        documentsDeletedAt: true,
      },
    }),
    db.listing.findMany({
      where: { ownerId: userId, deletedAt: null, status: { in: OWNER_VISIBLE_STATUSES.filter((s) => s !== "DRAFT") } },
      orderBy: [{ updatedAt: "desc" }],
      take: 100,
      select: { id: true, publicId: true, title: true, status: true, ownerVerifiedAt: true, cadastralCode: true },
    }),
    db.listing.count({ where: { ownerId: userId, deletedAt: null } }),
  ]);
  return {
    phoneNumber: user.phoneNumber,
    phoneVerified: !!user.phoneNumber && user.phoneNumberVerified === true,
    isHost: isHostAccount(listingCount),
    idVerifiedAt: user.idVerifiedAt?.toISOString() ?? null,
    businessVerifiedAt: user.businessVerifiedAt?.toISOString() ?? null,
    accountType: user.accountType,
    requests: requests.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      listingId: r.listingId,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      decisionReason: r.decisionReason?.trim() || null,
      documentsDeleted: !!r.documentsDeletedAt,
    })),
    listings: listings.map((l) => ({
      id: l.id,
      publicId: l.publicId,
      title: l.title.trim(),
      status: l.status,
      ownerVerified: !!l.ownerVerifiedAt,
      cadastralCode: l.cadastralCode,
    })),
  };
}

/** Newest-first requests as summaries (for the pure helpers). */
export function toSummaries(requests: readonly VerificationRequestView[]): RequestSummary[] {
  return requests.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    listingId: r.listingId,
    createdAt: new Date(r.createdAt),
    reviewedAt: r.reviewedAt ? new Date(r.reviewedAt) : null,
    decisionReason: r.decisionReason,
  }));
}

// ─── Settings ─────────────────────────────────────────────────

export type ConnectedProvider = "google" | "apple";

export type AccountSettingsData = {
  name: string;
  /** Null until the first-name step; the form starts from the first word of a real name. */
  firstName: string | null;
  image: string | null;
  bio: string | null;
  spokenLanguages: string[];
  keepsShabbat: boolean;
  accountType: AccountType;
  businessName: string | null;
  /** The login email, or null for phone-only accounts (placeholder). */
  loginEmail: string | null;
  contactEmail: string | null;
  phoneNumber: string | null;
  phoneVerified: boolean;
  locale: Locale;
  currency: CurrencyCode | null;
  showHebrewDates: boolean;
  notifications: NotificationPrefs;
  twoFactorEnabled: boolean;
  /** Social providers switched on in this deployment. */
  providers: ConnectedProvider[];
  /** Providers linked to this account. */
  linked: ConnectedProvider[];
  /** Other ways to sign in besides social accounts (verified phone, password). */
  hasPhoneLogin: boolean;
  hasPasswordLogin: boolean;
};

export async function getAccountSettings(userId: string): Promise<AccountSettingsData> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      name: true,
      image: true,
      firstName: true,
      isDemo: true,
      bio: true,
      spokenLanguages: true,
      keepsShabbat: true,
      accountType: true,
      businessName: true,
      email: true,
      contactEmail: true,
      phoneNumber: true,
      phoneNumberVerified: true,
      locale: true,
      currency: true,
      showHebrewDates: true,
      notificationPrefs: true,
      twoFactorEnabled: true,
      accounts: { select: { providerId: true } },
    },
  });
  const providers = (["google", "apple"] as const).filter((p) => authProviders[p]);
  const linkedIds = new Set(user.accounts.map((a) => a.providerId));
  return {
    name: safeDisplayName(user.name) ?? "",
    // Demo accounts: "Noa", never the "Demo" of "Demo Guest — Noa" (settingsFirstName).
    firstName: settingsFirstName(user),
    image: user.image,
    bio: user.bio,
    spokenLanguages: user.spokenLanguages,
    keepsShabbat: user.keepsShabbat,
    accountType: user.accountType,
    businessName: user.businessName,
    loginEmail: isPlaceholderEmail(user.email) ? null : user.email,
    contactEmail: user.contactEmail,
    phoneNumber: user.phoneNumber,
    phoneVerified: !!user.phoneNumber && user.phoneNumberVerified === true,
    locale: user.locale,
    currency: (user.currency as CurrencyCode | null) ?? null,
    showHebrewDates: user.showHebrewDates,
    notifications: parseNotificationPrefs(user.notificationPrefs),
    twoFactorEnabled: user.twoFactorEnabled,
    providers,
    linked: (["google", "apple"] as const).filter((p) => linkedIds.has(p)),
    hasPhoneLogin: !!user.phoneNumber && user.phoneNumberVerified === true,
    hasPasswordLogin: linkedIds.has("credential"),
  };
}
