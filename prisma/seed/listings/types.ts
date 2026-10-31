import type { AppLocale, Localized } from "@/config/site";
import type { Prisma } from "@/generated/prisma/client";
import type { RiskReason } from "@/lib/risk";
import type { DemoUserKey } from "../users";
import type { PhotoKey } from "./photos";

export type ListingText = { title: string; description: string };

/** Listing columns the data files set directly (everything else is derived by the seed). */
export type ListingFields = Omit<
  Prisma.ListingCreateManyInput,
  | "id"
  | "publicId"
  | "ownerId"
  | "status"
  | "cityId"
  | "neighborhoodId"
  | "address"
  | "lat"
  | "lng"
  | "originalLocale"
  | "title"
  | "description"
  | "searchText"
  | "contactMethods"
  | "isDemo"
  | "publishedAt"
  | "expiresAt"
  | "bumpedAt"
  | "featuredUntil"
  | "createdAt"
  | "approxLat"
  | "approxLng"
  | "priceUsd"
  | "pricePerSqmUsd"
  | "isShabbatFriendly"
>;

export type RoomTypeSeed = {
  names: Localized;
  description: Localized;
  price: number;
  maxGuests: number;
  bedsSingle?: number;
  bedsDouble?: number;
  sizeSqm: number;
  quantity: number;
  photos: PhotoKey[];
};

export type ListingStatusSeed = "LIVE" | "IN_REVIEW" | "NEEDS_CHANGES" | "PAUSED" | "DRAFT" | "EXPIRED" | "RENTED";

export type ListingSeed = {
  /** 1–25 → id "demo-listing-01". */
  n: number;
  owner: DemoUserKey;
  status: ListingStatusSeed;
  city: string;
  neighborhood: string;
  /** Private: the exact point and address (the public map shows an approximate point). */
  lat: number;
  lng: number;
  address: string;
  originalLocale: AppLocale;
  text: Record<AppLocale, ListingText>;
  photos: PhotoKey[];
  fields: ListingFields & Required<Pick<Prisma.ListingCreateManyInput, "dealType" | "propertyType" | "currency" | "pricePeriod">>;
  /**
   * LIVE/PAUSED/RENTED: days since publishing. IN_REVIEW/NEEDS_CHANGES/DRAFT: days since the
   * listing was created. EXPIRED: days since it expired.
   */
  days: number;
  featured?: boolean;
  /** "Owner verified" badge (ownership or business documents checked). */
  ownerVerified?: boolean;
  /** Extra contact channels after WhatsApp (which is always first, with the owner's phone). */
  contact?: { telegram?: string; viber?: boolean; phone?: boolean };
  roomTypes?: RoomTypeSeed[];
  /** Older prices, oldest first, with the days since each change. */
  priceHistory?: { price: number; changedDaysAgo: number }[];
  /** Booked dates: start (days from today) and nights. */
  booked?: { start: number; nights: number }[];
  moderation?: {
    riskScore?: number;
    riskReasons?: RiskReason[];
    moderationReason?: string;
    moderationNote?: string;
    reviewedDaysAgo?: number;
  };
};
