import { siteConfig } from "@/config/site";
import { isInBounds, type Bounds } from "@/lib/geo";
import { georgiaBounds } from "@/lib/map-bounds";
import { findGazetteerPlace } from "@/lib/places-match";

/**
 * Where the search map looks (pure, client-safe): the "search area" the map opens on and returns
 * to with "Re-center", and the "N homes in this area" count. Never the whole world: without
 * results or a known place, the answer is Georgia.
 */

type LatLngTuple = [number, number];
type Point = { lat: number; lng: number };

export type MapTarget =
  | { kind: "bounds"; bounds: [LatLngTuple, LatLngTuple]; maxZoom?: number }
  | { kind: "center"; center: LatLngTuple; zoom: number };

/** The searched city / neighborhood (slugs from the search filters). */
export type FocusPlace = { citySlug: string | null; neighborhoodSlug?: string | null } | null | undefined;

/** Fitting a handful of results never zooms in closer than this (streets stay readable). */
export const RESULTS_MAX_ZOOM = 15;
/** A neighborhood is shown at this zoom; a city at siteConfig.map.defaultZoom. */
export const NEIGHBORHOOD_ZOOM = 14;

/** [[south, west], [north, east]] around the points (call with at least one point). */
export function pointsBounds(points: readonly Point[]): [LatLngTuple, LatLngTuple] {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const { lat, lng } of points) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lng);
    east = Math.max(east, lng);
  }
  return [
    [south, west],
    [north, east],
  ];
}

/**
 * The search area: the results (unless `ignorePoints`, e.g. when they are already limited to the
 * map area), else the searched neighborhood or city, else all of Georgia.
 */
export function searchAreaTarget({
  points,
  focusPlace,
  ignorePoints = false,
}: {
  points: readonly Point[];
  focusPlace?: FocusPlace;
  ignorePoints?: boolean;
}): MapTarget {
  if (!ignorePoints && points.length > 0) {
    return { kind: "bounds", bounds: pointsBounds(points), maxZoom: RESULTS_MAX_ZOOM };
  }
  const place = findGazetteerPlace(focusPlace?.citySlug, focusPlace?.neighborhoodSlug);
  if (place) {
    return {
      kind: "center",
      center: [place.lat, place.lng],
      zoom: place.type === "neighborhood" ? NEIGHBORHOOD_ZOOM : siteConfig.map.defaultZoom,
    };
  }
  return { kind: "bounds", bounds: georgiaBounds() };
}

/** How many points are inside the visible map area. */
export function countInBounds(points: readonly Point[], bounds: Bounds | null): number {
  if (!bounds) return points.length;
  let count = 0;
  for (const point of points) if (isInBounds(point, bounds)) count += 1;
  return count;
}

/**
 * Walking directions to a point. Google Maps' public "directions" URL opens the app on phones
 * (the visitor's own location is the start) and needs no key.
 */
export function walkingDirectionsUrl(point: Point): string {
  const destination = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=walking`;
}
