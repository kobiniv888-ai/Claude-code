import type { CurrencyCode } from "./site";

/**
 * Per-country settings: THE one place for values that differ by country (brief round 3,
 * section 1 "country-ready"). Pure and client-safe. Georgia is the only country open for
 * posting; adding one later means adding its entry here (and its cities in the admin panel),
 * not hunting for "Asia/Tbilisi" or "112" across the code.
 *
 *   countryConfig(listing.countryCode).timezone      // "Asia/Tbilisi"
 *   countryConfig("GE").emergencyNumber               // "112"
 *   isInCountry("GE", lat, lng)                       // a pin inside Georgia?
 *
 * An unknown or missing code falls back to DEFAULT_COUNTRY, so old rows without a country keep
 * working. Never import ./site here at runtime (site.ts reads this file): types only.
 */

/** ISO 3166-1 alpha-2 codes Bayit knows about. Only `enabled` ones accept listings. */
export const SITE_COUNTRY_CODES = ["GE", "US", "GB", "AE"] as const;
export type SiteCountryCode = (typeof SITE_COUNTRY_CODES)[number];

/** The country of rows that do not say (City/Listing/JewishPlace.countryCode default to it too). */
export const DEFAULT_COUNTRY = "GE" satisfies SiteCountryCode;

type LatLng = { lat: number; lng: number };
/** [[south, west], [north, east]], ready for Leaflet's fitBounds. */
export type LatLngBoundsTuple = [[number, number], [number, number]];
export type BoundsBox = { north: number; south: number; east: number; west: number };

export type CountryConfig = {
  code: SiteCountryCode;
  /** Open for posting listings. */
  enabled: boolean;
  /** IANA time zone: booking nights, Shabbat times, dates in emails. */
  timezone: string;
  /** What maps show with no city chosen and no results (also the box they cannot be dragged far from). */
  mapBounds: LatLngBoundsTuple;
  /** A listing's pin must lie inside this (slightly larger) box: "is it in this country?". */
  pinBounds: BoundsBox;
  /** Map center when there is nothing else to show (the capital). */
  mapCenter: LatLng;
  /** The local currency hosts usually price in, and the default for visitors from this country. */
  localCurrency: CurrencyCode;
  /** Phone numbers typed without a country code belong to this country (listing contact phones). */
  defaultPhoneCountry: string;
  /** Police, ambulance and fire. */
  emergencyNumber: string;
};

/**
 * Only Georgia is filled in: the other codes exist so the code paths stay country-aware, and get
 * their real values (time zone, map area, currency, phone, emergency number) when they open.
 */
export const COUNTRIES: Readonly<Partial<Record<SiteCountryCode, CountryConfig>>> & { GE: CountryConfig } = {
  GE: {
    code: "GE",
    enabled: true,
    timezone: "Asia/Tbilisi",
    mapBounds: [
      [41.05, 40.0],
      [43.6, 46.75],
    ],
    pinBounds: { north: 43.65, south: 41.0, east: 46.8, west: 39.9 },
    mapCenter: { lat: 41.7151, lng: 44.8271 },
    localCurrency: "GEL",
    defaultPhoneCountry: "GE",
    emergencyNumber: "112",
  },
};

/** Countries that are planned but not open yet (shown nowhere; kept for the admin and the docs). */
export const PLANNED_COUNTRIES: readonly SiteCountryCode[] = SITE_COUNTRY_CODES.filter((code) => !COUNTRIES[code]?.enabled);

export function isSiteCountryCode(value: unknown): value is SiteCountryCode {
  return typeof value === "string" && (SITE_COUNTRY_CODES as readonly string[]).includes(value);
}

/** The settings of a country; unknown, missing or not-yet-configured codes get DEFAULT_COUNTRY's. */
export function countryConfig(code?: string | null): CountryConfig {
  const key = typeof code === "string" ? code.trim().toUpperCase() : "";
  return (isSiteCountryCode(key) ? COUNTRIES[key] : undefined) ?? COUNTRIES[DEFAULT_COUNTRY];
}

/** Codes of the countries open for posting, in SITE_COUNTRY_CODES order. */
export function enabledCountryCodes(): SiteCountryCode[] {
  return SITE_COUNTRY_CODES.filter((code) => COUNTRIES[code]?.enabled === true);
}

/** Is the point inside the country's pin box (inclusive)? */
export function isInCountry(code: string | null | undefined, lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  const box = countryConfig(code).pinBounds;
  return lat <= box.north && lat >= box.south && lng <= box.east && lng >= box.west;
}
