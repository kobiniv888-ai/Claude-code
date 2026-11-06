/**
 * Data the wizard pages hand to the browser (client-safe, serializable).
 */
import type { AppLocale, CurrencyCode } from "@/config/site";
import type { AccountType, ListingStatus, PhotoRoom, PricePeriod } from "@/generated/prisma/enums";
import type { WizardValues } from "./schemas";
import type { PledgeStatus } from "@/lib/pledge";

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
  /** Which room the photo shows (round 3, brief 6.1; optional, null = no label). */
  room?: PhotoRoom | null;
};

export type WizardRoomType = {
  id: string;
  /** The name in the owner's language. */
  name: string;
  price: number;
  currency: CurrencyCode;
  pricePeriod: PricePeriod;
  /** Friday and Saturday nights (null = the nightly price). */
  weekendPrice: number | null;
  maxGuests: number | null;
  bedsSingle: number | null;
  bedsDouble: number | null;
  bedsSofa: number | null;
  sizeSqm: number | null;
  /** The room's own amenity keys (ROOM_TYPE_AMENITIES). */
  amenities: string[];
  /** "כמה חדרים כאלה להציע בבית" (at least 1). */
  quantity: number | null;
  /** false = switched off: not offered to new guests. */
  active: boolean;
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

/** What the form edits, as saved (the page's first render and every loadWizardSnapshot). */
export type WizardAnswers = {
  status: ListingStatus;
  wizardStep: number;
  /** Steps 1–2 were answered (a new draft shows no selection there; see answeredChoices). */
  chosen: { deal: boolean; property: boolean };
  values: WizardValues;
  photos: WizardPhoto[];
  roomTypes: WizardRoomType[];
  /** Days the owner marked as unavailable. */
  blocked: DayRange[];
  /** Days imported from Airbnb / Booking.com calendars (read-only here). */
  icalBlocked: DayRange[];
  translations: WizardTranslation[];
  rulesAccepted: boolean;
  /** Public page path once published ("/listing/1234-…"), else null. */
  publicPath: string | null;
  /** The listing row's updatedAt (ISO). */
  updatedAt: string;
};

export type WizardListing = WizardAnswers & {
  id: string;
  publicId: number;
  icalExportUrl: string;
};

/** loadWizardSnapshot: the saved answers now, plus what may have changed on the account. */
export type WizardSnapshot = WizardAnswers & {
  user: { phoneVerified: boolean; pledge: PledgeStatus };
  /** The server's clock (ISO), to compare with the browser's when restoring unsent changes. */
  serverNow: string;
};

export type WizardUser = {
  accountType: AccountType;
  businessName: string;
  phoneNumber: string | null;
  phoneVerified: boolean;
  /** Real email (never the phone-only placeholder). */
  email: string | null;
  /** The Bayit welcome pledge: accepted version, current or not (the pledge step and publishing need it). */
  pledge: PledgeStatus;
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
  /** publicPath on the permanent address (SITE_URL, @/lib/site-url), for "share". */
  publicUrl?: string | null;
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
