/**
 * Data the wizard pages hand to the browser (client-safe, serializable).
 */
import type { AppLocale, CurrencyCode } from "@/config/site";
import type { AccountType, ListingStatus, PricePeriod } from "@/generated/prisma/enums";
import type { WizardValues } from "./schemas";

export type WizardMode = "create" | "edit";

export type WizardPhoto = {
  id: string;
  url: string;
  thumbUrl: string;
  width: number | null;
  height: number | null;
  isCover: boolean;
  alt: string;
  roomTypeId: string | null;
};

export type WizardRoomType = {
  id: string;
  /** The name in the owner's language. */
  name: string;
  price: number;
  currency: CurrencyCode;
  pricePeriod: PricePeriod;
  maxGuests: number | null;
  bedsSingle: number | null;
  bedsDouble: number | null;
  sizeSqm: number | null;
  quantity: number | null;
  photos: WizardPhoto[];
};

export type WizardTranslation = {
  locale: AppLocale;
  title: string;
  description: string;
  isAuto: boolean;
  editedByOwner: boolean;
  updatedAt: string;
};

/** Inclusive day range, "YYYY-MM-DD". */
export type DayRange = { start: string; end: string };

export type WizardNeighborhood = { id: string; name: string; lat: number; lng: number };

export type WizardCity = {
  id: string;
  slug: string;
  name: string;
  lat: number;
  lng: number;
  neighborhoods: WizardNeighborhood[];
};

export type WizardListing = {
  id: string;
  publicId: number;
  status: ListingStatus;
  wizardStep: number;
  /** A brand-new draft: nothing chosen yet on steps 1–2. */
  fresh: boolean;
  values: WizardValues;
  photos: WizardPhoto[];
  roomTypes: WizardRoomType[];
  /** Days the owner marked as unavailable. */
  blocked: DayRange[];
  /** Days imported from Airbnb / Booking.com calendars (read-only here). */
  icalBlocked: DayRange[];
  translations: WizardTranslation[];
  icalExportUrl: string;
  rulesAccepted: boolean;
  /** Public page path once published ("/listing/1234-…"), else null. */
  publicPath: string | null;
  updatedAt: string;
};

export type WizardUser = {
  accountType: AccountType;
  businessName: string;
  phoneNumber: string | null;
  phoneVerified: boolean;
  /** Real email (never the phone-only placeholder). */
  email: string | null;
};

export type WizardContext = {
  mode: WizardMode;
  cities: WizardCity[];
  user: WizardUser;
  listingExpiryDays: number;
  translationEnabled: boolean;
  /** Signed token for saveChanges (edit mode): proves when the editor was opened. */
  editToken: string | null;
};

export type PublishOutcome = {
  status: "LIVE" | "IN_REVIEW" | "BLOCKED";
  /** Codes from the automatic checks (BLOCKED / IN_REVIEW). */
  reasons: string[];
  publicPath: string | null;
  publicId: number;
};

export type DraftSummary = {
  id: string;
  publicId: number;
  title: string;
  dealType: WizardValues["dealType"];
  propertyType: WizardValues["propertyType"];
  cityName: string | null;
  wizardStep: number;
  stepCount: number;
  coverUrl: string | null;
  photoCount: number;
  updatedAt: string;
};
