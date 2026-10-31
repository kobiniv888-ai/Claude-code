import { siteConfig } from "@/config/site";

/** Pure geo helpers — safe on server and client. */

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Straight-line distance in meters. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Approximate walking minutes along streets: straight-line distance × detour factor
 * at an average walking pace. Shown in the UI as "≈ 6 min walk".
 */
export function walkingMinutes(meters: number): number {
  const { walkingMetersPerMinute, walkingDetourFactor } = siteConfig.map;
  return Math.max(1, Math.round((meters * walkingDetourFactor) / walkingMetersPerMinute));
}

export function walkingMinutesBetween(a: LatLng, b: LatLng): number {
  return walkingMinutes(haversineMeters(a, b));
}

/** Small deterministic PRNG so the public "approximate" point is stable for a listing. */
function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The public map point: the real location moved by a stable random offset of
 * 40%–100% of `maxMeters`, so the exact address is never exposed. `seed` must be secret
 * (listings use publicMapPoint in @/lib/listing/lifecycle, which derives it from HASH_SALT).
 */
export function approximateLocation(
  point: LatLng,
  seed: string,
  maxMeters: number = siteConfig.listings.approximateLocationMeters,
): LatLng {
  const rand = seededRandom(seed);
  const distance = maxMeters * (0.4 + 0.6 * rand());
  const bearing = 2 * Math.PI * rand();
  const dLat = (distance * Math.cos(bearing)) / EARTH_RADIUS_M;
  const dLng = (distance * Math.sin(bearing)) / (EARTH_RADIUS_M * Math.cos(toRad(point.lat)));
  return {
    lat: Number((point.lat + (dLat * 180) / Math.PI).toFixed(6)),
    lng: Number((point.lng + (dLng * 180) / Math.PI).toFixed(6)),
  };
}

export type Bounds = { north: number; south: number; east: number; west: number };

export function isInBounds(p: LatLng, b: Bounds): boolean {
  return p.lat <= b.north && p.lat >= b.south && p.lng <= b.east && p.lng >= b.west;
}

/** "n,s,e,w" in URLs. */
export function parseBounds(value: string | null | undefined): Bounds | null {
  if (!value) return null;
  const parts = value.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [north, south, east, west] = parts;
  if (north < south) return null;
  return { north, south, east, west };
}

export function serializeBounds(b: Bounds): string {
  return [b.north, b.south, b.east, b.west].map((n) => n.toFixed(5)).join(",");
}
