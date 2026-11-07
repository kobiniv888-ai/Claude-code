/**
 * Turns one auto-save of the post form into a database update (bug 2.2: patch saves).
 *
 * The browser sends only the answers the person changed (see ./patch.ts); `input` holds exactly
 * those keys, already validated with the step's zod schema picked to them. A key that is not in
 * `input` is never written, so an empty or outdated step can never overwrite a saved answer.
 * Derived columns (USD price, approximate map point, Shabbat-friendly, instant booking) are
 * recomputed from the new answer plus the saved ones.
 *
 * No database access here: the few lookups come in through `deps`, so the contract is unit-tested
 * step by step (step-update.test.ts). The server action is updateDraft in ./actions.ts.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { CurrencyCode } from "@/config/site";
import type { PricePeriod } from "@/generated/prisma/enums";
import { isInCountry } from "@/config/countries";
import { toUsd, type Rates } from "@/lib/currency/convert";
import type { LatLng } from "@/lib/geo";
import { BUSINESS_PROPERTY_TYPES, DEFAULT_PRICE_PERIOD, PROPERTY_TYPES_BY_DEAL, computeShabbatFriendly, type ContactMethod } from "@/lib/listing/fields";
import { isOwnPrivateUpload } from "@/lib/media";
import { isInstantDealType } from "@/lib/booking/constants";
import { stripTitleEmoji } from "@/lib/text/emoji";
import { contactValueProblem, PRICE_PERIODS_BY_DEAL, type ParsedStep } from "./schemas";
import { applies, isBusinessListing, usesBookingStep, type ListingKind, type SavableStepKey } from "./steps";

/** The listing columns buildStepUpdate reads (a ListingRow fits). */
export type StepUpdateListing = {
  id: string;
  status: string;
  dealType: ListingKind["dealType"];
  propertyType: ListingKind["propertyType"];
  countryCode: string;
  cityId: string | null;
  neighborhoodId: string | null;
  lat: number | null;
  lng: number | null;
  title: string;
  description: string;
  originalLocale: string;
  kosherCertPhotoKey: string | null;
  price: unknown;
  currency: string;
  pricePeriod: PricePeriod;
  paymentMethodsAtCheckIn: string[];
  contactMethods: unknown;
} & Record<string, unknown>;

export type StepUpdateUser = { id: string; businessName: string | null };

export type StepUpdateDeps = {
  getCity: (id: string) => Promise<{ id: string; countryCode: string } | null>;
  /** The ids of a city's neighborhoods. */
  getNeighborhoodIds: (cityId: string) => Promise<string[]>;
  getRates: () => Promise<Partial<Rates>>;
  /** The public, approximate map point of an exact pin (stable per listing). */
  mapPoint: (point: LatLng, listingId: string) => LatLng;
  /**
   * "≈ 5 דק׳ הליכה לים" / "למעליות" (brief 7.3): the Listing.seaWalkMinutes / liftWalkMinutes
   * columns to write for a pin in a city (walkMinutesFor in src/lib/geo/walk-targets.ts, by the
   * city's slug). Called whenever the pin or the city changes.
   */
  walkMinutes: (
    cityId: string | null,
    lat: number | null,
    lng: number | null,
  ) => Promise<Partial<{ seaWalkMinutes: number | null; liftWalkMinutes: number | null }>>;
  parseContactMethods: (value: unknown) => ContactMethod[];
  /**
   * The listing's holiday prices still to come for the whole place (DatePrice rows without a room
   * type, ending after today). They are amounts in the listing's currency, with no currency of
   * their own: a currency change would silently re-label them (price-2).
   */
  countFutureDatePrices: (listingId: string) => Promise<number>;
};

export type StepUpdate = {
  data: Prisma.ListingUpdateInput;
  /** Content the public sees changed (re-check on "Save changes"). */
  contentChanged: boolean;
  /** The original title/description/language changed: machine translations are stale. */
  textChanged: boolean;
  userUpdate?: Prisma.UserUpdateInput;
  fieldErrors?: Record<string, string[]>;
  priceChange?: { oldPrice: number; newPrice: number; currency: CurrencyCode };
};

type Patch<S extends SavableStepKey> = Partial<ParsedStep<S>>;

/**
 * A new currency while the listing has holiday prices still to come is refused: those prices are
 * amounts in the listing's currency ($110 for Chanukah would quietly become ₾110). The host
 * changes or deletes them in the calendar first ("datePricesExist").
 */
async function currencyChangeRefusal(v: { currency?: string | null }, listing: StepUpdateListing, deps: StepUpdateDeps): Promise<StepUpdate | null> {
  if (!has(v, "currency") || !v.currency || v.currency === listing.currency) return null;
  if ((await deps.countFutureDatePrices(listing.id)) === 0) return null;
  return { data: {}, contentChanged: false, textChanged: false, fieldErrors: { currency: ["datePricesExist"] } };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const orNull = (value: string) => (value.trim() === "" ? null : value.trim());
const money = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const NONE: StepUpdate = { data: {}, contentChanged: false, textChanged: false };
const invalid = (fieldErrors: Record<string, string[]>): StepUpdate => ({ ...NONE, fieldErrors });

/** True when the patch carries `key` (an explicit null or "" counts: it clears the answer). */
function has<T extends object>(patch: T, key: keyof T): boolean {
  return Object.prototype.hasOwnProperty.call(patch, key) && patch[key] !== undefined;
}

/** USD price for filters, from the new price/currency when sent, else the saved ones. */
async function usdPrice(
  patch: { price?: number | null; currency?: CurrencyCode },
  listing: StepUpdateListing,
  deps: StepUpdateDeps,
): Promise<number | null> {
  const price = has(patch, "price") ? (patch.price ?? null) : money(listing.price);
  const currency = (has(patch, "currency") ? patch.currency : listing.currency) as CurrencyCode;
  if (price === null || price <= 0) return null;
  return Math.round(toUsd(price, currency, await deps.getRates()) * 100) / 100;
}

function priceChangeOf(
  patch: { price?: number | null; currency?: CurrencyCode },
  listing: StepUpdateListing,
): StepUpdate["priceChange"] {
  if (!has(patch, "price") && !has(patch, "currency")) return undefined;
  const oldPrice = money(listing.price);
  const newPrice = has(patch, "price") ? (patch.price ?? null) : oldPrice;
  const currency = (has(patch, "currency") ? patch.currency : listing.currency) as CurrencyCode;
  if (listing.status === "DRAFT" || oldPrice === null || newPrice === null || newPrice <= 0) return undefined;
  if (oldPrice === newPrice && currency === listing.currency) return undefined;
  return { oldPrice, newPrice, currency };
}

/** A price period this deal type does not allow becomes its default (the patch is copied). */
function allowedPeriod<T extends { pricePeriod?: PricePeriod }>(patch: T, kind: ListingKind): T {
  if (!has(patch, "pricePeriod") || PRICE_PERIODS_BY_DEAL[kind.dealType].includes(patch.pricePeriod!)) return patch;
  return { ...patch, pricePeriod: DEFAULT_PRICE_PERIOD[kind.dealType] };
}

/**
 * "גמיש" and a time never both hold (round 3): "גמיש" empties the time, a time turns "גמיש" off.
 * Only the halves present in the patch decide, and a derived column is written only when the saved
 * row needs it (an untouched answer is never written).
 */
function flexibleTimes(
  patch: { checkInFrom?: string; checkOutUntil?: string; checkInFlexible?: boolean; checkOutFlexible?: boolean },
  listing: StepUpdateListing,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [timeKey, flexKey] of [
    ["checkInFrom", "checkInFlexible"],
    ["checkOutUntil", "checkOutFlexible"],
  ] as const) {
    const flexible = has(patch, flexKey) && patch[flexKey] === true;
    const time = has(patch, timeKey) ? orNull(patch[timeKey] ?? "") : undefined;
    if (flexible) {
      if (time !== undefined ? time !== null : listing[timeKey] != null) out[timeKey] = null;
    } else if (time) {
      if (has(patch, flexKey) || listing[flexKey] === true) out[flexKey] = false;
    }
  }
  return out;
}

/** Column → value for the keys present in `patch`, through `store` (default: as sent). */
function columns<T extends object>(patch: T, store: Partial<Record<keyof T, () => unknown>> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(patch) as (keyof T)[]) {
    if (!has(patch, key)) continue;
    const convert = store[key];
    out[key as string] = convert ? convert() : patch[key];
  }
  return out;
}

/** Any column differs from the saved row (money columns are Decimals: compared as numbers). */
function differs(data: Record<string, unknown>, listing: StepUpdateListing, moneyKeys: readonly string[] = []): boolean {
  return Object.entries(data).some(([key, value]) => {
    const before = listing[key];
    return !same(value, moneyKeys.includes(key) ? money(before) : before);
  });
}

export async function buildStepUpdate<S extends SavableStepKey>(
  step: S,
  input: Patch<S>,
  listing: StepUpdateListing,
  user: StepUpdateUser,
  deps: StepUpdateDeps,
): Promise<StepUpdate> {
  const kind: ListingKind = { dealType: listing.dealType, propertyType: listing.propertyType };
  switch (step) {
    case "deal": {
      const v = input as Patch<"deal">;
      if (!v.dealType) return NONE;
      const dealType = v.dealType;
      const allowed = PROPERTY_TYPES_BY_DEAL[dealType];
      const propertyType = allowed.includes(listing.propertyType) ? listing.propertyType : allowed[0];
      const pricePeriod = PRICE_PERIODS_BY_DEAL[dealType].includes(listing.pricePeriod) ? listing.pricePeriod : DEFAULT_PRICE_PERIOD[dealType];
      return {
        // Monthly rentals and sales are never booked on the site (short stays and hotels turn
        // instant booking on when their "הזמנות ומחיר" step is saved).
        data: { dealType, propertyType, pricePeriod, ...(usesBookingStep({ dealType }) ? {} : { bookingMode: "CONTACT" as const }) },
        contentChanged: dealType !== listing.dealType,
        textChanged: false,
      };
    }
    case "property": {
      const v = input as Patch<"property">;
      const data: Prisma.ListingUpdateInput = {};
      if (has(v, "propertyType")) {
        if (!PROPERTY_TYPES_BY_DEAL[listing.dealType].includes(v.propertyType!)) return invalid({ propertyType: ["pickOne"] });
        data.propertyType = v.propertyType;
      }
      const type = v.propertyType ?? listing.propertyType;
      const userUpdate: Prisma.UserUpdateInput | undefined =
        has(v, "businessName") && BUSINESS_PROPERTY_TYPES.includes(type) && v.businessName && v.businessName !== (user.businessName ?? "")
          ? { businessName: v.businessName }
          : undefined;
      return { data, contentChanged: has(v, "propertyType") && v.propertyType !== listing.propertyType, textChanged: false, userUpdate };
    }
    case "location": {
      const v = input as Patch<"location">;
      const data: Prisma.ListingUpdateInput = {};
      let cityId = listing.cityId;
      // The listing's country is its city's (src/config/countries.ts); no city yet = unchanged.
      let countryCode = listing.countryCode;
      if (has(v, "cityId")) {
        if (v.cityId) {
          const city = await deps.getCity(v.cityId);
          if (!city) return invalid({ cityId: ["cityRequired"] });
          cityId = city.id;
          countryCode = city.countryCode;
          data.city = { connect: { id: city.id } };
          data.countryCode = city.countryCode;
        } else {
          cityId = null;
          data.city = { disconnect: true };
        }
      }
      let neighborhoodId = listing.neighborhoodId;
      if (has(v, "neighborhoodId") || cityId !== listing.cityId) {
        // A neighborhood must belong to the (new) city.
        const wanted = has(v, "neighborhoodId") ? (v.neighborhoodId ?? null) : listing.neighborhoodId;
        neighborhoodId = wanted && cityId && (await deps.getNeighborhoodIds(cityId)).includes(wanted) ? wanted : null;
        if (neighborhoodId !== listing.neighborhoodId || has(v, "neighborhoodId")) {
          data.neighborhood = neighborhoodId ? { connect: { id: neighborhoodId } } : { disconnect: true };
        }
      }
      if (has(v, "address")) data.address = orNull(v.address!);
      let lat = listing.lat;
      let lng = listing.lng;
      if (has(v, "lat") || has(v, "lng")) {
        // The pin is one answer: a missing half keeps the saved half.
        const newLat = has(v, "lat") ? (v.lat ?? null) : listing.lat;
        const newLng = has(v, "lng") ? (v.lng ?? null) : listing.lng;
        const hasPin = newLat !== null && newLng !== null;
        if (hasPin && !isInCountry(countryCode, newLat, newLng)) return invalid({ lat: ["outsideGeorgia"] });
        lat = hasPin ? Number(newLat.toFixed(6)) : null;
        lng = hasPin ? Number(newLng.toFixed(6)) : null;
        const approx = hasPin ? deps.mapPoint({ lat: lat!, lng: lng! }, listing.id) : null;
        Object.assign(data, { lat, lng, approxLat: approx?.lat ?? null, approxLng: approx?.lng ?? null });
      }
      if (cityId !== listing.cityId || lat !== listing.lat || lng !== listing.lng) {
        // "≈ 5 דק׳ הליכה לים" / "למעליות" (brief 7.3): recomputed with the pin, in the same update.
        Object.assign(data, await deps.walkMinutes(cityId, lat, lng));
      }
      const changed = cityId !== listing.cityId || neighborhoodId !== listing.neighborhoodId || lat !== listing.lat || lng !== listing.lng;
      return { data, contentChanged: changed, textChanged: false };
    }
    // Round 1's "details" step, split in four (brief 5.7): each saves only its own fields.
    case "size":
    case "building":
    case "features":
    case "text": {
      const v = input as Patch<"size"> & Patch<"building"> & Patch<"features"> & Patch<"text">;
      const data = columns(v, {
        sharedRoomFor: () => (kind.propertyType === "ROOM" ? v.sharedRoomFor : null),
        cadastralCode: () => orNull(v.cadastralCode ?? ""),
        videoUrl: () => orNull(v.videoUrl ?? ""),
        tour360Url: () => orNull(v.tour360Url ?? ""),
        // Brief 2.4: titles are saved without emoji (descriptions keep theirs).
        title: () => stripTitleEmoji((v.title ?? "").trim()),
        description: () => (v.description ?? "").trim(),
      });
      const textChanged =
        step === "text" &&
        ((has(v, "title") && data.title !== listing.title) ||
          (has(v, "description") && data.description !== listing.description) ||
          (has(v, "originalLocale") && v.originalLocale !== listing.originalLocale));
      return { data: data as Prisma.ListingUpdateInput, contentChanged: differs(data, listing), textChanged };
    }
    case "amenities": {
      const v = input as Patch<"amenities">;
      const data = columns(v, {
        checkInFrom: () => orNull(v.checkInFrom ?? ""),
        checkOutUntil: () => orNull(v.checkOutUntil ?? ""),
        quietHoursFrom: () => orNull(v.quietHoursFrom ?? ""),
        quietHoursTo: () => orNull(v.quietHoursTo ?? ""),
      });
      Object.assign(data, flexibleTimes(v, listing));
      return { data: data as Prisma.ListingUpdateInput, contentChanged: differs(data, listing), textChanged: false };
    }
    case "jewish": {
      const v = input as Patch<"jewish">;
      const business = isBusinessListing(kind);
      if (has(v, "kosherCertPhotoKey") && v.kosherCertPhotoKey && v.kosherCertPhotoKey !== listing.kosherCertPhotoKey) {
        if (!isOwnPrivateUpload(v.kosherCertPhotoKey, user.id, "verification")) return invalid({ kosherCertPhotoKey: ["invalid"] });
      }
      const data = columns(v, {
        hotelJewishFeatures: () => (business ? v.hotelJewishFeatures : []),
        kosherCertName: () => (business ? orNull(v.kosherCertName ?? "") : null),
        kosherCertPhotoKey: () => (business ? (v.kosherCertPhotoKey ?? null) : null),
      });
      if (has(v, "shabbatFeatures")) data.isShabbatFriendly = computeShabbatFriendly(v.shabbatFeatures!);
      return { data: data as Prisma.ListingUpdateInput, contentChanged: differs(data, listing), textChanged: false };
    }
    case "price": {
      const v = allowedPeriod(input as Patch<"price">, kind);
      const refused = await currencyChangeRefusal(v, listing, deps);
      if (refused) return refused;
      const data = columns(v);
      if (has(v, "price") || has(v, "currency")) data.priceUsd = await usdPrice(v, listing, deps);
      if (has(v, "utilitiesIncluded") && v.utilitiesIncluded) data.utilitiesEstimate = null;
      const contentChanged = differs(
        Object.fromEntries(Object.entries(data).filter(([key]) => ["price", "currency", "deposit", "cleaningFee", "pricePeriod"].includes(key))),
        listing,
        ["price", "deposit", "cleaningFee"],
      );
      return { data: data as Prisma.ListingUpdateInput, contentChanged, textChanged: false, priceChange: priceChangeOf(v, listing) };
    }
    case "booking": {
      // "הזמנות ומחיר" (short stays and hotels, brief 5.6). Prices are per night; with at least one
      // payment method and a nightly price, instant booking is on.
      // The step sends NIGHT once the host enters a nightly price; an older weekly price is kept as
      // it was (never silently read as a nightly one) and the listing is not bookable until then.
      const v = allowedPeriod(input as Patch<"booking">, kind);
      const refused = await currencyChangeRefusal(v, listing, deps);
      if (refused) return refused;
      const bookable = usesBookingStep(kind);
      const data = columns(v, {
        weekendPrice: () => (bookable && v.weekendPrice !== null && v.weekendPrice !== undefined && v.weekendPrice > 0 ? v.weekendPrice : null),
        cleaningFee: () => (applies("cleaningFee", kind) ? v.cleaningFee : null),
        deposit: () => (applies("deposit", kind) ? v.deposit : null),
        checkInFrom: () => orNull(v.checkInFrom ?? ""),
        checkOutUntil: () => orNull(v.checkOutUntil ?? ""),
      });
      Object.assign(data, flexibleTimes(v, listing));
      const before = differs(data, listing, ["price", "weekendPrice", "cleaningFee", "deposit"]);
      if (Object.keys(data).length > 0) {
        if (has(v, "price") || has(v, "currency")) data.priceUsd = await usdPrice(v, listing, deps);
        const period = has(v, "pricePeriod") ? v.pricePeriod : listing.pricePeriod;
        const methods = has(v, "paymentMethodsAtCheckIn") ? v.paymentMethodsAtCheckIn! : listing.paymentMethodsAtCheckIn;
        // Hotels too (round 3, phase 4): guests book them by room type, and only while the hotel
        // has an active room type (isInstantBookable, src/lib/booking/terms.ts); until then the
        // listing page offers "שאלה למארח" and the step shows a hint to add room types.
        data.bookingMode = bookable && isInstantDealType(kind.dealType) && period === "NIGHT" && methods.length > 0 ? "INSTANT" : "CONTACT";
      }
      return { data: data as Prisma.ListingUpdateInput, contentChanged: before, textChanged: false, priceChange: priceChangeOf(v, listing) };
    }
    case "contact": {
      const v = input as Patch<"contact">;
      // Live listings only ever store contact values that work; drafts may hold half-typed ones.
      if (listing.status !== "DRAFT" && v.contactMethods) {
        const fieldErrors: Record<string, string[]> = {};
        for (const method of v.contactMethods) {
          const problem = contactValueProblem(method.channel, method.value);
          if (problem) fieldErrors[`contact.${method.channel}`] = [problem];
        }
        if (Object.keys(fieldErrors).length > 0) return invalid(fieldErrors);
      }
      const data = columns(v, {
        contactMethods: () => v.contactMethods as unknown as Prisma.InputJsonValue,
        contactHoursFrom: () => orNull(v.contactHoursFrom ?? ""),
        contactHoursTo: () => orNull(v.contactHoursTo ?? ""),
      });
      const contentChanged = has(v, "contactMethods") && !same(v.contactMethods, deps.parseContactMethods(listing.contactMethods));
      return { data: data as Prisma.ListingUpdateInput, contentChanged, textChanged: false };
    }
  }
  return NONE;
}
