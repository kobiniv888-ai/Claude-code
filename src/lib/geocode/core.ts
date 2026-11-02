/**
 * Pure building blocks for the address search (bug 8.9): query normalizing, a small LRU cache,
 * a serial queue that keeps a minimum gap between upstream calls, and the Nominatim parser.
 * No server-only imports, so it is unit-tested directly (`core.test.ts`).
 */

export type GeocodeResult = { id: string; label: string; lat: number; lng: number };

export const GEOCODE_QUERY_MIN = 3;
export const GEOCODE_QUERY_MAX = 200;
export const GEOCODE_RESULTS_MAX = 6;
const LABEL_MAX = 300;

/** Trims and collapses spaces; `null` when too short to search. Longer queries are cut. */
export function normalizeGeocodeQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const q = raw.replace(/\s+/g, " ").trim().slice(0, GEOCODE_QUERY_MAX).trim();
  return q.length >= GEOCODE_QUERY_MIN ? q : null;
}

/** Cache key: the same words in another case or spacing hit the same entry. */
export function geocodeCacheKey(query: string, locale: string): string {
  return `${locale}|${query.toLocaleLowerCase("en")}`;
}

/** Nominatim jsonv2 → our results. Drops anything malformed. */
export function parseNominatim(data: unknown): GeocodeResult[] {
  if (!Array.isArray(data)) return [];
  const results: GeocodeResult[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const lat = Number(row.lat);
    const lng = Number(row.lon);
    const label = typeof row.display_name === "string" ? row.display_name.trim() : "";
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !label) continue;
    const id = row.place_id ?? row.osm_id ?? `${lat},${lng}`;
    results.push({ id: String(id), label: label.slice(0, LABEL_MAX), lat, lng });
    if (results.length >= GEOCODE_RESULTS_MAX) break;
  }
  return results;
}

/** A least-recently-used cache with a time limit per entry. */
export class LruCache<V> {
  private readonly map = new Map<string, { value: V; expires: number }>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    // Move to the newest end.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, { value, expires: this.now() + this.ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  get size(): number {
    return this.map.size;
  }
}

export class QueueFullError extends Error {
  constructor() {
    super("geocode queue is full");
    this.name = "QueueFullError";
  }
}

/**
 * Runs tasks one at a time, each starting at least `intervalMs` after the previous one started.
 * More than `maxPending` waiting tasks are refused at once (QueueFullError), so a burst cannot
 * pile up requests that would only time out.
 */
export function createSerialQueue({
  intervalMs,
  maxPending,
  now = Date.now,
  sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
}: {
  intervalMs: number;
  maxPending: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}) {
  let tail: Promise<unknown> = Promise.resolve();
  let lastStart = Number.NEGATIVE_INFINITY;
  let pending = 0;

  return {
    get pending() {
      return pending;
    },
    run<T>(task: () => Promise<T>): Promise<T> {
      if (pending >= maxPending) return Promise.reject(new QueueFullError());
      pending += 1;
      const result = tail.then(async () => {
        const wait = lastStart + intervalMs - now();
        if (wait > 0) await sleep(wait);
        lastStart = now();
        return task();
      });
      const settled = result.then(
        () => undefined,
        () => undefined,
      );
      tail = settled;
      void settled.then(() => {
        pending -= 1;
      });
      return result;
    },
  };
}
