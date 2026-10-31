/**
 * Jewish Life places — vocabulary and small URL helpers (pure, client-safe).
 *
 * Place types come from the JewishPlaceType enum; in URLs we use short slugs
 * (`?type=synagogue,kosher-food`) so links stay readable in every language.
 */
import type { JewishPlaceType } from "@/generated/prisma/enums";
import { pickLocalized } from "@/i18n/locale";

export const JEWISH_PLACE_TYPES = [
  "SYNAGOGUE",
  "CHABAD_HOUSE",
  "KOSHER_RESTAURANT",
  "KOSHER_SHOP",
  "MIKVEH",
  "HERITAGE_SITE",
] as const satisfies readonly JewishPlaceType[];

export type { JewishPlaceType };

export const PLACE_TYPE_SLUGS: Record<JewishPlaceType, string> = {
  SYNAGOGUE: "synagogue",
  CHABAD_HOUSE: "chabad",
  KOSHER_RESTAURANT: "kosher-restaurant",
  KOSHER_SHOP: "kosher-shop",
  MIKVEH: "mikveh",
  HERITAGE_SITE: "heritage",
};

const TYPE_BY_SLUG = new Map<string, JewishPlaceType>(
  JEWISH_PLACE_TYPES.map((type) => [PLACE_TYPE_SLUGS[type], type]),
);

export function isJewishPlaceType(value: unknown): value is JewishPlaceType {
  return typeof value === "string" && (JEWISH_PLACE_TYPES as readonly string[]).includes(value);
}

/** `?type=synagogue,mikveh` (or repeated `type` params) → enum values, unknown slugs dropped, in canonical order. */
export function parsePlaceTypes(value: string | string[] | null | undefined): JewishPlaceType[] {
  if (!value) return [];
  const raw = (Array.isArray(value) ? value : [value]).flatMap((v) => v.split(","));
  const found = new Set<JewishPlaceType>();
  for (const part of raw) {
    const slug = part.trim().toLowerCase();
    const type = TYPE_BY_SLUG.get(slug) ?? (isJewishPlaceType(part.trim()) ? (part.trim() as JewishPlaceType) : null);
    if (type) found.add(type);
  }
  return JEWISH_PLACE_TYPES.filter((type) => found.has(type));
}

/** Enum values → `synagogue,mikveh` (empty string for "all types"). */
export function serializePlaceTypes(types: readonly JewishPlaceType[]): string {
  return JEWISH_PLACE_TYPES.filter((type) => types.includes(type))
    .map((type) => PLACE_TYPE_SLUGS[type])
    .join(",");
}

/** OpenStreetMap directions to a point (the visitor fills in the start, or the site uses their location). */
export function directionsUrl(point: { lat: number; lng: number }): string {
  const lat = point.lat.toFixed(6);
  const lng = point.lng.toFixed(6);
  return `https://www.openstreetmap.org/directions?route=%3B${lat}%2C${lng}#map=17/${lat}/${lng}`;
}

/** `tel:` link for a phone number typed by an admin ("+995 32 2 12-34-56" → "tel:+995322123456"). */
export function telHref(phone: string): string | null {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length < 3 || digits.length > 15) return null;
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

/** A safe http(s) URL for a website typed by an admin ("chabad.ge" → "https://chabad.ge/"), or null. */
export function safeWebsiteUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** "https://www.chabad.ge/tbilisi" → "chabad.ge/tbilisi" (for link text). */
export function displayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return `${host}${path}`;
  } catch {
    return url;
  }
}

// ─── Public place data (what the page sends to the browser) ───

/** A { he, en, ru, ar, ka } JSON value from the database. */
type LocalizedJson = unknown;

/** A place as stored (JSON fields still { he, en, ru, ar, ka }). */
export type JewishPlaceRecord = {
  id: string;
  type: JewishPlaceType;
  names: LocalizedJson;
  description: LocalizedJson | null;
  address: LocalizedJson | null;
  hours: LocalizedJson | null;
  lat: number;
  lng: number;
  phone: string | null;
  website: string | null;
  isDemo: boolean;
  city: { id: string; slug: string; names: LocalizedJson } | null;
};

/** A place with every text already in the visitor's language — safe to pass to client components. */
export type PublicJewishPlace = {
  id: string;
  type: JewishPlaceType;
  name: string;
  description: string | null;
  address: string | null;
  hours: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  phoneHref: string | null;
  website: string | null;
  isDemo: boolean;
  citySlug: string | null;
  cityName: string | null;
  directionsUrl: string;
};

export function toPublicPlace(place: JewishPlaceRecord, locale: string): PublicJewishPlace {
  const text = (value: unknown) => (value ? pickLocalized(value, locale).trim() || null : null);
  const phone = place.phone?.trim() || null;
  const phoneHref = phone ? telHref(phone) : null;
  return {
    id: place.id,
    type: place.type,
    name: text(place.names) ?? "",
    description: text(place.description),
    address: text(place.address),
    hours: text(place.hours),
    lat: place.lat,
    lng: place.lng,
    phone: phoneHref ? phone : null,
    phoneHref,
    website: safeWebsiteUrl(place.website),
    isDemo: place.isDemo,
    citySlug: place.city?.slug ?? null,
    cityName: place.city ? text(place.city.names) : null,
    directionsUrl: directionsUrl(place),
  };
}
