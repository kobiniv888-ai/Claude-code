/**
 * "בדיקה לפני פרסום": the host's mistake check (round 3, brief 6.1). Pure and client-safe; the
 * server loader is ./mistake-check-server.ts (it adds the price guide's verdict).
 *
 *   const { errors, warnings } = checkListingMistakes(input);
 *
 * ERRORS block publishing (the publish action and "Save changes" refuse on the server):
 *   - address_missing: no exact address for a short stay or hotel (guests get it after booking);
 *   - photos_too_few: fewer than 5 photos (siteConfig.listings.minPhotos; hotels count room photos);
 *   - contact_in_title / contact_in_description: a phone number, email, link or @username in the
 *     text (the risk engine's detector, @/lib/risk/contact-info).
 * WARNINGS (the host may publish anyway):
 *   - guests_below_beds / guests_above_beds (and room_… per hotel room type): max guests against
 *     what the beds sleep (single 1, double 2, sofa bed 2);
 *   - no_bathrooms: 0 bathrooms;
 *   - checkin_time_mismatch / checkout_time_mismatch: a time in the description that is not the
 *     check-in / check-out setting (./text-checks.ts, all 5 languages);
 *   - description_currency: a price in the description in another currency than the listing's;
 *   - title_language: the title's alphabet is not the "I'm writing in" language's;
 *   - price_far_below / price_far_above (room_…): far outside the price guide's usual range;
 *   - checkin_time_missing: no check-in time (and not "גמיש");
 *   - pin_outside_city: the pin is farther from the chosen city's center than the city reaches;
 *   - photo_rooms_missing: no photo labelled kitchen, bedroom or bathroom (hotels: bedroom, bathroom).
 *
 * Each issue names the wizard step that fixes it (`step`, a WizardStepKey) and its field. Messages:
 * wizard.mistakes.issues.<code> in messages/<locale>/wizard.json.
 */
import { siteConfig, type AppLocale, type CurrencyCode } from "@/config/site";
import type { DealType, PhotoRoom, PropertyType } from "@/generated/prisma/enums";
import { haversineMeters } from "@/lib/geo";
import { detectContactInfo, type ContactInfoFindings } from "@/lib/risk/contact-info";
import { applies, isBusinessListing, priceStepFor, stepsFor, usesBookingStep, type ListingKind, type WizardStepKey } from "@/lib/wizard/steps";
import { clockMinutes, findCurrencyMentions, findStayTimes, titleScriptMismatch, type StayTimeKind } from "./text-checks";

// ─── Contract (shared with the publish action and the admin review page) ─

export type MistakeIssue = {
  code: string;
  severity: "error" | "warning";
  field?: string;
  step?: string;
  params?: Record<string, string | number>;
};

export type MistakeResult = { errors: MistakeIssue[]; warnings: MistakeIssue[] };

/** The price guide's verdict on a price (pricePosition in @/lib/pricing/guide). */
export type MistakePricePosition = "far_below" | "below" | "typical" | "above" | "far_above";

export type MistakePhoto = { room: PhotoRoom | null; roomTypeId?: string | null };

export type MistakeRoomType = {
  id: string;
  /** The name in the host's language. */
  name: string;
  maxGuests: number | null;
  bedsSingle: number | null;
  bedsDouble: number | null;
  bedsSofa?: number | null;
  currency?: CurrencyCode;
  pricePosition?: MistakePricePosition | null;
};

export type MistakeInput = {
  dealType: DealType;
  propertyType: PropertyType;
  /** "I'm writing in" (Listing.originalLocale). */
  originalLocale: AppLocale;
  title: string;
  description: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  /** The chosen city's center (and slug, for its radius). */
  city: { slug: string; lat: number; lng: number } | null;
  currency: CurrencyCode;
  maxGuests: number | null;
  bedsSingle: number | null;
  bedsDouble: number | null;
  bedsSofa: number | null;
  bathrooms: number | null;
  checkInFrom: string | null;
  checkOutUntil: string | null;
  checkInFlexible: boolean;
  checkOutFlexible: boolean;
  /** Every photo of the listing (main photos and hotel room-type photos). */
  photos: MistakePhoto[];
  roomTypes?: MistakeRoomType[];
  /** The price guide's verdict on the listing's own price (null: no price, or not enough data). */
  pricePosition?: MistakePricePosition | null;
};

// ─── Rules ────────────────────────────────────────────────────

export const MISTAKE_ERROR_CODES = ["address_missing", "photos_too_few", "contact_in_title", "contact_in_description"] as const;

export const MISTAKE_WARNING_CODES = [
  "pin_outside_city",
  "guests_below_beds",
  "guests_above_beds",
  "room_guests_below_beds",
  "room_guests_above_beds",
  "no_bathrooms",
  "title_language",
  "description_currency",
  "checkin_time_mismatch",
  "checkout_time_mismatch",
  "checkin_time_missing",
  "photo_rooms_missing",
  "price_far_below",
  "price_far_above",
  "room_price_far_below",
  "room_price_far_above",
] as const;

export type MistakeCode = (typeof MISTAKE_ERROR_CODES)[number] | (typeof MISTAKE_WARNING_CODES)[number];

/** How many guests each bed sleeps (brief 6.1). */
export const BED_SLEEPS = { single: 1, double: 2, sofa: 2 } as const;

/**
 * How far (km) a pin may be from the chosen city's center. The database has only each city's
 * center, so the radius is generous (a false "outside the city" is worse than a missed one):
 * Tbilisi and Batumi (with Gonio and Makhinjauri) reach far; the other towns get 15 km.
 */
export const CITY_PIN_RADIUS_KM: Record<string, number> = { tbilisi: 25, batumi: 20 };
export const DEFAULT_CITY_PIN_RADIUS_KM = 15;

/** Rooms a guest expects to see a photo of. Hotels: no kitchen. */
export function requiredPhotoRooms(kind: ListingKind): PhotoRoom[] {
  return isBusinessListing(kind) ? ["BEDROOM", "BATHROOM"] : ["BEDROOM", "KITCHEN", "BATHROOM"];
}

/** How many guests the beds sleep (null when no bed was entered). */
export function bedsSleep(beds: { bedsSingle: number | null; bedsDouble: number | null; bedsSofa?: number | null }): number | null {
  const single = beds.bedsSingle ?? 0;
  const double = beds.bedsDouble ?? 0;
  const sofa = beds.bedsSofa ?? 0;
  const total = single * BED_SLEEPS.single + double * BED_SLEEPS.double + sofa * BED_SLEEPS.sofa;
  return total > 0 ? total : null;
}

function contactParams(findings: ContactInfoFindings): Record<string, string> | null {
  if (findings.phones[0]) return { kind: "phone", value: findings.phones[0] };
  if (findings.emails[0]) return { kind: "email", value: findings.emails[0] };
  if (findings.urls[0]) return { kind: "link", value: findings.urls[0] };
  if (findings.handles[0]) return { kind: "handle", value: findings.handles[0] };
  return null;
}

/** The step that holds the check-in / check-out pickers. */
function timesStep(kind: ListingKind): WizardStepKey {
  return usesBookingStep(kind) ? "booking" : "amenities";
}

/** The step that holds "max guests" (the booking step for booked stays, else size). */
function guestsStep(kind: ListingKind): WizardStepKey {
  return usesBookingStep(kind) ? "booking" : "size";
}

function timeIssues(input: MistakeInput, kind: ListingKind, add: (issue: MistakeIssue) => void) {
  if (!applies("checkInOut", kind)) return;
  const mentions = findStayTimes(input.description);
  const settings: { kind: StayTimeKind; code: string; time: string | null; flexible: boolean; field: string }[] = [
    { kind: "checkIn", code: "checkin_time_mismatch", time: input.checkInFrom, flexible: input.checkInFlexible, field: "checkInFrom" },
    { kind: "checkOut", code: "checkout_time_mismatch", time: input.checkOutUntil, flexible: input.checkOutFlexible, field: "checkOutUntil" },
  ];
  for (const setting of settings) {
    const written = mentions.filter((m) => m.kind === setting.kind);
    const minutes = clockMinutes(setting.time);
    if (setting.kind === "checkIn" && !setting.flexible && minutes === null) {
      add({
        code: "checkin_time_missing",
        severity: "warning",
        field: setting.field,
        step: timesStep(kind),
        ...(written[0] ? { params: { written: written[0].time.text } } : {}),
      });
      continue;
    }
    // "גמיש" agrees with any time; no time set and no mention: nothing to compare.
    if (setting.flexible || minutes === null || written.length === 0) continue;
    if (written.some((m) => m.time.minutes.includes(minutes))) continue;
    add({
      code: setting.code,
      severity: "warning",
      field: setting.field,
      step: timesStep(kind),
      params: { written: written[0].time.text, setting: setting.time! },
    });
  }
}

function guestIssues(
  beds: { maxGuests: number | null; bedsSingle: number | null; bedsDouble: number | null; bedsSofa?: number | null },
  room: string | null,
  kind: ListingKind,
  add: (issue: MistakeIssue) => void,
) {
  const sleeps = bedsSleep(beds);
  if (sleeps === null || beds.maxGuests === null || beds.maxGuests === sleeps) return;
  const below = beds.maxGuests < sleeps;
  const params = { maxGuests: beds.maxGuests, sleeps, ...(room !== null ? { room } : {}) };
  if (room !== null) {
    add({ code: below ? "room_guests_below_beds" : "room_guests_above_beds", severity: "warning", field: "maxGuests", step: "rooms", params });
  } else if (below) {
    add({ code: "guests_below_beds", severity: "warning", field: "maxGuests", step: guestsStep(kind), params });
  } else {
    add({ code: "guests_above_beds", severity: "warning", field: "beds", step: "size", params });
  }
}

/** Every mistake in a listing, errors first; each list in the order of the wizard's steps. */
export function checkListingMistakes(input: MistakeInput): MistakeResult {
  const kind: ListingKind = { dealType: input.dealType, propertyType: input.propertyType };
  const isHotel = input.dealType === "HOTEL_ROOM";
  const roomTypes = input.roomTypes ?? [];
  const issues: MistakeIssue[] = [];
  const add = (issue: MistakeIssue) => issues.push(issue);

  // ── Errors ──
  if ((input.dealType === "SHORT_STAY" || isHotel) && !input.address?.trim()) {
    add({ code: "address_missing", severity: "error", field: "address", step: "location" });
  }
  const photoCount = input.photos.filter((p) => isHotel || !p.roomTypeId).length;
  const { minPhotos } = siteConfig.listings;
  if (photoCount < minPhotos) {
    add({ code: "photos_too_few", severity: "error", step: "photos", params: { count: photoCount, min: minPhotos } });
  }
  const titleContact = contactParams(detectContactInfo(input.title));
  if (titleContact) add({ code: "contact_in_title", severity: "error", field: "title", step: "text", params: titleContact });
  const descriptionContact = contactParams(detectContactInfo(input.description));
  if (descriptionContact) {
    add({ code: "contact_in_description", severity: "error", field: "description", step: "text", params: descriptionContact });
  }

  // ── Warnings ──
  if (input.city && input.lat !== null && input.lng !== null) {
    const km = haversineMeters({ lat: input.lat, lng: input.lng }, input.city) / 1000;
    const radius = CITY_PIN_RADIUS_KM[input.city.slug] ?? DEFAULT_CITY_PIN_RADIUS_KM;
    if (km > radius) add({ code: "pin_outside_city", severity: "warning", field: "lat", step: "location", params: { km: Math.round(km) } });
  }
  if (applies("beds", kind)) guestIssues(input, null, kind, add);
  if (isBusinessListing(kind)) for (const room of roomTypes) guestIssues(room, room.name, kind, add);
  if (applies("bathrooms", kind) && input.bathrooms === 0) {
    add({ code: "no_bathrooms", severity: "warning", field: "bathrooms", step: "size" });
  }

  const detected = titleScriptMismatch(input.title, input.originalLocale);
  if (detected) {
    add({ code: "title_language", severity: "warning", field: "title", step: "text", params: { detected, setting: input.originalLocale } });
  }
  const ownCurrencies = new Set<string>([input.currency, ...roomTypes.map((r) => r.currency).filter((c): c is CurrencyCode => !!c)]);
  const seen = new Set<string>();
  for (const mention of findCurrencyMentions(input.description)) {
    if (ownCurrencies.has(mention.currency) || seen.has(mention.currency) || seen.size >= 3) continue;
    seen.add(mention.currency);
    add({
      code: "description_currency",
      severity: "warning",
      field: "description",
      step: "text",
      params: { written: mention.text, currency: mention.currency, listingCurrency: input.currency },
    });
  }

  timeIssues(input, kind, add);

  if (input.photos.length > 0) {
    const labelled = new Set(input.photos.map((p) => p.room).filter(Boolean));
    const missing = requiredPhotoRooms(kind).filter((room) => !labelled.has(room));
    if (missing.length > 0) add({ code: "photo_rooms_missing", severity: "warning", step: "photos", params: { rooms: missing.join(",") } });
  }

  const priceStep = priceStepFor(kind);
  if (input.pricePosition === "far_below" || input.pricePosition === "far_above") {
    add({ code: `price_${input.pricePosition}`, severity: "warning", field: "price", step: priceStep });
  }
  if (isBusinessListing(kind)) {
    for (const room of roomTypes) {
      if (room.pricePosition === "far_below" || room.pricePosition === "far_above") {
        add({ code: `room_price_${room.pricePosition}`, severity: "warning", field: "price", step: "rooms", params: { room: room.name } });
      }
    }
  }

  // In the order of the wizard's steps (stable within a step).
  const order = stepsFor(kind);
  const rank = (issue: MistakeIssue) => {
    const index = order.indexOf(issue.step as WizardStepKey);
    return index === -1 ? order.length : index;
  };
  const sorted = issues.map((issue, i) => ({ issue, i })).sort((a, b) => rank(a.issue) - rank(b.issue) || a.i - b.i).map((x) => x.issue);
  return {
    errors: sorted.filter((i) => i.severity === "error"),
    warnings: sorted.filter((i) => i.severity === "warning"),
  };
}

/** True when the listing may be published (no errors). */
export function canPublish(result: MistakeResult): boolean {
  return result.errors.length === 0;
}
