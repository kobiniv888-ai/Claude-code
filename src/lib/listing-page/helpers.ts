/**
 * Small pure helpers for the listing page and owner profile (client-safe).
 */
import { haversineMeters, walkingMinutes, type LatLng } from "@/lib/geo";
import type { ContactChannelKey } from "@/lib/listing/fields";

/** "Typically replies within …" bucket for User.avgReplyMinutes. */
export type ReplyTimeBucket = "hour" | "fewHours" | "day" | "days";

export function replyTimeBucket(minutes: number | null | undefined): ReplyTimeBucket | null {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes <= 60) return "hour";
  if (minutes <= 180) return "fewHours";
  if (minutes <= 24 * 60) return "day";
  return "days";
}

const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/**
 * A wall-clock "HH:MM" string as a Date on 1970-01-01 UTC, to format with
 * formatTime(date, locale, "UTC") — so "14:00" reads "2:00 PM" in English and "14:00" elsewhere.
 */
export function clockDate(value: string | null | undefined): Date | null {
  const match = value ? CLOCK.exec(value.trim()) : null;
  if (!match) return null;
  return new Date(Date.UTC(1970, 0, 1, Number(match[1]), Number(match[2])));
}

/** Price per m² in the owner's currency, rounded (sales). */
export function pricePerSqm(price: number | null, sizeSqm: number | null): number | null {
  if (!price || !sizeSqm || price <= 0 || sizeSqm <= 0) return null;
  return Math.round(price / sizeSqm);
}

/** Percent change from an old to a new price, rounded ("-8" for an 8% drop). */
export function priceChangePercent(oldPrice: number, newPrice: number): number | null {
  if (!(oldPrice > 0) || !(newPrice > 0)) return null;
  return Math.round(((newPrice - oldPrice) / oldPrice) * 100);
}

/** Clamp the description preview: true when the text is long enough to need "Show more". */
export function needsShowMore(text: string, limit = 600): boolean {
  return text.length > limit || text.split("\n").length > 8;
}

/** Valid IANA time zone, else the fallback. */
export function safeTimeZone(zone: string | null | undefined, fallback = "Asia/Tbilisi"): string {
  if (!zone) return fallback;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone;
  } catch {
    return fallback;
  }
}

/**
 * A language's name in the page language ("he" → "Hebrew" / "עברית"). Intl.DisplayNames only
 * returns names (no digits), so the "format numbers with @/lib/format" rule does not apply.
 */
export function languageName(code: string, locale: string): string {
  try {
    const names = new Intl.DisplayNames([locale, "en"], { type: "language", fallback: "code" });
    const name = names.of(code) ?? code;
    return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  } catch {
    return code;
  }
}

/**
 * The places within `radiusMeters` of `center`, nearest first, with the straight-line distance
 * and an estimated walking time (the listing map's synagogues and kosher places).
 */
export function placesNear<T extends LatLng>(
  places: readonly T[],
  center: LatLng,
  { radiusMeters = 2500, limit = 12 }: { radiusMeters?: number; limit?: number } = {},
): (T & { meters: number; minutes: number })[] {
  return places
    .map((place) => {
      const meters = Math.round(haversineMeters(center, place));
      return { ...place, meters, minutes: walkingMinutes(meters) };
    })
    .filter((place) => place.meters <= radiusMeters)
    .sort((a, b) => a.meters - b.meters)
    .slice(0, limit);
}

export type ContactLayout = {
  /** The big button (WhatsApp when the owner offers it, else their first channel). */
  primary: ContactChannelKey | null;
  /** "Show phone" when the owner takes calls (and calling is not already the primary). */
  phone: boolean;
  /** Everything else (Telegram, Viber, SMS, email…) for the small menu, in the owner's order. */
  more: ContactChannelKey[];
};

/** How the phone contact bar spreads the owner's channels over its buttons. */
export function contactLayout(channels: readonly ContactChannelKey[]): ContactLayout {
  const primary = channels.includes("WHATSAPP") ? "WHATSAPP" : (channels[0] ?? null);
  const phone = primary !== "PHONE" && channels.includes("PHONE");
  const more = channels.filter((channel) => channel !== primary && channel !== "PHONE");
  return { primary, phone, more };
}
