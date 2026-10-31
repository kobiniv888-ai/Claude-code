/**
 * Post-a-listing wizard: the steps and which fields apply to which listing (client-safe, pure).
 *
 * Steps are addressed by key in code and by their 1-based position in the URL (?step=3).
 * Hotels, guesthouses and hostels get an extra "Room types" step right after the photos,
 * so the position of the later steps depends on the deal type.
 */
import type { DealType, PropertyType } from "@/generated/prisma/enums";
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
  "contact",
  "publish",
] as const;
export type WizardStepKey = (typeof WIZARD_STEP_KEYS)[number];

/** Steps saved with updateDraft(listingId, step, data). Photos, rooms and publish have their own actions. */
export const SAVABLE_STEPS = ["deal", "property", "location", "details", "amenities", "jewish", "price", "contact"] as const;
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

/** The steps shown for this listing, in order. */
export function stepsFor(kind: ListingKind): WizardStepKey[] {
  return WIZARD_STEP_KEYS.filter((key) => key !== "rooms" || isBusinessListing(kind));
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
  maxGuests: (k: ListingKind) => k.dealType === "SHORT_STAY" || k.dealType === "MONTHLY_RENT",
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
  cleaningFee: (k: ListingKind) => k.dealType === "SHORT_STAY",
  utilities: (k: ListingKind) => k.dealType === "MONTHLY_RENT",
  minStay: (k: ListingKind) => k.dealType === "SHORT_STAY" || k.dealType === "HOTEL_ROOM",
  discounts: (k: ListingKind) => k.dealType === "SHORT_STAY",
  availability: (k: ListingKind) => k.dealType !== "SALE",
  ical: (k: ListingKind) => k.dealType === "SHORT_STAY" || k.dealType === "HOTEL_ROOM",
  pricePerSqm: (k: ListingKind) => k.dealType === "SALE",
} satisfies Record<string, (kind: ListingKind) => boolean>;
export type ApplicableField = keyof typeof FIELD_APPLIES;

export function applies(field: ApplicableField, kind: ListingKind): boolean {
  return FIELD_APPLIES[field](kind);
}
