import "server-only";
import { siteConfig } from "@/config/site";
import { rateLimit } from "@/lib/rate-limit";
import {
  GEOCODE_RESULTS_MAX,
  LruCache,
  QueueFullError,
  createSerialQueue,
  geocodeCacheKey,
  parseNominatim,
  type GeocodeResult,
} from "./core";

/**
 * Address search for the post form (bug 8.9), following OpenStreetMap's Nominatim usage policy:
 * - only on an explicit search (the client sends one request per "Search"/Enter, never per key);
 * - results are cached (in-memory LRU, 7 days) and the same query in flight is shared;
 * - one request per second for the whole site: an in-process serial queue (≥ 1.1 s apart) plus a
 *   shared slot in the RateLimit table, so several server instances never add up past 1/s;
 * - a clear User-Agent and Referer naming the site; the OSM credit stays in the form.
 *
 * Set NOMINATIM_URL to use another Nominatim server (e.g. a self-hosted one).
 */

export type { GeocodeResult } from "./core";
export { QueueFullError } from "./core";

export class GeocodeUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocodeUnavailableError";
  }
}

const NOMINATIM_URL = process.env.NOMINATIM_URL?.trim() || "https://nominatim.openstreetmap.org/search";
const INTERVAL_MS = 1100;
/** Longest a search may wait for the shared slot before giving up as "busy". */
const SLOT_WAIT_MS = 6000;
const UPSTREAM_TIMEOUT_MS = 8000;
const SITE_WIDE_KEY = "geocode:nominatim:site";

const cache = new LruCache<GeocodeResult[]>(1000, 7 * 24 * 3600 * 1000);
const inFlight = new Map<string, Promise<GeocodeResult[]>>();
const queue = createSerialQueue({ intervalMs: INTERVAL_MS, maxPending: 8 });

export const OSM_ATTRIBUTION = "© OpenStreetMap contributors (ODbL)";

function userAgent(): string {
  return `${siteConfig.name}/1.0 (+${siteConfig.url}; ${siteConfig.supportEmail})`;
}

/** Waits for the site-wide slot (1 request per second across all server instances). */
async function takeSiteWideSlot(): Promise<void> {
  const deadline = Date.now() + SLOT_WAIT_MS;
  for (;;) {
    const slot = await rateLimit(SITE_WIDE_KEY, { limit: 1, windowSeconds: 1 });
    if (slot.ok) return;
    const wait = Math.max(50, slot.resetAt.getTime() - Date.now() + 25);
    if (Date.now() + wait > deadline) throw new QueueFullError();
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

async function fetchNominatim(query: string, locale: string): Promise<GeocodeResult[]> {
  await takeSiteWideSlot();
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("countrycodes", "ge");
  url.searchParams.set("limit", String(GEOCODE_RESULTS_MAX));
  // Street and house number apart from the place's name (bug 2.6): the form fills only those.
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", locale);
  url.searchParams.set("q", query);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": userAgent(), Referer: `${siteConfig.url}/` },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    throw new GeocodeUnavailableError(`nominatim fetch failed: ${(error as Error).message}`);
  }
  if (!response.ok) throw new GeocodeUnavailableError(`nominatim answered ${response.status}`);
  return parseNominatim(await response.json().catch(() => null));
}

/** Searches an address in Georgia. Throws QueueFullError (busy) or GeocodeUnavailableError. */
export async function geocodeAddress(query: string, locale: string): Promise<GeocodeResult[]> {
  const key = geocodeCacheKey(query, locale);
  const cached = cache.get(key);
  if (cached) return cached;
  const running = inFlight.get(key);
  if (running) return running;

  const promise = queue
    .run(() => fetchNominatim(query, locale))
    .then((results) => {
      cache.set(key, results);
      return results;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}
