/**
 * Public listing shapes shared by the server queries and the client components (client-safe).
 *
 * These are PUBLIC data: they never contain the exact address, lat/lng, cadastral code or
 * contact values. `lat`/`lng` are the approximate map point (Listing.approxLat/approxLng).
 */
import type { CurrencyCode } from "@/config/site";
import type { DealType, PricePeriod, PropertyType } from "@/generated/prisma/enums";

export type ListingCardPhoto = {
  /** Medium size (≈800 px) URL. */
  url: string;
  alt: string;
  blurDataUrl?: string;
};

export type ListingCardBadges = {
  /**
   * The owner accepted the Bayit welcome pledge ("welcomes Israelis and Jews") and their version
   * is still valid (settings.pledgeRequiredVersion). The green, most prominent badge.
   */
  welcomes: boolean;
  /** The owner's ID is verified, or the ownership of this property is verified. */
  verified: boolean;
  /**
   * Round 3 (brief 8.3): "ביקרנו במקום", a Bayit team member visited the place (set by the admin;
   * never on demo listings). The first card tag. Missing = false.
   */
  visited?: boolean;
  /** Posted by a business account (hotel, agency…). */
  business: boolean;
  shabbatFriendly: boolean;
  kosherKitchen: boolean;
  /** Walking minutes to the nearest synagogue. */
  synagogueWalkMin: number | null;
  /**
   * Round 2: `synagogueWalkMin` comes from a real, verified place, so the card may show it as a
   * tag ("6 דק׳ לבית כנסת"). Demo places never count. Missing = false.
   */
  synagogueVerified?: boolean;
  /**
   * Round 3 (brief 7.3): walking minutes from the pin to the nearest beach / ski lift, computed
   * from the static OpenStreetMap data (src/lib/geo/walk-targets.ts). Null outside the sea and ski
   * towns or beyond 30 minutes; the card tag shows it at 15 minutes or less. Missing = null.
   */
  seaWalkMinutes?: number | null;
  liftWalkMinutes?: number | null;
  /** The host speaks Hebrew (Jewish feature "host_speaks_hebrew" or the owner's languages). */
  speaksHebrew: boolean;
  /** The host keeps Shabbat (the owner's profile or the Jewish feature "host_keeps_shabbat"). */
  keepsShabbat: boolean;
  /** Hotels and guesthouses: kosher meals or a kosher breakfast. */
  kosherMeals: boolean;
  /** Published within siteConfig.listings.newLabelDays. */
  isNew: boolean;
  /** Price dropped within siteConfig.listings.priceDropLabelDays. */
  priceDropped: boolean;
  /** Featured (paid or hand-picked) — always labeled "Promoted". */
  promoted: boolean;
  demo: boolean;
};

export type ListingCardData = {
  /** Listing.id (use for favorites). */
  id: string;
  /** The short public number ("ID 1234"). */
  publicId: number;
  /** Localized path without the locale prefix: "/listing/1234-sunny-flat-in-vake". */
  href: string;
  /** In the visitor's language when a translation exists, otherwise the original. */
  title: string;
  titleIsAutoTranslated: boolean;
  cityName: string | null;
  neighborhoodName: string | null;
  /** Up to 6 photos, cover first. */
  photos: ListingCardPhoto[];
  /**
   * Optional (card v2): how many photos the listing has in total. When it is more than
   * `photos.length`, the last card slide shows "+N photos".
   */
  photoCount?: number;
  /** Optional (card v2): the floor, shown in the card's facts line (0 = ground floor). */
  floor?: number | null;
  /** Optional (round 2): rooms, in the facts line of monthly rentals and sales ("3 חדרים"). */
  rooms?: number | null;
  /** Optional (round 2): beds (single + double + sofa beds), in the facts line of short stays. */
  beds?: number | null;
  /** In the owner's currency. Null when there is no price. */
  price: number | null;
  currency: CurrencyCode;
  pricePeriod: PricePeriod;
  /** True when `price` is the cheapest room type ("from ₾120"), for hotels. */
  priceIsFrom: boolean;
  priceUsd: number | null;
  dealType: DealType;
  propertyType: PropertyType;
  bedrooms: number | null;
  bathrooms: number | null;
  sizeSqm: number | null;
  maxGuests: number | null;
  badges: ListingCardBadges;
  /** Approximate map point only (never the exact location). */
  lat: number | null;
  lng: number | null;
  isFavorite: boolean;
  /** ISO date-time. */
  publishedAt: string | null;
  /**
   * Optional (round 3, brief 8.1): "★ 4.7 (12)" — the average of the visible reviews and their
   * count, ONLY from 3 reviews on (cardRating in src/lib/reviews). Missing / null = not shown.
   */
  rating?: { average: number; count: number } | null;
};

/** One marker on the search map. */
export type ListingMapPoint = {
  publicId: number;
  /** Approximate. */
  lat: number;
  lng: number;
  price: number | null;
  currency: CurrencyCode;
  pricePeriod: PricePeriod;
  priceIsFrom: boolean;
  title: string;
  href: string;
  /** Small photo URL, or null. */
  photo: string | null;
};

export type ListingSearchResult = {
  items: ListingCardData[];
  total: number;
  /** 1-based; clamped to pageCount. */
  page: number;
  pageSize: number;
  pageCount: number;
};
