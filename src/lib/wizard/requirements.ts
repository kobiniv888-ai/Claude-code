/**
 * What still blocks publishing (client-safe, pure). The Preview step lists these with a link
 * to the right step instead of showing a dead "Publish" button; the publish action checks
 * the same list on the server.
 */
import { siteConfig } from "@/config/site";
import { stepIssues, type WizardValues } from "./schemas";
import { stepsFor, type ListingKind, type SavableStepKey, type WizardStepKey } from "./steps";

export const REQUIREMENT_KEYS = [
  "phoneVerified",
  "propertyType",
  "location",
  "details",
  "photos",
  "price",
  "contact",
] as const;
export type RequirementKey = (typeof REQUIREMENT_KEYS)[number];

export type MissingRequirement = {
  key: RequirementKey;
  /** The wizard step that fixes it (null = outside the wizard, e.g. phone verification). */
  step: WizardStepKey | null;
};

export type RequirementInput = {
  values: WizardValues;
  /** Main listing photos (not room-type photos). */
  photoCount: number;
  /** Photos of hotel room types (they count towards the minimum for hotels). */
  roomPhotoCount?: number;
  /** Hotel room types with a price (a hotel may show "from" its cheapest room instead of its own price). */
  pricedRoomTypes?: number;
  phoneVerified: boolean;
};

const STEP_REQUIREMENTS: { key: RequirementKey; step: SavableStepKey }[] = [
  { key: "propertyType", step: "property" },
  { key: "location", step: "location" },
  { key: "details", step: "details" },
  { key: "price", step: "price" },
  { key: "contact", step: "contact" },
];

export function missingRequirements({
  values,
  photoCount,
  roomPhotoCount = 0,
  pricedRoomTypes = 0,
  phoneVerified,
}: RequirementInput): MissingRequirement[] {
  const kind: ListingKind = { dealType: values.dealType, propertyType: values.propertyType };
  const isHotel = kind.dealType === "HOTEL_ROOM";
  const missing: MissingRequirement[] = [];
  if (!phoneVerified) missing.push({ key: "phoneVerified", step: null });
  for (const { key, step } of STEP_REQUIREMENTS) {
    if (key === "price") {
      // Photos come before the price in the wizard; keep the list in step order.
      const photos = photoCount + (isHotel ? roomPhotoCount : 0);
      if (photos < siteConfig.listings.minPhotos) missing.push({ key: "photos", step: "photos" });
    }
    if (Object.keys(stepIssues(step, values, kind)).length > 0) missing.push({ key, step });
    else if (key === "price" && isHotel && !(values.price !== null && values.price > 0) && pricedRoomTypes === 0) {
      // Hotels: their own "from" price or at least one priced room type.
      missing.push({ key, step: "rooms" });
    }
  }
  return missing.filter((m) => m.step === null || stepsFor(kind).includes(m.step));
}
