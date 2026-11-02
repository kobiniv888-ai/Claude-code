/**
 * Post-a-listing wizard: the steps and which fields apply to which listing (client-safe, pure).
 *
 * Steps are addressed by key in code and by their 1-based position in the URL (?step=3).
 * Hotels, guesthouses and hostels get an extra "Room types" step right after the photos,
 * so the position of the later steps depends on the deal type.
 */
import type { DealType, PropertyType } from "@/generated/prisma/enums";
import { isBookableDealType } from "@/lib/booking/constants";
import { BUSINESS_PROPERTY_TYPES, PROPERTY_TYPES_BY_DEAL } from "@/lib/listing/fields";

export const WIZARD_STEP_KEYS = [
  "deal",
  "property",
  "location",
  "details",
  "amenities",
  "jewish",
  "photos",
  "rooms",
  "price",
  // "הזמנות ומחיר" (bookings and price): replaces "price" for short stays and hotel rooms.
  "booking",
  "contact",
  // The Bayit welcome pledge (required; saved on the user, not the listing).
  "pledge",
  "publish",
] as const;
export type WizardStepKey = (typeof WIZARD_STEP_KEYS)[number];

/** Steps saved with updateDraft(listingId, step, data). Photos, rooms, pledge and publish have their own actions. */
export const SAVABLE_STEPS = ["deal", "property", "location", "details", "amenities", "jewish", "price", "booking", "contact"] as const;
export type SavableStepKey = (typeof SAVABLE_STEPS)[number];

export function isSavableStep(step: string): step is SavableStepKey {
  return (SAVABLE_STEPS as readonly string[]).includes(step);
}

export function isWizardStepKey(step: string): step is WizardStepKey {
  return (WIZARD_STEP_KEYS as readonly string[]).includes(step);
}

export type ListingKind = { dealType: DealType; propertyType: PropertyType };

/** True for hotels, guesthouses and hostels (several room types, "Business" label). */
export function isBusinessListing(kind: ListingKind): boolean {
  return kind.dealType === "HOTEL_ROOM" || BUSINESS_PROPERTY_TYPES.includes(kind.propertyType);
}

/**
 * Short stays and hotel rooms are booked on the site: their price, stay rules, cancellation policy
 * and payment methods live in one "הזמנות ומחיר" step (brief 5.6), which takes the place of the
 * "price" step. Saving it turns instant booking on (docs/redesign-2/booking.md).
 */
export function usesBookingStep(kind: Pick<ListingKind, "dealType">): boolean {
  return isBookableDealType(kind.dealType);
}

/** The steps shown for this listing, in order. */
export function stepsFor(kind: ListingKind): WizardStepKey[] {
  const booking = usesBookingStep(kind);
  return WIZARD_STEP_KEYS.filter((key) => {
    if (key === "rooms") return isBusinessListing(kind);
    if (key === "price") return !booking;
    if (key === "booking") return booking;
    return true;
  });
}

/** The step that holds the listing's price ("booking" for short stays and hotels). */
export function priceStepFor(kind: ListingKind): "price" | "booking" {
  return usesBookingStep(kind) ? "booking" : "price";
}

/** 1-based position of a step (the number shown in the progress bar and the URL). */
export function stepNumber(key: WizardStepKey, kind: ListingKind): number {
  const steps = stepsFor(kind);
  const index = steps.indexOf(key);
  return index === -1 ? 1 : index + 1;
}

/** The step at a 1-based position, clamped to the steps that exist. */
export function stepAt(position: number, kind: ListingKind): WizardStepKey {
  const steps = stepsFor(kind);
  const n = Number.isFinite(position) ? Math.trunc(position) : 1;
  return steps[Math.min(Math.max(n, 1), steps.length) - 1];
}

/** Parses ?step= (a number, or a step key). */
export function parseStepParam(value: unknown, kind: ListingKind, fallback: number): WizardStepKey {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === "string" && isWizardStepKey(raw) && stepsFor(kind).includes(raw)) return raw;
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : Number.NaN;
  return stepAt(Number.isFinite(n) ? n : fallback, kind);
}

/** The property type is valid for the deal type (PROPERTY_TYPES_BY_DEAL). */
export function isPropertyTypeAllowed(kind: ListingKind): boolean {
  return PROPERTY_TYPES_BY_DEAL[kind.dealType].includes(kind.propertyType);
}

// ─── Which fields apply ───────────────────────────────────────

const APARTMENT_LIKE: readonly PropertyType[] = ["APARTMENT", "STUDIO", "PENTHOUSE", "ROOM"];

/**
 * Field visibility per deal/property type. Fields that do not apply are hidden in the
 * wizard and cleared (null) when the listing is published, so a stale cleaning fee from a
 * short-stay draft never shows on a sale listing.
 */
export const FIELD_APPLIES = {
  rooms: (k: ListingKind) => k.dealType !== "HOTEL_ROOM",
  bedrooms: (k: ListingKind) => k.dealType !== "HOTEL_ROOM",
  bathrooms: (k: ListingKind) => k.dealType !== "HOTEL_ROOM",
  beds: (k: ListingKind) => k.dealType === "SHORT_STAY" || k.dealType === "MONTHLY_RENT",
  // Shown in the booking step for short stays and hotels (a hotel's room types can set their own).
  maxGuests: (k: ListingKind) => k.dealType !== "SALE",
  sizeSqm: (k: ListingKind) => k.dealType !== "HOTEL_ROOM",
  floor: (k: ListingKind) => APARTMENT_LIKE.includes(k.propertyType),
  totalFloors: () => true,
  elevator: (k: ListingKind) => APARTMENT_LIKE.includes(k.propertyType) || isBusinessListing(k),
  yearBuilt: () => true,
  buildingAge: () => true,
  furnished: (k: ListingKind) => k.dealType === "MONTHLY_RENT" || k.dealType === "SALE",
  condition: (k: ListingKind) => k.dealType === "SALE" || k.dealType === "MONTHLY_RENT",
  heating: () => true,
  views: () => true,
  cadastralCode: () => true,
  sharedRoomFor: (k: ListingKind) => k.propertyType === "ROOM",
  // Amenities step: house rules apply to stays and rentals, not to sales.
  houseRules: (k: ListingKind) => k.dealType !== "SALE",
  checkInOut: (k: ListingKind) => k.dealType === "SHORT_STAY" || k.dealType === "HOTEL_ROOM",
  partiesAllowed: (k: ListingKind) => k.dealType === "SHORT_STAY" || k.dealType === "HOTEL_ROOM",
  // Jewish-friendly step
  shabbatFeatures: (k: ListingKind) => k.dealType !== "SALE",
  hostFeatures: (k: ListingKind) => k.dealType !== "SALE",
  hotelJewishFeatures: (k: ListingKind) => isBusinessListing(k),
  kosherCertificate: (k: ListingKind) => isBusinessListing(k),
  // Price step
  deposit: (k: ListingKind) => k.dealType === "SHORT_STAY" || k.dealType === "MONTHLY_RENT",
  cleaningFee: (k: ListingKind) => k.dealType === "SHORT_STAY" || k.dealType === "HOTEL_ROOM",
  utilities: (k: ListingKind) => k.dealType === "MONTHLY_RENT",
  minStay: (k: ListingKind) => k.dealType === "SHORT_STAY" || k.dealType === "HOTEL_ROOM",
  // Booked stays are priced per night (+ an optional weekend price, src/lib/booking/pricing.ts):
  // weekly/monthly discounts would promise a total the booking does not give, so they are off.
  discounts: () => false,
  // Booking terms (weekend price, cancellation policy, payment methods, instant booking).
  bookingTerms: (k: ListingKind) => usesBookingStep(k),
  availability: (k: ListingKind) => k.dealType !== "SALE",
  ical: (k: ListingKind) => k.dealType === "SHORT_STAY" || k.dealType === "HOTEL_ROOM",
  pricePerSqm: (k: ListingKind) => k.dealType === "SALE",
} satisfies Record<string, (kind: ListingKind) => boolean>;
export type ApplicableField = keyof typeof FIELD_APPLIES;

export function applies(field: ApplicableField, kind: ListingKind): boolean {
  return FIELD_APPLIES[field](kind);
}
