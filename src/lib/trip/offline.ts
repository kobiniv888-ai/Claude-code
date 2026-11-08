/**
 * "שמירה לשימוש בלי אינטרנט" (round 3, brief 7.1 and founder's answer 10; pure, client-safe).
 *
 * Nothing is saved automatically. When the guest taps the button, the trip page
 * (src/components/trip/offline-save.tsx, browser helpers in ./offline-device.ts) puts a fresh copy
 * of ITS OWN page and the static files it uses into the Cache Storage "bayit-trips", plus a small
 * index. Each entry names its OWNER (a keyed hash of the account, ./offline-server.ts): a copy
 * belongs to the account that saved it.
 *
 * The service worker (public/sw.js) opens that copy for a navigation to the same address when the
 * network fails, times out, breaks off mid-page or answers with a server error — and only for
 * trip pages. Otherwise the network wins. The copy is DELETED only on positive evidence that the
 * page is no longer this device's to keep: a redirect (signed out), 401/403/404/410, or a page
 * carrying OFFLINE_TRIP_GONE_MARKER ("not found" for another account, a cancelled trip, a trip
 * past its keep window); an error page without any mark keeps it. The page itself refreshes the
 * copy (savePage) when its content changed or the copy is old (needsResave).
 *
 * Every page of the site checks the owner (<PrivateCacheGuard>, src/app/[locale]/layout.tsx):
 * signed out (expired, logged out everywhere, suspended, deleted) → the whole cache goes; another
 * account → the other account's copies go. Logging out deletes the whole cache too
 * (src/lib/auth/device-data.ts). A copy is kept until a week after check-out (pruned on every
 * navigation). The service worker repeats the address pattern, the cache name and the marks: keep
 * them equal (trip.test.ts reads public/sw.js; sw.test.ts runs it).
 */
import { locales } from "@/config/site";
import { BOOKING_CODE_ALPHABET, BOOKING_CODE_LENGTH, BOOKING_CODE_PREFIX } from "@/lib/booking/constants";
import { addDays } from "@/lib/booking/dates";
import { REVEAL_DAYS_AFTER_CHECKOUT } from "@/lib/booking/policy";

/** Cache Storage name (not versioned: public/sw.js keeps it when it updates its own cache). */
export const OFFLINE_TRIPS_CACHE = "bayit-trips";
/** The index of saved trips inside that cache (never requested from the server). */
export const OFFLINE_TRIPS_INDEX = "/offline-trips.json";
/**
 * Days after check-out a saved copy is kept: the same window as the exact address on the page
 * (security checklist 6.f, REVEAL_DAYS_AFTER_CHECKOUT in src/lib/booking/policy.ts).
 */
export const OFFLINE_KEEP_DAYS_AFTER_CHECKOUT = REVEAL_DAYS_AFTER_CHECKOUT;
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

/**
 * The attribute (always with the value "1") a page carries when a saved copy of this trip must be
 * deleted: the trip's "not found" page (another account, no such booking) and a trip page that
 * may no longer be kept (cancelled, past its keep window: offlineSaveAllowed). The service worker
 * looks for the attribute as written in HTML (`data-offline-trip-gone="1"`), never for the name
 * alone: the page's data stream mentions the not-found component in another form — on EVERY
 * trip page. The trip page therefore renders its not-found component itself instead of calling
 * notFound(): a streamed notFound() sends that component only in the data stream, not as HTML.
 */
export const OFFLINE_TRIP_GONE_MARKER = "data-offline-trip-gone";
export const OFFLINE_TRIP_GONE_VALUE = "1";

export function hasTripGoneMarker(html: string): boolean {
  return html.includes(`${OFFLINE_TRIP_GONE_MARKER}="${OFFLINE_TRIP_GONE_VALUE}"`);
}

/**
 * Added to the trip mark of the SAVED copy only (markSavedCopy): the page knows it is the copy,
 * and from when, whatever the browser says about the connection (a hotel Wi-Fi without internet
 * still counts as "online").
 */
export const OFFLINE_SAVED_AT_ATTR = "data-offline-saved-at";

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** The saved copy's HTML: `data-offline-trip="<code>"` gets `data-offline-saved-at="<iso>"` (once). */
export function markSavedCopy(html: string, code: string, iso: string): string {
  if (!ISO_TIME.test(iso)) throw new Error("invalid_saved_at");
  const mark = `${OFFLINE_TRIP_MARKER}="${code}"`;
  const at = html.indexOf(mark);
  if (at < 0) return html;
  const end = at + mark.length;
  const rest = html.slice(end);
  const existing = new RegExp(`^ ${OFFLINE_SAVED_AT_ATTR}="[^"]*"`).exec(rest);
  return `${html.slice(0, end)} ${OFFLINE_SAVED_AT_ATTR}="${iso}"${existing ? rest.slice(existing[0].length) : rest}`;
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
  /** Whose copy it is: offlineOwnerKey(user.id) (./offline-server.ts), never the account id itself. */
  owner: string;
  /** The listing's title, for the list on the offline page (render with dir="auto"). */
  title: string;
  checkIn: string;
  checkOut: string;
  /**
   * The dates as the trip page wrote them ("10–12 בדצמ׳", formatDateRange), for the offline page's
   * list (i18n-1). Optional: copies saved before it show the ISO dates.
   */
  datesLabel?: string;
  /** The booking status when saved (a change re-saves the copy). */
  status: string;
  /** ISO time of the last save. */
  savedAt: string;
  /** Last day the copy is kept ("YYYY-MM-DD", Georgia). */
  keepUntil: string;
  /** The page's content key when saved (offlineTripVersion): a change re-saves the copy. */
  version: string | null;
};

/** Last day a copy of a stay is kept: a week after check-out. */
export function offlineKeepUntil(checkOut: string): string {
  return addDays(checkOut, OFFLINE_KEEP_DAYS_AFTER_CHECKOUT);
}

/** A saved copy is dropped after its last day. */
export function isOfflineEntryExpired(entry: Pick<OfflineTripEntry, "keepUntil">, today: string): boolean {
  return entry.keepUntil < today;
}

/**
 * May this trip page be saved (and a copy kept) today? Not for a cancelled booking (the address
 * and the host's contacts are withdrawn), and not after the keep window (a week after check-out).
 */
export function offlineSaveAllowed(trip: { status: string; checkOut: string }, today: string): boolean {
  return !trip.status.startsWith("CANCELLED") && today <= offlineKeepUntil(trip.checkOut);
}

/** The page refreshes its saved copy in the background when it is older than this (and online). */
export const OFFLINE_RESAVE_AFTER_MS = 60 * 60 * 1000;

/**
 * Should the open trip page refresh its saved copy? When the booking's status or the page's
 * content key changed (the host moved the check-in time, the address, the contact buttons…), or
 * the copy is older than OFFLINE_RESAVE_AFTER_MS.
 */
export function needsResave(
  entry: Pick<OfflineTripEntry, "status" | "version" | "savedAt">,
  page: { status: string; version: string },
  nowMs: number,
): boolean {
  if (entry.status !== page.status || entry.version !== page.version) return true;
  const savedAt = Date.parse(entry.savedAt);
  return !Number.isFinite(savedAt) || nowMs - savedAt > OFFLINE_RESAVE_AFTER_MS;
}

const ENTRY_STRINGS = ["path", "code", "owner", "title", "checkIn", "checkOut", "status", "savedAt", "keepUntil"] as const;

/**
 * The index JSON (unknown shape from the cache) → valid entries for trip pages only. An entry
 * without an owner is invalid (copies saved before owners existed are dropped).
 */
export function parseOfflineIndex(value: unknown): OfflineTripEntry[] {
  const list = value && typeof value === "object" && Array.isArray((value as { trips?: unknown }).trips) ? (value as { trips: unknown[] }).trips : [];
  const out: OfflineTripEntry[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    if (!ENTRY_STRINGS.every((key) => typeof e[key] === "string")) continue;
    if (!isTripPagePath(e.path as string) || !(e.owner as string)) continue;
    out.push({
      ...(Object.fromEntries(ENTRY_STRINGS.map((key) => [key, e[key] as string])) as Omit<OfflineTripEntry, "version">),
      version: typeof e.version === "string" && e.version ? e.version : null,
      // Only a short string (anything else is left out; the offline page then shows the ISO dates).
      ...(typeof e.datesLabel === "string" && e.datesLabel && e.datesLabel.length <= 80 ? { datesLabel: e.datesLabel } : {}),
    });
  }
  return out;
}

/** The entries saved by this owner. */
export function ownedEntries(entries: readonly OfflineTripEntry[], owner: string): OfflineTripEntry[] {
  return entries.filter((entry) => entry.owner === owner);
}

/**
 * What this device may keep now, for the account signed in (`owner`; null = nobody): that
 * account's copies still within their keep window. `drop` lists the pages to delete.
 */
export function reconcileOfflineEntries(
  entries: readonly OfflineTripEntry[],
  owner: string | null,
  today: string,
): { keep: OfflineTripEntry[]; drop: string[] } {
  const keep = owner ? ownedEntries(entries, owner).filter((entry) => !isOfflineEntryExpired(entry, today)) : [];
  const kept = new Set(keep.map((entry) => entry.path));
  return { keep, drop: entries.filter((entry) => !kept.has(entry.path)).map((entry) => entry.path) };
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

/**
 * The static files a page's HTML names in src="…" / href="…" (scripts, styles, preloads, icons):
 * saved with the copy even when this tab did not load them (a copy fetched after a new release).
 */
export function htmlAssetUrls(html: string, origin: string): string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(/\s(?:src|href)="([^"]+)"/g)) urls.push(match[1].replace(/&amp;/g, "&"));
  return offlineAssetUrls(urls, origin);
}
