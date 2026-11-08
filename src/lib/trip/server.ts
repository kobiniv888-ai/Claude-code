import "server-only";
import type { AppLocale } from "@/config/site";
import { countryConfig } from "@/config/countries";
import type { JewishPlaceType } from "@/generated/prisma/enums";
import { pickLocalized } from "@/i18n/locale";
import { verifiedPhoneOf } from "@/lib/auth/phone-once";
import { addDays } from "@/lib/booking/dates";
import { canRevealHostContact } from "@/lib/booking/policy";
import { parseContactMethods } from "@/lib/contact/links";
import { db } from "@/lib/db";
import { taintObject } from "@/lib/security/taint";
import { haversineMeters, walkingMinutes } from "@/lib/geo";
import { publicWalkMinutes } from "@/lib/geo/public-walk";
import { getHolidaysInRange, holidayName, type HolidayKey } from "@/lib/hebcal";
import { timedObservances, type GeoPoint } from "@/lib/hebcal/core";
import { houseRules, type HouseRule } from "@/lib/listing-page/highlights";
import { tripContactButtons, type TripContactButton } from "./contact";
import { isMapPoint, walkingDirectionsUrl, type MapPoint } from "./map-links";
import {
  OBSERVANCE_PADDING_DAYS,
  describeWindow,
  groupObservances,
  restNights,
  windowsForStay,
  type ObservanceWindow,
} from "./observance";

/**
 * What the trip page shows beyond getGuestTrip() (src/lib/booking/queries.ts): the house rules,
 * every contact method the host chose, and — only when the stay includes a Friday night or a
 * night of Yom Tov (./observance.ts) — candle-lighting and Havdalah times for the city, the nearest
 * VERIFIED synagogue, Chabad house and kosher place with walking times, and whether the host
 * answers on Shabbat.
 *
 * Call it only for a trip getGuestTrip() returned for this guest; it checks the guest again. The
 * host's contact methods and the walking times from the exact pin need `revealed` (the guest of a
 * confirmed or completed booking, src/lib/booking/policy.ts canRevealHostContact).
 */

export type TripPlaceKind = "synagogue" | "chabad" | "kosher";

export type TripPlace = {
  kind: TripPlaceKind;
  /** In the guest's language (render with dir="auto"). */
  name: string;
  address: string | null;
  /** ≈ walking minutes from the exact pin (straight line × detour factor, rounded to 50 m). */
  minutes: number;
  /** Google Maps walking directions from the place. */
  directions: string | null;
};

export type ObservanceKind = "shabbat" | "holiday" | "both";

export type TripObservanceWindow = ObservanceWindow & {
  /** "שבת", "ראש השנה", "שבת · סוכות" in the guest's language. */
  title: string;
};

export type TripShabbat = {
  /** What the stay includes: a Shabbat, a holiday, or both (the card's title). */
  kind: ObservanceKind;
  /** The city the times are for, in the guest's language (null: the listing's own pin). */
  cityName: string | null;
  /** Show times in this zone. */
  timezone: string;
  /** Empty when the place has no coordinates (the page links to the Jewish life calendar). */
  windows: TripObservanceWindow[];
  /** Verified places only, nearest of each kind within 5 km; empty when none is known. */
  places: TripPlace[];
  /** "המארח לא עונה בשבת": the host keeps Shabbat or turned "no replies on Shabbat" on. */
  hostNoReply: boolean;
};

export type TripExtras = {
  rules: HouseRule[];
  /** [] unless the host's contact is revealed to this guest. */
  contactButtons: TripContactButton[];
  /** The host's contact hours ("09:00"–"21:00"), when set. */
  contactHours: { from: string; to: string } | null;
  /** Null unless the stay includes Shabbat or Yom Tov (and the booking is confirmed). */
  shabbat: TripShabbat | null;
  /** The emergency number of the listing's country ("112"). */
  emergencyNumber: string;
  /** The exact pin (revealed only). */
  point: MapPoint | null;
};

const PLACES_RADIUS_M = 5_000;
const ROUND_TO_M = 50;

const PLACE_TYPES: Record<TripPlaceKind, JewishPlaceType[]> = {
  synagogue: ["SYNAGOGUE"],
  chabad: ["CHABAD_HOUSE"],
  kosher: ["KOSHER_RESTAURANT", "KOSHER_SHOP"],
};

/** The nearest verified, active, non-demo place of each kind within 5 km of the exact pin. */
async function verifiedPlacesNear(point: MapPoint, locale: AppLocale): Promise<TripPlace[]> {
  const dLat = PLACES_RADIUS_M / 111_320;
  const dLng = PLACES_RADIUS_M / (111_320 * Math.max(0.2, Math.cos((point.lat * Math.PI) / 180)));
  const rows = await db.jewishPlace.findMany({
    where: {
      // Brief 5.9 / 7.1: never invented or demo places on a trip page, only places the team checked.
      active: true,
      isDemo: false,
      verifiedAt: { not: null },
      lat: { gte: point.lat - dLat, lte: point.lat + dLat },
      lng: { gte: point.lng - dLng, lte: point.lng + dLng },
    },
    select: { id: true, type: true, names: true, address: true, lat: true, lng: true },
    take: 500,
  });
  const places: TripPlace[] = [];
  for (const kind of Object.keys(PLACE_TYPES) as TripPlaceKind[]) {
    let best: { row: (typeof rows)[number]; meters: number } | null = null;
    for (const row of rows) {
      if (!PLACE_TYPES[kind].includes(row.type)) continue;
      const meters = haversineMeters(point, row);
      if (meters <= PLACES_RADIUS_M && (!best || meters < best.meters)) best = { row, meters };
    }
    if (!best) continue;
    const name = pickLocalized(best.row.names, locale);
    if (!name) continue;
    const rounded = Math.max(ROUND_TO_M, Math.round(best.meters / ROUND_TO_M) * ROUND_TO_M);
    places.push({
      kind,
      name,
      address: best.row.address ? pickLocalized(best.row.address, locale) || null : null,
      // Shown like every other walking time: rounded up to 5 minutes (security checklist 6.d).
      minutes: publicWalkMinutes(walkingMinutes(rounded)) ?? 5,
      directions: walkingDirectionsUrl(point, best.row),
    });
  }
  return places;
}

function ymd(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m, d };
}

/** Candle lighting and Havdalah for the stay (Israeli holiday schedule), or null when it has neither. */
export async function stayObservances(
  input: { checkIn: string; checkOut: string; place: GeoPoint | null },
  locale: AppLocale,
): Promise<{ kind: ObservanceKind; windows: TripObservanceWindow[] } | null> {
  const from = addDays(input.checkIn, -OBSERVANCE_PADDING_DAYS);
  const to = addDays(input.checkOut, OBSERVANCE_PADDING_DAYS);
  const yomTov = (await getHolidaysInRange(from, to, locale, { il: true })).filter((h) => h.isYomTov);
  const yomTovDays = new Set(yomTov.map((h) => h.date));
  const nights = restNights(input.checkIn, input.checkOut, yomTovDays);
  if (nights.length === 0) return null;
  const restDays = nights.map((night) => addDays(night, 1));
  const shabbat = restDays.some((day) => new Date(`${day}T00:00:00Z`).getUTCDay() === 6);
  const holiday = restDays.some((day) => yomTovDays.has(day));
  const kind: ObservanceKind = shabbat && holiday ? "both" : holiday ? "holiday" : "shabbat";
  if (!input.place) return { kind, windows: [] };
  const events = timedObservances(input.place, ymd(from), ymd(to), true);
  const windows = windowsForStay(groupObservances(events), input.checkIn, input.checkOut);
  const shabbatName = await holidayName("shabbat", locale);
  const titled = await Promise.all(
    windows.map(async (window) => {
      const { shabbat, holidays } = describeWindow<HolidayKey>(window, yomTov);
      const names = [...(shabbat ? [shabbatName] : []), ...(await Promise.all(holidays.map((key) => holidayName(key, locale))))];
      return { ...window, title: names.join(" · ") || shabbatName };
    }),
  );
  return { kind, windows: titled };
}

export async function getTripExtras(
  guestUserId: string,
  trip: { id: string; status: string; checkIn: string; checkOut: string; revealed: boolean },
  locale: AppLocale,
  options: { message: string; now?: Date },
): Promise<TripExtras | null> {
  const row = await db.booking.findFirst({
    where: { id: trip.id, guestUserId },
    select: {
      status: true,
      checkOut: true,
      listing: {
        select: {
          countryCode: true,
          lat: true,
          lng: true,
          smokingAllowed: true,
          petsAllowed: true,
          partiesAllowed: true,
          quietHoursFrom: true,
          quietHoursTo: true,
          contactMethods: true,
          contactHoursFrom: true,
          contactHoursTo: true,
          noReplyOnShabbat: true,
          jewishFeatures: true,
          city: { select: { names: true, lat: true, lng: true, timezone: true } },
          owner: { select: { keepsShabbat: true, phoneNumber: true, phoneNumberVerified: true } },
        },
      },
    },
  });
  if (!row) return null;
  // Exact pin and contact values: only the shaped extras below reach the page (5.k).
  taintObject("raw booking row", row);
  taintObject("raw listing row (exact pin, contacts)", row.listing);
  const { listing } = row;
  const country = countryConfig(listing.countryCode);
  // The exact pin, the host's contacts and the walks from the pin: only while the booking itself
  // still reveals them (confirmed or completed, until a week after check-out: security checklist
  // 6.f), checked again here on the database row, whatever the caller passed.
  const revealed = trip.revealed && canRevealHostContact({ status: row.status, guestUserId, checkOut: row.checkOut }, guestUserId, options.now);
  const point = revealed && isMapPoint(listing) ? { lat: listing.lat as number, lng: listing.lng as number } : null;

  let shabbat: TripShabbat | null = null;
  // Only for a stay still ahead or under way: a cancelled or past trip does not need candle times.
  if (trip.status === "CONFIRMED") {
    const city = listing.city && isMapPoint(listing.city) ? listing.city : null;
    const place: GeoPoint | null = city
      ? { lat: city.lat, lng: city.lng, timezone: city.timezone }
      : point
        ? { ...point, timezone: country.timezone }
        : null;
    try {
      const observances = await stayObservances({ checkIn: trip.checkIn, checkOut: trip.checkOut, place }, locale);
      if (observances) {
        shabbat = {
          kind: observances.kind,
          cityName: city ? pickLocalized(listing.city?.names, locale) || null : null,
          timezone: place?.timezone ?? country.timezone,
          windows: observances.windows,
          places: point ? await verifiedPlacesNear(point, locale) : [],
          hostNoReply: listing.noReplyOnShabbat || listing.owner.keepsShabbat || listing.jewishFeatures.includes("host_keeps_shabbat"),
        };
      }
    } catch (error) {
      // The rest of the trip page matters more than the times: show it without them.
      console.error("[trip] Shabbat times failed:", error);
    }
  }

  const contactButtons = revealed
    ? tripContactButtons(parseContactMethods(listing.contactMethods), {
        verifiedOwnerPhone: verifiedPhoneOf(listing.owner),
        country: listing.countryCode,
        message: options.message,
      })
    : [];

  return {
    rules: houseRules(listing),
    contactButtons,
    contactHours: revealed && listing.contactHoursFrom && listing.contactHoursTo ? { from: listing.contactHoursFrom, to: listing.contactHoursTo } : null,
    shabbat,
    emergencyNumber: country.emergencyNumber,
    point,
  };
}
