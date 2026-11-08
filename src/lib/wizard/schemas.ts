/**
 * Post-a-listing wizard: values and per-step zod schemas (client-safe — the browser uses the
 * same schemas to block "Next" and show inline errors; the server actions re-validate).
 *
 * Two levels per step:
 *  - `stepSaveSchemas[step]`: types and limits only. Auto-save accepts half-filled steps.
 *  - `stepIssues(step, values, kind)`: everything above PLUS required fields and cross-field
 *    rules for this deal/property type. "Next" is blocked while it returns issues.
 *
 * Error messages are message keys in messages/<locale>/wizard.json under "validation.*".
 */
import { z } from "zod";
import { COUNTRIES, isInCountry } from "@/config/countries";
import { allowListedHttpsUrl, CALENDAR_IMPORT_DOMAINS, isTourUrl } from "@/config/external-hosts";
import { isValidPhone as isValidPhoneNumber, normalizePhone } from "@/lib/phone";
import { locales, siteConfig, type AppLocale, type CurrencyCode } from "@/config/site";
import type {
  BuildingAge,
  CancellationPolicy,
  DealType,
  HeatingType,
  KitchenKosher,
  PricePeriod,
  PropertyCondition,
  PropertyType,
  SharedRoomFor,
  ViewType,
} from "@/generated/prisma/enums";
import { CANCELLATION_POLICIES, MAX_STAY_NIGHTS, PAYMENT_METHODS, type PaymentMethod } from "@/lib/booking/constants";
import { LONG_STAY } from "@/lib/booking/pricing";
import { enabledCurrencies } from "@/lib/currency/convert";
import {
  AMENITIES,
  CONDITIONS,
  CONTACT_CHANNELS,
  DEAL_TYPES,
  HEATING_TYPES,
  HOTEL_JEWISH_FEATURES,
  JEWISH_FEATURES,
  KITCHEN_KOSHER,
  PHOTO_ROOMS,
  PROPERTY_TYPES,
  SHABBAT_FEATURES,
  SHARED_ROOM_FOR,
  VIEW_TYPES,
  type ContactChannelKey,
  type ContactMethod,
} from "@/lib/listing/fields";
import { applies, isPropertyTypeAllowed, usesBookingStep, type ListingKind, type SavableStepKey } from "./steps";

// ─── Values ───────────────────────────────────────────────────

/** Everything the wizard edits, as the browser holds it. Empty text is "" (stored as null). */
export type WizardValues = {
  // 1–2
  dealType: DealType;
  propertyType: PropertyType;
  businessName: string;
  // 3
  cityId: string | null;
  neighborhoodId: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  // 4
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
  cadastralCode: string;
  sharedRoomFor: SharedRoomFor | null;
  originalLocale: AppLocale;
  title: string;
  description: string;
  videoUrl: string;
  tour360Url: string;
  // 5
  amenities: string[];
  petsAllowed: boolean | null;
  smokingAllowed: boolean | null;
  partiesAllowed: boolean | null;
  checkInFrom: string;
  checkOutUntil: string;
  /** "גמיש" in the check-in / check-out picker (round 3); the time is "" then. */
  checkInFlexible: boolean;
  checkOutFlexible: boolean;
  quietHoursFrom: string;
  quietHoursTo: string;
  // 6
  kitchenKosher: KitchenKosher | null;
  shabbatFeatures: string[];
  jewishFeatures: string[];
  hotelJewishFeatures: string[];
  kosherCertName: string;
  kosherCertPhotoKey: string | null;
  // 8
  price: number | null;
  currency: CurrencyCode;
  pricePeriod: PricePeriod;
  deposit: number | null;
  cleaningFee: number | null;
  utilitiesIncluded: boolean | null;
  utilitiesEstimate: number | null;
  minStayNights: number | null;
  weeklyDiscountPct: number | null;
  monthlyDiscountPct: number | null;
  icalImportUrls: string[];
  // "הזמנות ומחיר" (short stays and hotels; the step also edits price, currency, cleaning fee,
  // deposit, minimum nights, maximum guests and the check-in/out times above)
  weekendPrice: number | null;
  cancellationPolicy: CancellationPolicy;
  paymentMethodsAtCheckIn: PaymentMethod[];
  // 9
  contactMethods: ContactMethod[];
  contactHoursFrom: string;
  contactHoursTo: string;
  noReplyOnShabbat: boolean;
};

/** The fields each savable step owns (and sends to updateDraft). */
export const STEP_FIELDS = {
  deal: ["dealType"],
  property: ["propertyType", "businessName"],
  location: ["cityId", "neighborhoodId", "address", "lat", "lng"],
  // Round 1's "details" step, split (brief 5.7). maxGuests is asked here only for monthly rentals;
  // short stays and hotels set it in "booking" (both save the same value).
  size: ["rooms", "bedrooms", "bathrooms", "bedsSingle", "bedsDouble", "bedsSofa", "maxGuests", "sizeSqm", "sharedRoomFor"],
  building: ["floor", "totalFloors", "elevator", "yearBuilt", "buildingAge", "cadastralCode"],
  features: ["condition", "furnished", "heating", "views", "videoUrl", "tour360Url"],
  text: ["originalLocale", "title", "description"],
  amenities: [
    "amenities", "petsAllowed", "smokingAllowed", "partiesAllowed", "checkInFrom", "checkOutUntil",
    "checkInFlexible", "checkOutFlexible", "quietHoursFrom", "quietHoursTo",
  ],
  jewish: ["kitchenKosher", "shabbatFeatures", "jewishFeatures", "hotelJewishFeatures", "kosherCertName", "kosherCertPhotoKey"],
  price: [
    "price", "currency", "pricePeriod", "deposit", "cleaningFee", "utilitiesIncluded", "utilitiesEstimate",
    "minStayNights", "weeklyDiscountPct", "monthlyDiscountPct", "icalImportUrls",
  ],
  // iCal links are not here: they are managed on the listing's calendar page.
  booking: [
    "price", "currency", "pricePeriod", "weekendPrice", "cleaningFee", "deposit", "minStayNights", "maxGuests",
    "checkInFrom", "checkOutUntil", "checkInFlexible", "checkOutFlexible", "cancellationPolicy", "paymentMethodsAtCheckIn",
    "weeklyDiscountPct", "monthlyDiscountPct",
  ],
  contact: ["contactMethods", "contactHoursFrom", "contactHoursTo", "noReplyOnShabbat"],
} as const satisfies Record<SavableStepKey, readonly (keyof WizardValues)[]>;

export type StepData<S extends SavableStepKey> = Pick<WizardValues, (typeof STEP_FIELDS)[S][number]>;

/** The slice of `values` a step saves. */
export function pickStepData<S extends SavableStepKey>(step: S, values: WizardValues): StepData<S> {
  const out: Record<string, unknown> = {};
  for (const key of STEP_FIELDS[step]) out[key] = values[key];
  return out as StepData<S>;
}

// ─── Limits and formats ───────────────────────────────────────

export const LIMITS = {
  titleMin: 10,
  titleMax: siteConfig.listings.titleMaxLength,
  descriptionMin: 50,
  descriptionMax: siteConfig.listings.descriptionMaxLength,
  businessNameMax: 80,
  addressMax: 200,
  cadastralMax: 40,
  urlMax: 500,
  maxIcalImports: 3,
  priceMax: 1_000_000_000,
  feeMax: 10_000_000,
  discountMax: 90,
  minStayMax: 365,
  roomTypeNameMax: 80,
  altMax: 200,
} as const;

/** Rough box around Georgia (the only country open for posting): src/config/countries.ts. */
export const GEORGIA_BOUNDS = COUNTRIES.GE.pinBounds;

/** A pin inside Georgia. For a listing in another country use isInCountry(code, lat, lng). */
export function isInGeorgia(lat: number, lng: number): boolean {
  return isInCountry("GE", lat, lng);
}

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const CADASTRAL_PATTERN = /^[0-9][0-9.\-/ ]{3,39}$/;
const TELEGRAM_USERNAME = /^@?[A-Za-z][A-Za-z0-9_]{4,31}$/;
const MESSENGER_USERNAME = /^[A-Za-z0-9.]{3,50}$/;
const E164 = /^\+[1-9]\d{6,14}$/;

const VIDEO_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "vimeo.com", "www.vimeo.com", "player.vimeo.com"];

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** https:// YouTube or Vimeo link. */
export function isVideoUrl(value: string): boolean {
  const url = parseUrl(value);
  return !!url && url.protocol === "https:" && VIDEO_HOSTS.includes(url.hostname.toLowerCase());
}

export function isHttpsUrl(value: string): boolean {
  const url = parseUrl(value);
  return !!url && url.protocol === "https:" && url.hostname.includes(".");
}

/**
 * A calendar link to import: https on Airbnb, Booking.com, Vrbo / HomeAway or Google Calendar
 * (CALENDAR_IMPORT_DOMAINS, SECURITY_REPORT 8.1.a). The sync checks it again on every download.
 */
export function isCalendarImportUrl(value: string): boolean {
  return allowListedHttpsUrl(value, CALENDAR_IMPORT_DOMAINS) !== null;
}

/** "httpsOnly" for a link that isn't https at all, else `hostKey` when its site isn't on the list. */
function allowListRefine(isAllowed: (value: string) => boolean, hostKey: string) {
  return (value: string, ctx: z.RefinementCtx<string>) => {
    if (value === "" || isAllowed(value)) return;
    ctx.addIssue({ code: "custom", message: isHttpsUrl(value) ? hostKey : "httpsOnly" });
  };
}

export function isValidPhone(value: string): boolean {
  return E164.test(value) && isValidPhoneNumber(value);
}

export const PHONE_CHANNELS: readonly ContactChannelKey[] = ["WHATSAPP", "VIBER", "PHONE", "SMS"];

/** Checks one contact value for its channel. Returns a validation message key, or null. */
export function contactValueProblem(channel: ContactChannelKey, raw: string): string | null {
  const value = raw.trim();
  if (!value) return "required";
  if (PHONE_CHANNELS.includes(channel)) return isValidPhone(value) ? null : "invalidPhone";
  if (channel === "TELEGRAM") return TELEGRAM_USERNAME.test(value) || isValidPhone(value) ? null : "invalidTelegram";
  if (channel === "MESSENGER") return MESSENGER_USERNAME.test(value) ? null : "invalidMessenger";
  if (channel === "EMAIL") return z.email().safeParse(value).success ? null : "invalidEmail";
  return null;
}

/**
 * "https://m.me/john.doe" or "facebook.com/john.doe" → "john.doe"; "@name" stays as typed for Telegram.
 * Phone numbers → E.164 without the national 0 ("+972 053-…" → "+97253…", brief 2.5); a number
 * typed without a country code is Georgian (the listing contact default, src/config/countries.ts).
 */
export function normalizeContactValue(channel: ContactChannelKey, raw: string): string {
  let value = raw.trim();
  const phoneLike = PHONE_CHANNELS.includes(channel) || (channel === "TELEGRAM" && /^\+?[\d\s().-]+$/.test(value));
  if (phoneLike && value) return normalizePhone(value, COUNTRIES.GE.defaultPhoneCountry) ?? value;
  if (channel === "MESSENGER") {
    value = value.replace(/^https?:\/\//i, "").replace(/^(www\.)?(m\.me|facebook\.com|fb\.com|messenger\.com\/t)\//i, "");
    value = value.replace(/[/?#].*$/, "");
  }
  if (channel === "TELEGRAM") {
    value = value.replace(/^https?:\/\//i, "").replace(/^(t\.me|telegram\.me)\//i, "");
    if (!value.startsWith("+") && !value.startsWith("@") && /^[A-Za-z]/.test(value)) value = `@${value}`;
  }
  if (channel === "EMAIL") value = value.toLowerCase();
  return value;
}

/** Allowed price periods per deal type (the first one is the default). */
export const PRICE_PERIODS_BY_DEAL: Record<DealType, readonly PricePeriod[]> = {
  SHORT_STAY: ["NIGHT", "WEEK"],
  MONTHLY_RENT: ["MONTH"],
  SALE: ["TOTAL"],
  HOTEL_ROOM: ["NIGHT"],
};

/** Room types: periods a hotel or guesthouse can charge by. */
export const ROOM_TYPE_PERIODS: readonly PricePeriod[] = ["NIGHT", "WEEK", "MONTH"];

// ─── Save schemas (types and limits only) ─────────────────────

const text = (max: number) => z.string({ error: "invalid" }).trim().max(max, "tooLong");
const optionalText = (max: number) => text(max).default("");
const int = (min: number, max: number) =>
  z.number({ error: "invalidNumber" }).int("wholeNumber").min(min, "tooSmall").max(max, "tooLarge").nullable();
const decimal = (min: number, max: number) =>
  z.number({ error: "invalidNumber" }).min(min, "tooSmall").max(max, "tooLarge").nullable();
const halfStep = (min: number, max: number) =>
  decimal(min, max).refine((n) => n === null || Number.isInteger(n * 2), "halfStep");
const money = (max: number) =>
  z
    .number({ error: "invalidNumber" })
    .min(0, "tooSmall")
    .max(max, "tooLarge")
    .transform((n) => Math.round(n * 100) / 100)
    .nullable();
const bool = z.boolean().nullable();
const time = z.union([z.literal(""), z.string().regex(TIME_PATTERN, "invalidTime")]).default("");
const id = z.string().trim().min(1).max(64);
const uniqueKeys = <T extends string>(values: readonly [T, ...T[]], max = values.length) =>
  z
    .array(z.enum(values))
    .max(max)
    .transform((list) => [...new Set(list)]);

const currentYear = new Date().getUTCFullYear();

export const dealStepSchema = z.object({ dealType: z.enum(DEAL_TYPES, "pickOne") });

export const propertyStepSchema = z.object({
  propertyType: z.enum(PROPERTY_TYPES, "pickOne"),
  businessName: optionalText(LIMITS.businessNameMax),
});

export const locationStepSchema = z.object({
  cityId: id.nullable(),
  neighborhoodId: id.nullable(),
  address: optionalText(LIMITS.addressMax),
  lat: z.number({ error: "invalidNumber" }).min(-90).max(90).nullable(),
  lng: z.number({ error: "invalidNumber" }).min(-180).max(180).nullable(),
});

const urlField = z
  .string()
  .trim()
  .max(LIMITS.urlMax, "tooLong")
  .default("");

export const detailsStepSchema = z.object({
  rooms: halfStep(0, 50),
  bedrooms: int(0, 50),
  bathrooms: halfStep(0, 30),
  bedsSingle: int(0, 50),
  bedsDouble: int(0, 50),
  bedsSofa: int(0, 50),
  maxGuests: int(1, 100),
  sizeSqm: decimal(1, 100_000),
  floor: int(-5, 200),
  totalFloors: int(1, 200),
  elevator: bool,
  yearBuilt: int(1800, currentYear + 5),
  buildingAge: z.enum(["NEW", "OLD"]).nullable(),
  furnished: bool,
  condition: z.enum(CONDITIONS).nullable(),
  heating: uniqueKeys(HEATING_TYPES),
  views: uniqueKeys(VIEW_TYPES),
  cadastralCode: z
    .union([z.literal(""), z.string().trim().max(LIMITS.cadastralMax, "tooLong").regex(CADASTRAL_PATTERN, "invalidCadastral")])
    .default(""),
  sharedRoomFor: z.enum(SHARED_ROOM_FOR).nullable(),
  originalLocale: z.enum(locales),
  title: optionalText(LIMITS.titleMax),
  description: optionalText(LIMITS.descriptionMax),
  videoUrl: urlField.refine((v) => v === "" || isVideoUrl(v), "videoUrl"),
  // Matterport, Kuula, Momento360 or Roundme only (SECURITY_REPORT 7.f); the page checks it again.
  tour360Url: urlField.superRefine(allowListRefine(isTourUrl, "tourHost")),
});

/** The four steps that replaced round 1's "details" step each validate their part of it. */
export const sizeStepSchema = detailsStepSchema.pick({
  rooms: true,
  bedrooms: true,
  bathrooms: true,
  bedsSingle: true,
  bedsDouble: true,
  bedsSofa: true,
  maxGuests: true,
  sizeSqm: true,
  sharedRoomFor: true,
});
export const buildingStepSchema = detailsStepSchema.pick({
  floor: true,
  totalFloors: true,
  elevator: true,
  yearBuilt: true,
  buildingAge: true,
  cadastralCode: true,
});
export const featuresStepSchema = detailsStepSchema.pick({
  condition: true,
  furnished: true,
  heating: true,
  views: true,
  videoUrl: true,
  tour360Url: true,
});
export const textStepSchema = detailsStepSchema.pick({ originalLocale: true, title: true, description: true });

export const amenitiesStepSchema = z.object({
  amenities: uniqueKeys(AMENITIES),
  petsAllowed: bool,
  smokingAllowed: bool,
  partiesAllowed: bool,
  checkInFrom: time,
  checkOutUntil: time,
  checkInFlexible: z.boolean(),
  checkOutFlexible: z.boolean(),
  quietHoursFrom: time,
  quietHoursTo: time,
});

export const jewishStepSchema = z.object({
  kitchenKosher: z.enum(KITCHEN_KOSHER).nullable(),
  shabbatFeatures: uniqueKeys(SHABBAT_FEATURES),
  jewishFeatures: uniqueKeys(JEWISH_FEATURES),
  hotelJewishFeatures: uniqueKeys(HOTEL_JEWISH_FEATURES),
  kosherCertName: optionalText(120),
  kosherCertPhotoKey: z.string().max(512).nullable(),
});

const enabledCurrency = z
  .string()
  .refine((c): c is CurrencyCode => (enabledCurrencies as readonly string[]).includes(c), "pickOne")
  .transform((c) => c as CurrencyCode);

export const priceStepSchema = z.object({
  price: money(LIMITS.priceMax),
  currency: enabledCurrency,
  pricePeriod: z.enum(["NIGHT", "WEEK", "MONTH", "TOTAL"]),
  deposit: money(LIMITS.feeMax),
  cleaningFee: money(LIMITS.feeMax),
  utilitiesIncluded: bool,
  utilitiesEstimate: money(LIMITS.feeMax),
  minStayNights: int(1, LIMITS.minStayMax),
  weeklyDiscountPct: int(0, LIMITS.discountMax),
  monthlyDiscountPct: int(0, LIMITS.discountMax),
  icalImportUrls: z
    .array(z.string().trim().max(LIMITS.urlMax, "tooLong").superRefine(allowListRefine(isCalendarImportUrl, "calendarHost")))
    .max(LIMITS.maxIcalImports, "tooMany")
    .transform((list) => [...new Set(list.filter(Boolean))]),
});

/**
 * A long-stay discount of a booked stay (round 3, brief 6.3): whole percents 1–60 off the nights
 * (LONG_STAY in src/lib/booking/pricing.ts); empty or 0 = no discount.
 */
const longStayPct = z
  .number({ error: "invalidNumber" })
  .int("wholeNumber")
  .min(0, "tooSmall")
  .max(LONG_STAY.maxPct, "discountTooLarge")
  .transform((n) => (n >= LONG_STAY.minPct ? n : null))
  .nullable();

/** "הזמנות ומחיר": prices per night, stay rules and booking terms (short stays and hotels). */
export const bookingStepSchema = z.object({
  price: money(LIMITS.priceMax),
  currency: enabledCurrency,
  pricePeriod: z.enum(["NIGHT", "WEEK", "MONTH", "TOTAL"]),
  weekendPrice: money(LIMITS.priceMax),
  cleaningFee: money(LIMITS.feeMax),
  deposit: money(LIMITS.feeMax),
  minStayNights: int(1, MAX_STAY_NIGHTS),
  maxGuests: int(1, 100),
  checkInFrom: time,
  checkOutUntil: time,
  checkInFlexible: z.boolean(),
  checkOutFlexible: z.boolean(),
  cancellationPolicy: z.enum(CANCELLATION_POLICIES, "pickOne"),
  paymentMethodsAtCheckIn: uniqueKeys(PAYMENT_METHODS),
  weeklyDiscountPct: longStayPct,
  monthlyDiscountPct: longStayPct,
});

export const contactMethodSchema = z.object({
  channel: z.enum(CONTACT_CHANNELS),
  value: z.string().trim().max(200, "tooLong"),
  order: z.number().int().min(0).max(20),
});

export const contactStepSchema = z.object({
  contactMethods: z
    .array(contactMethodSchema)
    .max(CONTACT_CHANNELS.length)
    .refine((list) => new Set(list.map((m) => m.channel)).size === list.length, "duplicateChannel")
    .transform((list) =>
      [...list].sort((a, b) => a.order - b.order).map((m, index) => ({ ...m, value: normalizeContactValue(m.channel, m.value), order: index })),
    ),
  contactHoursFrom: time,
  contactHoursTo: time,
  noReplyOnShabbat: z.boolean(),
});

export const stepSaveSchemas = {
  deal: dealStepSchema,
  property: propertyStepSchema,
  location: locationStepSchema,
  size: sizeStepSchema,
  building: buildingStepSchema,
  features: featuresStepSchema,
  text: textStepSchema,
  amenities: amenitiesStepSchema,
  jewish: jewishStepSchema,
  price: priceStepSchema,
  booking: bookingStepSchema,
  contact: contactStepSchema,
} satisfies Record<SavableStepKey, z.ZodType>;

export type ParsedStep<S extends SavableStepKey> = z.output<(typeof stepSaveSchemas)[S]>;

// ─── Complete-step checks (required fields, cross-field rules) ─

/** Field name → validation message key. */
export type StepIssues = Record<string, string>;

function collectZodIssues(error: z.ZodError, into: StepIssues) {
  for (const issue of error.issues) {
    const path = issue.path.map(String).join(".");
    if (!path || into[path]) continue;
    into[path] = issue.message && /^[a-zA-Z]+$/.test(issue.message) ? issue.message : "invalid";
  }
}

function blank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function requiredIssues(step: SavableStepKey, v: WizardValues, kind: ListingKind, into: StepIssues) {
  const need = (field: keyof WizardValues, code = "required") => {
    if (!into[field] && blank(v[field])) into[field] = code;
  };
  switch (step) {
    case "deal":
      break;
    case "property":
      if (!isPropertyTypeAllowed(kind)) into.propertyType = "pickOne";
      break;
    case "location":
      need("cityId", "cityRequired");
      if (v.lat === null || v.lng === null) into.lat = "pinRequired";
      else if (!isInGeorgia(v.lat, v.lng)) into.lat = "outsideGeorgia";
      break;
    // Only the essentials are required (brief 5.7): rooms for rentals and sales, the size of a
    // home for sale, who shares a room, and a title and description.
    case "size":
      // Short stays enter their maximum guests in the booking step.
      if (kind.dealType === "SHORT_STAY" && !usesBookingStep(kind)) need("maxGuests");
      if (kind.dealType === "SALE") need("sizeSqm");
      if (kind.dealType === "SALE" || kind.dealType === "MONTHLY_RENT") need("rooms");
      if (applies("sharedRoomFor", kind)) need("sharedRoomFor");
      if (applies("bedrooms", kind) && v.bedrooms !== null && v.rooms !== null && v.bedrooms > v.rooms && !into.bedrooms) {
        into.bedrooms = "bedroomsAboveRooms";
      }
      break;
    case "building":
      if (applies("floor", kind) && v.floor !== null && v.totalFloors !== null && v.floor > v.totalFloors && !into.floor) {
        into.floor = "floorAboveTotal";
      }
      break;
    case "features":
      break;
    case "text": {
      need("title");
      need("description");
      const title = v.title.trim();
      const description = v.description.trim();
      if (!into.title && title.length < LIMITS.titleMin) into.title = "titleTooShort";
      if (!into.description && description.length < LIMITS.descriptionMin) into.description = "descriptionTooShort";
      break;
    }
    case "amenities":
      break;
    case "jewish":
      break;
    case "price":
      // Hotels may leave their own price empty and show "from" the cheapest room type.
      if (kind.dealType !== "HOTEL_ROOM" && (blank(v.price) || v.price === 0)) into.price = into.price ?? "priceRequired";
      if (!PRICE_PERIODS_BY_DEAL[kind.dealType].includes(v.pricePeriod)) into.pricePeriod = "pickOne";
      break;
    case "booking":
      // Booked stays are priced per night. Hotels may leave their own price empty and show
      // "from" the cheapest room type (each room type then has its own nightly price).
      if (kind.dealType !== "HOTEL_ROOM" && (blank(v.price) || v.price === 0 || v.pricePeriod !== "NIGHT")) {
        into.price = into.price ?? "priceRequired";
      }
      if (kind.dealType === "SHORT_STAY") need("maxGuests");
      if (v.paymentMethodsAtCheckIn.length === 0) into.paymentMethodsAtCheckIn = "paymentMethodRequired";
      // A month is never cheaper per night than a week (the 28+ discount is at least the 7+ one).
      if (
        !into.monthlyDiscountPct &&
        v.weeklyDiscountPct !== null &&
        v.monthlyDiscountPct !== null &&
        v.weeklyDiscountPct > 0 &&
        v.monthlyDiscountPct > 0 &&
        v.monthlyDiscountPct < v.weeklyDiscountPct
      ) {
        into.monthlyDiscountPct = "monthlyBelowWeekly";
      }
      break;
    case "contact": {
      if (v.contactMethods.length === 0) into.contactMethods = "contactRequired";
      v.contactMethods.forEach((method) => {
        const problem = contactValueProblem(method.channel, method.value);
        if (problem) into[`contact.${method.channel}`] = problem;
      });
      break;
    }
  }
}

/**
 * Everything wrong with a step for this listing kind (empty object = step complete).
 * Used by the browser to block "Next" and by publish to list missing requirements.
 */
export function stepIssues(step: SavableStepKey, values: WizardValues, kind: ListingKind): StepIssues {
  const issues: StepIssues = {};
  const parsed = stepSaveSchemas[step].safeParse(pickStepData(step, values));
  if (!parsed.success) collectZodIssues(parsed.error, issues);
  requiredIssues(step, values, kind, issues);
  return issues;
}

/** Issues that are "you haven't filled this in yet" (shown only after the owner presses Next). */
export const REQUIRED_CODES = new Set([
  "required",
  "cityRequired",
  "pinRequired",
  "priceRequired",
  "paymentMethodRequired",
  "contactRequired",
  "pickOne",
  "titleTooShort",
  "descriptionTooShort",
]);

// ─── Other actions' inputs ────────────────────────────────────

export const photoIdsSchema = z.array(id).min(1).max(siteConfig.listings.maxPhotos * 4);

export const photoAltSchema = z.string().trim().max(LIMITS.altMax, "tooLong");

/** A photo's room label (round 3, brief 6.1), or null to clear it. */
export const photoRoomSchema = z.enum(PHOTO_ROOMS).nullable();

const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate");

/** Owner-blocked days as inclusive ranges ("2026-03-10" → "2026-03-12" blocks 3 nights). */
export const availabilitySchema = z
  .array(z.object({ start: dayString, end: dayString }).refine((r) => r.start <= r.end, "invalidRange"))
  .max(400);

/**
 * The amenities a room type can have on its own (round 3, founder's answer 3), from the listing
 * vocabulary (src/lib/listing/fields.ts): the in-room ones. The hotel's own (pool, parking…) stay
 * on the listing.
 */
export const ROOM_TYPE_AMENITIES = [
  "wifi",
  "air_conditioning",
  "heating",
  "tv",
  "workspace",
  "balcony_terrace",
  "full_kitchen",
  "washing_machine",
  "crib_high_chair",
  "wheelchair_access",
] as const satisfies readonly (typeof AMENITIES)[number][];

/**
 * A hotel room type (round 3, founder's answer 3). `quantity`: "כמה חדרים כאלה להציע בבית", the
 * identical rooms Bayit may sell per night (empty means 1). `active` false switches the room type
 * off for new guests (its bookings, blocks and prices stay). `weekendPrice`: Friday and Saturday
 * nights (holiday prices are set in the calendar).
 */
export const roomTypeSchema = z
  .object({
    id: id.optional(),
    name: text(LIMITS.roomTypeNameMax).min(2, "required"),
    price: z.number({ error: "priceRequired" }).positive("priceRequired").max(LIMITS.priceMax, "tooLarge"),
    currency: enabledCurrency,
    pricePeriod: z.enum(ROOM_TYPE_PERIODS as [PricePeriod, ...PricePeriod[]]),
    weekendPrice: money(LIMITS.priceMax).optional().default(null),
    maxGuests: int(1, 50),
    bedsSingle: int(0, 50),
    bedsDouble: int(0, 50),
    bedsSofa: int(0, 50).optional().default(null),
    sizeSqm: decimal(1, 10_000),
    amenities: uniqueKeys(ROOM_TYPE_AMENITIES).optional().default([]),
    quantity: int(1, 1000),
    active: z.boolean().optional().default(true),
  })
  // A weekend price is per night: only for room types priced per night, and never 0.
  .transform((v) => ({ ...v, weekendPrice: v.pricePeriod === "NIGHT" && v.weekendPrice ? v.weekendPrice : null }));
export type RoomTypeInput = z.input<typeof roomTypeSchema>;

export const translationSchema = z.object({
  locale: z.enum(locales),
  title: text(LIMITS.titleMax).min(1, "required"),
  description: text(LIMITS.descriptionMax).min(1, "required"),
});
