/**
 * The review screen's extra warnings (SECURITY_REPORT 14.1.c/d/f), the pure parts: unit-tested,
 * no server imports. The data access is in ./review-warnings.ts.
 *
 * - 14.1.c an address that doesn't match the pin: the typed street address, geocoded, lies more
 *   than ADDRESS_PIN_TOLERANCE_M from the host's pin (addressPinStatus).
 * - 14.1.d a price far below the price guide: below half the low end of the usual range of
 *   similar places, or of a reference range (priceVersusGuide).
 * - 14.1.f copied description text: 5-word shingles shared with another account's listing
 *   (copySimilarity), plus a "search this text" sentence for a web search (searchSnippet).
 */
import { haversineMeters, type LatLng } from "@/lib/geo";
import { normalizeSearchText } from "@/lib/search-text";

// ─── 14.1.c Address vs pin ────────────────────────────────────

/** A typed address more than this far from the pin is worth a look (geocoding is street-level). */
export const ADDRESS_PIN_TOLERANCE_M = 1000;

export type AddressPinStatus =
  /** No exact address or no pin to compare. */
  | { status: "no_address" }
  /** The geocoder was busy or down: not checked (never shown as a pass). */
  | { status: "unavailable" }
  /** The geocoder doesn't know the address. */
  | { status: "not_found" }
  | { status: "match" | "mismatch"; distanceM: number };

/** Compares the pin with the geocoded results of the typed address (the nearest result counts). */
export function addressPinStatus(pin: LatLng | null, results: readonly LatLng[] | null, toleranceM = ADDRESS_PIN_TOLERANCE_M): AddressPinStatus {
  if (!pin) return { status: "no_address" };
  if (results === null) return { status: "unavailable" };
  if (results.length === 0) return { status: "not_found" };
  const distanceM = Math.round(Math.min(...results.map((r) => haversineMeters(pin, r))));
  return { status: distanceM > toleranceM ? "mismatch" : "match", distanceM };
}

// ─── 14.1.d Price vs the price guide ──────────────────────────

/** "Far below": under this share of the low end (the price guide's own rule, GUIDE_RULES.farBelowFactor). */
export const PRICE_GUIDE_FAR_BELOW = 0.5;

export type PriceGuideStatus =
  | { status: "no_data" }
  | { status: "ok" | "far_below"; price: number; low: number; source: "guide" | "reference" };

/**
 * The listing's price (in the guide's currency and unit) against the usual range's low end (p25)
 * and the reference ranges' low ends. The lowest low end is used, so only a price far below
 * every source counts.
 */
export function priceVersusGuide(price: number | null, guideLow: number | null, referenceLows: readonly number[]): PriceGuideStatus {
  if (price === null || !Number.isFinite(price) || price <= 0) return { status: "no_data" };
  const sources = [
    ...(guideLow !== null && guideLow > 0 ? [{ low: guideLow, source: "guide" as const }] : []),
    ...referenceLows.filter((low) => low > 0).map((low) => ({ low, source: "reference" as const })),
  ];
  if (sources.length === 0) return { status: "no_data" };
  const lowest = sources.reduce((a, b) => (b.low < a.low ? b : a));
  return { status: price < lowest.low * PRICE_GUIDE_FAR_BELOW ? "far_below" : "ok", price, low: lowest.low, source: lowest.source };
}

// ─── 14.1.f Copied description ────────────────────────────────

/** Words per shingle. */
export const SHINGLE_WORDS = 5;
/** Texts with fewer words are not compared (too short to tell). */
export const COPY_MIN_WORDS = 25;
/** Share of the shorter text's shingles found in the other one. */
export const COPY_MIN_CONTAINMENT = 0.5;
/** And at least this many shingles in common. */
export const COPY_MIN_SHARED = 8;

/** FNV-1a 32-bit (a compact set key per shingle). */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** The text's 5-word shingles (normalized words: case, niqqud, punctuation and spacing don't matter). */
export function shingles(text: string | null | undefined): Set<number> {
  const words = normalizeSearchText(text).split(" ").filter(Boolean);
  const out = new Set<number>();
  if (words.length < COPY_MIN_WORDS) return out;
  for (let i = 0; i + SHINGLE_WORDS <= words.length; i++) out.add(fnv1a(words.slice(i, i + SHINGLE_WORDS).join(" ")));
  return out;
}

export type CopySimilarity = { shared: number; containment: number; jaccard: number; copied: boolean };

/** How much of one text is in the other (by shingles). */
export function copySimilarity(a: ReadonlySet<number>, b: ReadonlySet<number>): CopySimilarity {
  if (a.size === 0 || b.size === 0) return { shared: 0, containment: 0, jaccard: 0, copied: false };
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const item of small) if (large.has(item)) shared++;
  const containment = shared / small.size;
  const jaccard = shared / (a.size + b.size - shared);
  return { shared, containment, jaccard, copied: shared >= COPY_MIN_SHARED && containment >= COPY_MIN_CONTAINMENT };
}

/**
 * A distinctive sentence of the description (the longest one with 6–20 words, at most 160
 * characters) for a "search this text" web search, or null for a short text.
 */
export function searchSnippet(text: string | null | undefined): string | null {
  if (!text) return null;
  const sentences = text
    .split(/[\n\r]+|(?<=[.!?…])\s+/u)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => {
      const words = s.split(" ").length;
      return words >= 6 && s.length <= 160;
    });
  if (sentences.length === 0) return null;
  const best = sentences.reduce((a, b) => (b.split(" ").length > a.split(" ").length ? b : a));
  return best.split(" ").slice(0, 20).join(" ");
}

/** A web search for the exact sentence (opened by staff in a new tab, without a referrer). */
export function textSearchUrl(snippet: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`"${snippet}"`)}`;
}
