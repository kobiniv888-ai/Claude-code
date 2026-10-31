/**
 * Listing field vocabularies — the single source of truth for keys used by the
 * wizard, filters, listing page, admin and seed data.
 * Labels live in messages/<locale>/listingFields.json under the same keys.
 * Icons live in src/components/listing/field-icons.tsx.
 */
import type { DealType, PricePeriod, PropertyType } from "@/generated/prisma/enums";

export const DEAL_TYPES = ["SHORT_STAY", "MONTHLY_RENT", "SALE", "HOTEL_ROOM"] as const satisfies readonly DealType[];

/** URL slugs for deal types (/search?deal=monthly). */
export const DEAL_SLUGS: Record<DealType, string> = {
  SHORT_STAY: "short-stay",
  MONTHLY_RENT: "monthly",
  SALE: "buy",
  HOTEL_ROOM: "hotels",
};

export const PROPERTY_TYPES = [
  "APARTMENT", "STUDIO", "PENTHOUSE", "HOUSE", "VILLA", "COTTAGE", "ROOM", "HOTEL", "GUESTHOUSE", "HOSTEL",
] as const satisfies readonly PropertyType[];

export const PROPERTY_TYPES_BY_DEAL: Record<DealType, readonly PropertyType[]> = {
  SHORT_STAY: ["APARTMENT", "STUDIO", "PENTHOUSE", "HOUSE", "VILLA", "COTTAGE", "ROOM"],
  MONTHLY_RENT: ["APARTMENT", "STUDIO", "PENTHOUSE", "HOUSE", "VILLA", "COTTAGE", "ROOM"],
  SALE: ["APARTMENT", "STUDIO", "PENTHOUSE", "HOUSE", "VILLA", "COTTAGE"],
  HOTEL_ROOM: ["HOTEL", "GUESTHOUSE", "HOSTEL"],
};

export const DEFAULT_PRICE_PERIOD: Record<DealType, PricePeriod> = {
  SHORT_STAY: "NIGHT",
  MONTHLY_RENT: "MONTH",
  SALE: "TOTAL",
  HOTEL_ROOM: "NIGHT",
};

export const BUSINESS_PROPERTY_TYPES: readonly PropertyType[] = ["HOTEL", "GUESTHOUSE", "HOSTEL"];

export const AMENITIES = [
  "wifi",
  "air_conditioning",
  "heating",
  "washing_machine",
  "dryer",
  "dishwasher",
  "full_kitchen",
  "workspace",
  "tv",
  "parking",
  "balcony_terrace",
  "yard",
  "pool",
  "sauna",
  "gym",
  "near_sea",
  "near_ski_lifts",
  "crib_high_chair",
  "wheelchair_access",
  "self_check_in",
] as const;
export type Amenity = (typeof AMENITIES)[number];

/**
 * "Pets allowed" and "Smoking allowed" appear with the amenities in filters, but are stored
 * as house-rule booleans (Listing.petsAllowed / Listing.smokingAllowed).
 */
export const HOUSE_RULE_FILTERS = ["pets_allowed", "smoking_allowed"] as const;

/** Shabbat-friendly checklist (Listing.shabbatFeatures). */
export const SHABBAT_FEATURES = [
  "hot_plate",
  "hot_water_urn",
  "light_timers",
  "mechanical_key",
  "stairs_or_shabbat_elevator",
  "no_motion_sensors",
] as const;
export type ShabbatFeature = (typeof SHABBAT_FEATURES)[number];

/** Other Jewish-friendly details (Listing.jewishFeatures). */
export const JEWISH_FEATURES = [
  "mezuzot",
  "separable_beds",
  "sukkah_space",
  "pesach_ready",
  "kosher_food_nearby",
  "mikveh_nearby",
  "host_keeps_shabbat",
  "host_speaks_hebrew",
] as const;
export type JewishFeature = (typeof JEWISH_FEATURES)[number];

/** Hotels and guesthouses (Listing.hotelJewishFeatures). */
export const HOTEL_JEWISH_FEATURES = [
  "kosher_breakfast",
  "kosher_meals",
  "shabbat_meals",
  "separate_swimming",
] as const;
export type HotelJewishFeature = (typeof HOTEL_JEWISH_FEATURES)[number];

/** A listing sleeping this many guests or more "suits big families". */
export const BIG_FAMILY_MIN_GUESTS = 8;

/**
 * "Shabbat-friendly" badge rule: a regular key, no motion sensors / automatic doors
 * at the entrance, and a hot plate or a hot-water urn.
 */
export function computeShabbatFriendly(features: readonly string[]): boolean {
  const has = (k: ShabbatFeature) => features.includes(k);
  return has("mechanical_key") && has("no_motion_sensors") && (has("hot_plate") || has("hot_water_urn"));
}

export const CONDITIONS = [
  "BLACK_FRAME",
  "WHITE_FRAME",
  "GREEN_FRAME",
  "NEWLY_RENOVATED",
  "OLD_RENOVATION",
  "NEEDS_RENOVATION",
] as const;

export const HEATING_TYPES = ["CENTRAL", "GAS_BOILER", "ELECTRIC", "AIR_CONDITIONING"] as const;
export const VIEW_TYPES = ["SEA", "MOUNTAIN", "CITY"] as const;
export const KITCHEN_KOSHER = ["NOT_KOSHER", "CAN_KASHER", "KOSHER"] as const;
export const SHARED_ROOM_FOR = ["MEN", "WOMEN", "FAMILIES"] as const;

export const CONTACT_CHANNELS = [
  "WHATSAPP",
  "TELEGRAM",
  "VIBER",
  "MESSENGER",
  "PHONE",
  "SMS",
  "EMAIL",
] as const;
export type ContactChannelKey = (typeof CONTACT_CHANNELS)[number];

/** Shape of Listing.contactMethods (JSON). Values are private until "Show contact". */
export type ContactMethod = {
  channel: ContactChannelKey;
  /** E.164 phone for WHATSAPP/VIBER/PHONE/SMS; username or phone for TELEGRAM; username for MESSENGER; email for EMAIL. */
  value: string;
  order: number;
};

/** Reasons a moderator can give (labels in messages/<locale>/moderation.json). */
export const MODERATION_REASONS = [
  "photos_low_quality",
  "photos_not_property",
  "photos_watermark_other_site",
  "price_unrealistic",
  "description_contact_info",
  "description_incomplete",
  "wrong_location",
  "wrong_category",
  "duplicate_listing",
  "suspected_scam",
  "prohibited_content",
  "discriminatory_terms",
  "other",
] as const;
export type ModerationReason = (typeof MODERATION_REASONS)[number];

export const REPORT_REASONS = [
  "FAKE_LISTING",
  "ALREADY_RENTED",
  "WRONG_PRICE",
  "ASKED_MONEY_UPFRONT",
  "OFFENSIVE",
  "OTHER",
] as const;
