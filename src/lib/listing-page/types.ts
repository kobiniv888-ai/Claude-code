/**
 * Data of the listing page and the owner profile (client-safe types).
 *
 * PUBLIC data only: never the exact address, lat/lng, cadastral code, the kosher certificate
 * photo, contact values or the owner's phone/email. Contact channels are listed by type only;
 * the values come from the revealContact() server action.
 */
import type { AppLocale, CurrencyCode } from "@/config/site";
import type {
  BuildingAge,
  DealType,
  HeatingType,
  KitchenKosher,
  ListingStatus,
  PhotoRoom,
  PricePeriod,
  PropertyCondition,
  PropertyType,
  SharedRoomFor,
  ViewType,
} from "@/generated/prisma/enums";
import type { ContactChannelKey } from "@/lib/listing/fields";
import type { NearbyInfo } from "@/lib/nearby";

export type PagePhoto = {
  id: string;
  /** Large (≈1600 px) for the lightbox. */
  large: string;
  /** Medium (≈800 px) for the mosaic and carousels. */
  medium: string;
  alt: string;
  blurDataUrl: string | null;
  /** Which room the photo shows (the host's optional label; round 3, brief 6.1). */
  room?: PhotoRoom | null;
};

export type OwnerBadges = {
  phoneVerified: boolean;
  idVerified: boolean;
  business: boolean;
  businessVerified: boolean;
  keepsShabbat: boolean;
  demo: boolean;
};

export type OwnerSummary = {
  id: string;
  /** Business name for business accounts, else the person's name. */
  name: string;
  image: string | null;
  badges: OwnerBadges;
  /** ISO 639-1 codes. */
  languages: string[];
  /** The Bayit welcome pledge version the owner accepted (null = never); see @/lib/pledge/pledge. */
  welcomePledgeVersion: number | null;
  /** ISO date-time. */
  memberSince: string;
  avgReplyMinutes: number | null;
  replyRate: number | null;
  timezone: string;
};

export type RoomTypeData = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: CurrencyCode;
  pricePeriod: PricePeriod;
  /** Friday and Saturday nights (null = the nightly price). */
  weekendPrice?: number | null;
  maxGuests: number | null;
  bedsSingle: number | null;
  bedsDouble: number | null;
  bedsSofa?: number | null;
  sizeSqm: number | null;
  /** The room's own amenity keys (src/lib/listing/fields.ts). */
  amenities?: string[];
  photos: PagePhoto[];
  /**
   * Hotels that take bookings (round 3, founder's answer 3): the number of rooms of this type and
   * the calendar's nights with fewer free (src/lib/booking/room-availability.ts). Unset for room
   * types guests can't book here.
   */
  quantity?: number;
  segments?: { start: string; end: string; free: number }[];
};

export type CancellationPolicyKey = "FLEXIBLE" | "MODERATE" | "STRICT";

export type PriceChangeData = { oldPrice: number; newPrice: number; currency: CurrencyCode; changedAt: string };

export type LocalizedText = {
  /** In the visitor's language when a translation exists, otherwise the original. */
  shown: string;
  original: string;
};

export type ListingPageData = {
  id: string;
  publicId: number;
  status: ListingStatus;
  isDemo: boolean;
  dealType: DealType;
  propertyType: PropertyType;
  title: LocalizedText;
  description: LocalizedText;
  /** The visible text is a translation (the "Show original" switch appears). */
  isTranslated: boolean;
  /** …made by the translation service (not edited by the owner). */
  isAutoTranslated: boolean;
  originalLocale: AppLocale;
  city: { slug: string; name: string; lat: number; lng: number; timezone: string } | null;
  neighborhoodName: string | null;
  /** ISO 3166-1 alpha-2 (Listing.countryCode); missing on old fixtures = src/config/countries.ts DEFAULT_COUNTRY. */
  countryCode?: string;
  /** Approximate map point only. */
  approx: { lat: number; lng: number } | null;

  price: number | null;
  currency: CurrencyCode;
  pricePeriod: PricePeriod;
  /** The listing's own currency (`currency` is the cheapest room type's when the price is "from"). */
  listingCurrency?: CurrencyCode;
  /** True when the price is the cheapest room type ("from …"), for hotels. */
  priceIsFrom: boolean;
  priceDroppedAt: string | null;

  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  bedsSingle: number | null;
  bedsDouble: number | null;
  bedsSofa: number | null;
  maxGuests: number | null;
  sizeSqm: number | null;
  floor: number | null;
  totalFloors: number | null;
  elevator: boolean | null;
  yearBuilt: number | null;
  buildingAge: BuildingAge | null;
  furnished: boolean | null;
  condition: PropertyCondition | null;
  heating: HeatingType[];
  views: ViewType[];

  amenities: string[];
  kitchenKosher: KitchenKosher | null;
  shabbatFeatures: string[];
  jewishFeatures: string[];
  isShabbatFriendly: boolean;
  kosherCertName: string | null;
  hotelJewishFeatures: string[];
  sharedRoomFor: SharedRoomFor | null;
  synagogueWalkMin: number | null;
  chabadWalkMin: number | null;
  /**
   * Round 3 (brief 7.3): minutes on foot from the pin to the nearest beach / ski lift (sea and ski
   * towns only, ≤ 30). Missing = none.
   */
  seaWalkMinutes?: number | null;
  liftWalkMinutes?: number | null;
  nearby: NearbyInfo;

  deposit: number | null;
  cleaningFee: number | null;
  /** Friday and Saturday nights (booking settings), null = the nightly price. */
  weekendPrice: number | null;
  /** INSTANT: guests book on the site; CONTACT: they ask the host. */
  bookingMode: "INSTANT" | "CONTACT";
  utilitiesIncluded: boolean | null;
  utilitiesEstimate: number | null;
  minStayNights: number | null;
  weeklyDiscountPct: number | null;
  monthlyDiscountPct: number | null;

  checkInFrom: string | null;
  checkOutUntil: string | null;
  /** "גמיש" (round 3): shown as "צ׳ק-אין גמיש" / "צ׳ק-אאוט גמיש". */
  checkInFlexible: boolean;
  checkOutFlexible: boolean;
  /** The booking cancellation policy (round 2, phase 4 schema); null = not set yet. */
  cancellationPolicy: CancellationPolicyKey | null;
  smokingAllowed: boolean | null;
  petsAllowed: boolean | null;
  partiesAllowed: boolean | null;
  quietHoursFrom: string | null;
  quietHoursTo: string | null;

  videoUrl: string | null;
  tour360Url: string | null;

  /** Channel types in the owner's order — no values. */
  contactChannels: ContactChannelKey[];
  contactHoursFrom: string | null;
  contactHoursTo: string | null;
  noReplyOnShabbat: boolean;

  viewCount: number;
  contentUpdatedAt: string;
  publishedAt: string | null;
  ownerVerified: boolean;
  propertyVerified: boolean;
  /**
   * Round 3 (brief 8.3): "ביקרנו במקום · נובמבר 2026" — the month of the Bayit team's visit
   * ("YYYY-MM"), never the day or the staff note. Null (or missing) without the badge and on demo listings.
   */
  visitedMonth?: string | null;
  /**
   * Round 3 (brief 8.1): the VISIBLE reviews' count and the sum of their stars (Listing.reviewCount /
   * ratingSum). The average shows only from 3 (getRatingSummary in src/lib/reviews). Missing = none.
   */
  reviewCount?: number;
  ratingSum?: number;
  promoted: boolean;
  isNew: boolean;

  photos: PagePhoto[];
  /** The cover photo at Open Graph size (1200×630), or null. */
  ogImage: string | null;
  roomTypes: RoomTypeData[];
  priceChanges: PriceChangeData[];
  /** Blocked date ranges from today on ("YYYY-MM-DD", end exclusive). */
  blocks: { start: string; end: string }[];
  /**
   * The host's holiday prices from today on (round 3, brief 6.3; "YYYY-MM-DD", end exclusive):
   * the dates sheet prices the nights with them like the server does. roomTypeId null = the whole
   * listing. `label` is the host's note ({ he, … }, render with dir="auto").
   */
  datePrices?: { roomTypeId: string | null; start: string; end: string; price: number; minNights: number | null; label: unknown }[];
  owner: OwnerSummary;
};
