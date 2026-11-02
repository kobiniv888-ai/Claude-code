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
  maxGuests: number | null;
  bedsSingle: number | null;
  bedsDouble: number | null;
  sizeSqm: number | null;
  photos: PagePhoto[];
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
  /** Approximate map point only. */
  approx: { lat: number; lng: number } | null;

  price: number | null;
  currency: CurrencyCode;
  pricePeriod: PricePeriod;
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
  nearby: NearbyInfo;

  deposit: number | null;
  cleaningFee: number | null;
  utilitiesIncluded: boolean | null;
  utilitiesEstimate: number | null;
  minStayNights: number | null;
  weeklyDiscountPct: number | null;
  monthlyDiscountPct: number | null;

  checkInFrom: string | null;
  checkOutUntil: string | null;
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
  promoted: boolean;
  isNew: boolean;

  photos: PagePhoto[];
  /** The cover photo at Open Graph size (1200×630), or null. */
  ogImage: string | null;
  roomTypes: RoomTypeData[];
  priceChanges: PriceChangeData[];
  /** Blocked date ranges from today on ("YYYY-MM-DD", end exclusive). */
  blocks: { start: string; end: string }[];
  owner: OwnerSummary;
};
