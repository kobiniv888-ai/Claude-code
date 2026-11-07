/**
 * "שמירה לשימוש בלי אינטרנט" (round 3, brief 7.1 and founder's answer 10; pure, client-safe).
 *
 * Nothing is saved automatically. When the guest taps the button, the trip page
 * (src/components/trip/offline-save.tsx) puts a fresh copy of ITS OWN page and the static files it
 * uses into the Cache Storage "bayit-trips", plus a small index. The service worker (public/sw.js)
 * then opens that copy for a navigation to the same address when the network fails — and only
 * for trip pages. Online, the network always wins; a visit refreshes the saved copy, and a page
 * without the trip's mark ("not found" for another account, the login page) deletes it. Logging out
 * deletes the whole cache (src/lib/auth/device-data.ts). A copy is kept until a week after
 * check-out. The service worker repeats the address pattern and the cache name: keep them equal
 * (offline.test.ts reads public/sw.js).
 */
import { locales } from "@/config/site";
import { BOOKING_CODE_ALPHABET, BOOKING_CODE_LENGTH, BOOKING_CODE_PREFIX } from "@/lib/booking/constants";
import { addDays } from "@/lib/booking/dates";

/** Cache Storage name (not versioned: public/sw.js keeps it when it updates its own cache). */
export const OFFLINE_TRIPS_CACHE = "bayit-trips";
/** The index of saved trips inside that cache (never requested from the server). */
export const OFFLINE_TRIPS_INDEX = "/offline-trips.json";
/** Days after check-out a saved copy is kept. */
export const OFFLINE_KEEP_DAYS_AFTER_CHECKOUT = 7;
/** At most this many static files are saved with a page. */
export const OFFLINE_MAX_ASSETS = 150;

/**
 * The attribute the trip page puts on its root for the signed-in guest's own booking
 * (data-offline-trip="BT-7K3Q9"). Account pages stream, so "not found" and the login redirect
 * still answer HTTP 200: a copy is saved (and kept) only when the page carries this mark.
 */
export const OFFLINE_TRIP_MARKER = "data-offline-trip";

/** True when the HTML is the real trip page of `code` (not "not found", not the login page). */
export function hasTripMarker(html: string, code: string): boolean {
  return html.includes(`${OFFLINE_TRIP_MARKER}="${code}"`);
}

/** "^/(he|en|ru|ar|ka)/account/trips/BT-[23456789A…Z]{5}$" — the only pages that may be saved. */
export const TRIP_PAGE_PATTERN = `^/(${locales.join("|")})/account/trips/${BOOKING_CODE_PREFIX}[${BOOKING_CODE_ALPHABET}]{${BOOKING_CODE_LENGTH}}$`;
const TRIP_PAGE = new RegExp(TRIP_PAGE_PATTERN);

/** True for a canonical trip page path ("/he/account/trips/BT-7K3Q9", no query). */
export function isTripPagePath(pathname: string): boolean {
  return TRIP_PAGE.test(pathname);
}

/**
 * The headers kept with a saved page: its type and its security headers (the nonce-based CSP
 * matches the nonces in that HTML), never cookies or caching headers.
 */
export const OFFLINE_PAGE_HEADERS = [
  "Content-Type",
  "Content-Security-Policy",
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Referrer-Policy",
  "Permissions-Policy",
] as const;

export function offlinePageHeaders(headers: Pick<Headers, "get">): Headers {
  const out = new Headers();
  for (const name of OFFLINE_PAGE_HEADERS) {
    const value = headers.get(name);
    if (value) out.set(name, value);
  }
  return out;
}

/** "/he/account/trips/BT-7K3Q9" → "BT-7K3Q9". */
export function tripCodeOfPath(pathname: string): string {
  return pathname.slice(pathname.lastIndexOf("/") + 1);
}

/** One saved trip in the index (what the offline page lists). */
export type OfflineTripEntry = {
  path: string;
  code: string;
  /** The listing's title, for the list on the offline page (render with dir="auto"). */
  title: string;
  checkIn: string;
  checkOut: string;
  /** The booking status when saved (a change re-saves the copy). */
  status: string;
  /** ISO time of the last save. */
  savedAt: string;
  /** Last day the copy is kept ("YYYY-MM-DD", Georgia). */
  keepUntil: string;
};

/** Last day a copy of a stay is kept: a week after check-out. */
export function offlineKeepUntil(checkOut: string): string {
  return addDays(checkOut, OFFLINE_KEEP_DAYS_AFTER_CHECKOUT);
}

/** A saved copy is dropped after its last day. */
export function isOfflineEntryExpired(entry: Pick<OfflineTripEntry, "keepUntil">, today: string): boolean {
  return entry.keepUntil < today;
}

/** The index JSON (unknown shape from the cache) → valid entries for trip pages only. */
export function parseOfflineIndex(value: unknown): OfflineTripEntry[] {
  const list = value && typeof value === "object" && Array.isArray((value as { trips?: unknown }).trips) ? (value as { trips: unknown[] }).trips : [];
  const out: OfflineTripEntry[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const strings = ["path", "code", "title", "checkIn", "checkOut", "status", "savedAt", "keepUntil"] as const;
    if (!strings.every((key) => typeof e[key] === "string")) continue;
    if (!isTripPagePath(e.path as string)) continue;
    out.push(Object.fromEntries(strings.map((key) => [key, e[key] as string])) as OfflineTripEntry);
  }
  return out;
}

/** The index with `entry` added (or replacing the same page). */
export function withOfflineEntry(entries: readonly OfflineTripEntry[], entry: OfflineTripEntry): OfflineTripEntry[] {
  return [...entries.filter((e) => e.path !== entry.path), entry];
}

const STATIC_PREFIXES = ["/_next/static/", "/icons/", "/brand/"];

/**
 * The files to save with a page: same-origin static files only (scripts, styles, fonts, the icon
 * sprite), never pages, API answers, photos from the media route or other sites. Deduplicated,
 * at most OFFLINE_MAX_ASSETS.
 */
export function offlineAssetUrls(urls: Iterable<string>, origin: string): string[] {
  const out = new Set<string>();
  for (const raw of urls) {
    let url: URL;
    try {
      url = new URL(raw, origin);
    } catch {
      continue;
    }
    if (url.origin !== origin || !STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) continue;
    url.hash = "";
    out.add(url.href);
    if (out.size >= OFFLINE_MAX_ASSETS) break;
  }
  return [...out];
}
