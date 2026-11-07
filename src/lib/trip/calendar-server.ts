import "server-only";
import { getTranslations } from "next-intl/server";
import { siteConfig, type AppLocale } from "@/config/site";
import { DEFAULT_CHECK_IN_TIME } from "@/lib/booking/dates";
import { formatBookingMoney } from "@/lib/booking/price-lines";
import type { GuestTrip } from "@/lib/booking/queries";
import { formatDate } from "@/lib/format";
import { clockLabel } from "@/lib/listing/check-times";
import { absoluteUrl, siteUrl } from "@/lib/site-url";
import { buildTripIcs, googleCalendarUrl, type TripCalendarInput } from "./ics";

/**
 * "הוספה ליומן" texts for one trip (server): the event of the downloaded file and of the Google
 * Calendar link, in the guest's language (messages "booking.ics"). Only for the guest of a
 * confirmed booking with the address revealed (callers check `trip.reveal`).
 */
export async function tripCalendarInput(trip: GuestTrip, locale: AppLocale): Promise<{ file: TripCalendarInput; google: TripCalendarInput }> {
  const t = await getTranslations({ locale, namespace: "booking" });
  const brand = siteConfig.localizedName[locale] ?? siteConfig.name;
  const url = absoluteUrl(`/${locale}${trip.path}`);
  const reveal = trip.reveal;
  const phone = reveal?.contact.phone ?? reveal?.contact.whatsapp ?? null;
  // The free-cancellation deadline and the default 14:00 use the same rule (src/lib/booking/dates.ts).
  const checkInTime = trip.checkInFlexible ? null : (trip.checkInFrom ?? DEFAULT_CHECK_IN_TIME);
  const checkOutTime = trip.checkOutFlexible ? null : trip.checkOutUntil;
  const day = (value: string) => formatDate(value, locale, { weekday: "short", day: "numeric", month: "long" });
  const arrival = trip.checkInFlexible
    ? t("ics.checkInFlexible", { date: day(trip.checkIn) })
    : t("ics.checkIn", { date: day(trip.checkIn), time: clockLabel(checkInTime ?? DEFAULT_CHECK_IN_TIME, locale) });
  const departure = trip.checkOutFlexible
    ? t("ics.checkOutFlexible", { date: day(trip.checkOut) })
    : trip.checkOutUntil
      ? t("ics.checkOut", { date: day(trip.checkOut), time: clockLabel(trip.checkOutUntil, locale) })
      : "";
  const base = {
    code: trip.code,
    checkIn: trip.checkIn,
    checkOut: trip.checkOut,
    checkInTime,
    checkOutTime,
    summary: t("ics.summary", { title: trip.listing.title, code: trip.code }),
    location: reveal?.address ?? null,
    url,
  };
  const file: TripCalendarInput = {
    ...base,
    description: [
      t("ics.booking", { code: trip.code, brand }),
      arrival,
      departure,
      reveal?.hostName ? t("ics.host", { name: reveal.hostName }) : "",
      phone ? t("ics.phone", { phone }) : "",
      t("ics.pay", { amount: formatBookingMoney(trip.total, trip.currency, locale) }),
      t("ics.details", { url }),
    ],
    lat: reveal?.lat ?? null,
    lng: reveal?.lng ?? null,
  };
  // Google keeps the link in its address bar and history: no host name or phone in it.
  const google: TripCalendarInput = { ...base, description: [t("ics.booking", { code: trip.code, brand }), arrival, departure, t("ics.details", { url })] };
  return { file, google };
}

/** The host name of every event UID ("bayit.example" when SITE_URL is not a URL). */
export function calendarHost(): string {
  try {
    return new URL(siteUrl()).hostname || "bayit.example";
  } catch {
    return "bayit.example";
  }
}

export async function tripIcsFile(trip: GuestTrip, locale: AppLocale, now: Date = new Date()): Promise<string> {
  const { file } = await tripCalendarInput(trip, locale);
  return buildTripIcs(file, { host: calendarHost(), productName: siteConfig.name, now });
}

export async function tripGoogleCalendarUrl(trip: GuestTrip, locale: AppLocale): Promise<string> {
  const { google } = await tripCalendarInput(trip, locale);
  return googleCalendarUrl(google);
}
