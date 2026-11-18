import "server-only";
import { siteConfig } from "@/config/site";
import { haversineMeters, walkingMinutes, type LatLng } from "@/lib/geo";
import seaData from "@/data/osm/sea.json";
import liftData from "@/data/osm/ski-lifts.json";
import { WALK_CAP_MINUTES, isSeaTown, isSkiTown } from "./walk-towns";

export { NEAR_WALK_MINUTES, SEA_TOWNS, SKI_TOWNS, WALK_CAP_MINUTES, isNearWalk, isSeaTown, isSkiTown } from "./walk-towns";

/**
 * "≈ 5 דק׳ הליכה לים" / "≈ 5 דק׳ הליכה למעליות" (round 3, brief 7.3): walking minutes from a pin
 * to the nearest beach or ski lift, from the static OpenStreetMap points in src/data/osm/ (made
 * once by scripts/build-osm-walk-targets.mjs; no live map calls at runtime).
 *
 *   walkToSea(41.6249, 41.5979)             // → 4   (null outside the sea data area or > 30 min)
 *   walkToLift(42.4769, 44.4811)            // → 3
 *   walkMinutesFor("batumi", lat, lng)      // → { seaWalkMinutes, liftWalkMinutes } for Listing
 *
 * The same method as the synagogue walking time (src/lib/nearby.ts): straight-line distance
 * rounded to 50 m, × the detour factor, at the walking pace (@/lib/geo walkingMinutes). Stored
 * exactly for the "קרוב לים" filter; shown only rounded up to 5 minutes ("עד 5 דק׳", "≈ 10 דק׳",
 * @/lib/geo/public-walk, security checklist 6.d). Sea: the nearest beach (natural=beach, sea beaches only); where the map has no beach within
 * the cap, the coastline is the fallback. Lifts: the bottom station of every lift (and middle
 * stations). The listing columns are recomputed whenever the pin moves (wizard location step,
 * prepareListingDerivedFields) and by scripts/backfill-walk-minutes.ts.
 *
 * Server only: the points are ~150 KB of JSON that must not reach a browser bundle. Client code
 * imports the town lists and thresholds from ./walk-towns.
 */

type Box = readonly [south: number, west: number, north: number, east: number];
type Point = readonly [lat: number, lng: number];

type SeaFile = { bbox: number[]; beaches: number[][]; coastline: number[][] };
type LiftFile = { bboxes: Record<string, number[]>; stations: number[][] };

const ROUND_TO_M = 50;
const METERS_PER_DEGREE_LAT = 111_320;

/**
 * The longest straight line whose walking time can still round to `capMinutes` (≈ 1.9 km for 30
 * minutes): points farther away are never looked at.
 */
export function capMeters(capMinutes: number = WALK_CAP_MINUTES): number {
  const { walkingMetersPerMinute, walkingDetourFactor } = siteConfig.map;
  return ((capMinutes + 0.5) * walkingMetersPerMinute) / walkingDetourFactor + ROUND_TO_M / 2;
}

/** Walking minutes the way nearby.ts shows them: meters rounded to 50 (at least 50). */
export function walkMinutesFromMeters(meters: number): number {
  const rounded = Math.max(ROUND_TO_M, Math.round(meters / ROUND_TO_M) * ROUND_TO_M);
  return walkingMinutes(rounded);
}

function inBox(point: LatLng, [south, west, north, east]: Box): boolean {
  return point.lat >= south && point.lat <= north && point.lng >= west && point.lng <= east;
}

/** Straight-line meters to the nearest of `points` within `maxMeters`, or null (exported for tests). */
export function nearestMeters(point: LatLng, points: readonly Point[], maxMeters: number): number | null {
  const dLat = maxMeters / METERS_PER_DEGREE_LAT;
  const dLng = maxMeters / (METERS_PER_DEGREE_LAT * Math.max(0.2, Math.cos((point.lat * Math.PI) / 180)));
  let best: number | null = null;
  for (const [lat, lng] of points) {
    if (Math.abs(lat - point.lat) > dLat || Math.abs(lng - point.lng) > dLng) continue;
    const meters = haversineMeters(point, { lat, lng });
    if (meters <= maxMeters && (best === null || meters < best)) best = meters;
  }
  return best;
}

/**
 * Minutes to the nearest target, or null when the point is outside every area, nothing is within
 * the cap, or the coordinates are not numbers. `fallback` is used only when `targets` has nothing
 * within the cap (exported for tests with fixture points).
 */
export function walkMinutesTo(
  point: LatLng,
  data: { areas: readonly Box[]; targets: readonly Point[]; fallback?: readonly Point[] },
  capMinutes: number = WALK_CAP_MINUTES,
): number | null {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  if (!data.areas.some((box) => inBox(point, box))) return null;
  const max = capMeters(capMinutes);
  const meters = nearestMeters(point, data.targets, max) ?? (data.fallback ? nearestMeters(point, data.fallback, max) : null);
  if (meters === null) return null;
  const minutes = walkMinutesFromMeters(meters);
  return minutes <= capMinutes ? minutes : null;
}

const SEA = seaData as SeaFile;
const LIFTS = liftData as LiftFile;
const SEA_AREAS: readonly Box[] = [SEA.bbox as unknown as Box];
const SEA_BEACHES = SEA.beaches as unknown as readonly Point[];
const SEA_COASTLINE = SEA.coastline as unknown as readonly Point[];
const LIFT_AREAS: readonly Box[] = Object.values(LIFTS.bboxes) as unknown as Box[];
const LIFT_STATIONS = LIFTS.stations as unknown as readonly Point[];

/** Minutes on foot to the nearest beach (null when not on the covered coast or farther than the cap). */
export function walkToSea(lat: number, lng: number): number | null {
  return walkMinutesTo({ lat, lng }, { areas: SEA_AREAS, targets: SEA_BEACHES, fallback: SEA_COASTLINE });
}

/** Minutes on foot to the nearest ski lift (null when not in a covered ski area or farther than the cap). */
export function walkToLift(lat: number, lng: number): number | null {
  return walkMinutesTo({ lat, lng }, { areas: LIFT_AREAS, targets: LIFT_STATIONS });
}

export type WalkMinutes = { seaWalkMinutes: number | null; liftWalkMinutes: number | null };

/**
 * The two Listing columns for a pin in a city: the sea only in SEA_TOWNS, lifts only in SKI_TOWNS,
 * both null without a pin. Write the result whenever the pin or the city changes.
 */
export function walkMinutesFor(citySlug: string | null | undefined, lat: number | null, lng: number | null): WalkMinutes {
  if (lat === null || lng === null) return { seaWalkMinutes: null, liftWalkMinutes: null };
  return {
    seaWalkMinutes: isSeaTown(citySlug) ? walkToSea(lat, lng) : null,
    liftWalkMinutes: isSkiTown(citySlug) ? walkToLift(lat, lng) : null,
  };
}
