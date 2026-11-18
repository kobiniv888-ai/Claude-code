/**
 * Browser side of "שמירה לשימוש בלי אינטרנט" (round 3, brief 7.1): the Cache Storage
 * "bayit-trips" and its index. Rules (pure) in ./offline.ts; the service worker (public/sw.js)
 * reads the same cache. Call only in the browser; every function here is safe to call when Cache
 * Storage is missing or blocked (it then does nothing).
 */
import { tbilisiToday } from "@/lib/booking/dates";
import {
  OFFLINE_TRIPS_CACHE,
  OFFLINE_TRIPS_INDEX,
  hasTripMarker,
  htmlAssetUrls,
  isTripPagePath,
  markSavedCopy,
  offlineAssetUrls,
  offlineKeepUntil,
  offlinePageHeaders,
  ownedEntries,
  parseOfflineIndex,
  reconcileOfflineEntries,
  withOfflineEntry,
  type OfflineTripEntry,
} from "./offline";

/** What the trip page passes to save its copy. */
export type OfflineTripProps = {
  /** The canonical page address with its language: "/he/account/trips/BT-7K3Q9". */
  path: string;
  code: string;
  title: string;
  checkIn: string;
  checkOut: string;
  /** "10–12 בדצמ׳" (formatDateRange in the page's language), for the offline page's list (i18n-1). */
  datesLabel?: string;
  status: string;
  /** offlineOwnerKey(user.id) (./offline-server.ts). */
  owner: string;
  /** offlineTripVersion(...) of what the page shows. */
  version: string;
};

export function cacheStorageAvailable(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && "caches" in window;
}

async function hasTripsCache(): Promise<boolean> {
  return cacheStorageAvailable() && (await caches.has(OFFLINE_TRIPS_CACHE));
}

export async function readOfflineIndex(cache: Cache): Promise<OfflineTripEntry[]> {
  const response = await cache.match(OFFLINE_TRIPS_INDEX);
  return response ? parseOfflineIndex(await response.json().catch(() => null)) : [];
}

/** Writes the index; with no entry left the whole cache goes (its static files too). */
export async function writeOfflineIndex(cache: Cache, entries: OfflineTripEntry[]): Promise<void> {
  if (entries.length === 0) {
    await caches.delete(OFFLINE_TRIPS_CACHE);
    return;
  }
  await cache.put(OFFLINE_TRIPS_INDEX, new Response(JSON.stringify({ trips: entries }), { headers: { "Content-Type": "application/json" } }));
}

/** This owner's saved copy of a page (null when none, or it belongs to another account). */
export async function savedOfflineEntry(path: string, owner: string | null): Promise<OfflineTripEntry | null> {
  if (!owner || !(await hasTripsCache())) return null;
  const entries = ownedEntries(await readOfflineIndex(await caches.open(OFFLINE_TRIPS_CACHE)), owner);
  return entries.find((entry) => entry.path === path) ?? null;
}

/** The static files this tab loaded: scripts, styles, fonts and the icon sprite (same origin only). */
function loadedAssets(spriteUrl: string): string[] {
  const urls = [
    ...performance.getEntriesByType("resource").map((entry) => entry.name),
    ...Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"), (script) => script.src),
    ...Array.from(document.querySelectorAll<HTMLLinkElement>("link[href]"))
      .filter((link) => /(^|\s)(stylesheet|preload|modulepreload)(\s|$)/.test(link.rel))
      .map((link) => link.href),
    new URL(spriteUrl, location.origin).href,
  ];
  return offlineAssetUrls(urls, location.origin);
}

/**
 * Saves a fresh copy of this page (from the server, as this account sees it) and its files. The
 * copy's HTML carries `data-offline-saved-at` (markSavedCopy) so it knows it is the copy. Refused
 * when the trip may no longer be kept (past the keep window).
 */
export async function saveOfflinePage(props: OfflineTripProps, spriteUrl: string): Promise<OfflineTripEntry> {
  if (!isTripPagePath(props.path) || !props.owner) throw new Error("not_a_trip_page");
  const keepUntil = offlineKeepUntil(props.checkOut);
  if (keepUntil < tbilisiToday()) throw new Error("past_keep_window");
  const response = await fetch(props.path, { credentials: "same-origin", cache: "no-store", headers: { Accept: "text/html" } });
  const type = response.headers.get("Content-Type") ?? "";
  if (!response.ok || response.redirected || new URL(response.url).pathname !== props.path || !type.includes("text/html")) {
    throw new Error("page_not_saved");
  }
  const html = await response.text();
  if (!hasTripMarker(html, props.code)) throw new Error("page_not_saved");
  const savedAt = new Date().toISOString();
  const cache = await caches.open(OFFLINE_TRIPS_CACHE);
  await cache.put(props.path, new Response(markSavedCopy(html, props.code, savedAt), { headers: offlinePageHeaders(response.headers) }));
  const assets = new Set([...loadedAssets(spriteUrl), ...htmlAssetUrls(html, location.origin)]);
  await Promise.all(
    [...assets].map(async (url) => {
      try {
        const cached = await caches.match(url);
        if (cached) await cache.put(url, cached);
        else await cache.add(url);
      } catch {
        // A file that can't be saved now: the page may look plainer offline, it still opens.
      }
    }),
  );
  const entry: OfflineTripEntry = {
    path: props.path,
    code: props.code,
    owner: props.owner,
    title: props.title,
    checkIn: props.checkIn,
    checkOut: props.checkOut,
    ...(props.datesLabel ? { datesLabel: props.datesLabel } : {}),
    status: props.status,
    savedAt,
    keepUntil,
    version: props.version,
  };
  // Read the index again just before writing it (another tab may have changed it meanwhile).
  await writeOfflineIndex(cache, withOfflineEntry(await readOfflineIndex(cache), entry));
  return entry;
}

/** Deletes one saved page (and the whole cache with the last one). */
export async function removeOfflinePage(path: string): Promise<void> {
  if (!(await hasTripsCache())) return;
  const cache = await caches.open(OFFLINE_TRIPS_CACHE);
  await cache.delete(path, { ignoreSearch: true });
  await writeOfflineIndex(cache, (await readOfflineIndex(cache)).filter((entry) => entry.path !== path));
}

/**
 * Keeps on this device only what the signed-in account may see offline (reconcileOfflineEntries):
 * signed out (`owner` null) → the whole cache goes; another account → the other account's copies
 * go; copies past their keep window go. The index is rewritten only when something changed.
 */
export async function reconcileOfflineTrips(owner: string | null, today: string = tbilisiToday()): Promise<void> {
  if (!(await hasTripsCache())) return;
  if (!owner) {
    await caches.delete(OFFLINE_TRIPS_CACHE);
    return;
  }
  const cache = await caches.open(OFFLINE_TRIPS_CACHE);
  const index = await cache.match(OFFLINE_TRIPS_INDEX);
  const raw: unknown = index ? await index.json().catch(() => null) : null;
  const all = raw && typeof raw === "object" && Array.isArray((raw as { trips?: unknown }).trips) ? (raw as { trips: unknown[] }).trips : [];
  const { keep, drop } = reconcileOfflineEntries(parseOfflineIndex(raw), owner, today);
  // Entries that don't parse (no owner: saved before owners existed) go too.
  const invalid = all
    .map((item) => (item && typeof item === "object" ? (item as { path?: unknown }).path : null))
    .filter((path): path is string => typeof path === "string" && isTripPagePath(path) && !keep.some((entry) => entry.path === path));
  if (keep.length === all.length && drop.length === 0) return;
  for (const path of new Set([...drop, ...invalid])) await cache.delete(path, { ignoreSearch: true });
  await writeOfflineIndex(cache, keep);
}
