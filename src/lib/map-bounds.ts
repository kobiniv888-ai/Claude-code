import { siteConfig } from "@/config/site";
import type { Bounds } from "@/lib/geo";

/**
 * Georgia on the map (pure, client-safe). Maps open on Georgia — never the whole world — and the
 * search map, location picker and places map cannot be dragged far away from it.
 */

type LatLngTuple = [number, number];

/** [[south, west], [north, east]], ready for Leaflet's fitBounds. */
export function georgiaBounds(): [LatLngTuple, LatLngTuple] {
  const [[south, west], [north, east]] = siteConfig.map.georgiaBounds;
  return [
    [south, west],
    [north, east],
  ];
}

/** Georgia plus siteConfig.map.boundsPadding degrees on every side (Leaflet `maxBounds`). */
export function paddedGeorgiaBounds(padding: number = siteConfig.map.boundsPadding): [LatLngTuple, LatLngTuple] {
  const [[south, west], [north, east]] = georgiaBounds();
  return [
    [south - padding, west - padding],
    [north + padding, east + padding],
  ];
}

/**
 * Clamps a map area (e.g. `bounds=` from a URL) to padded Georgia. Returns null when the area
 * lies entirely outside it, so an old world-sized or foreign area is simply dropped.
 */
export function clampBoundsToGeorgia(bounds: Bounds, padding: number = siteConfig.map.boundsPadding): Bounds | null {
  const [[south, west], [north, east]] = paddedGeorgiaBounds(padding);
  const clamped = {
    north: Math.min(bounds.north, north),
    south: Math.max(bounds.south, south),
    east: Math.min(bounds.east, east),
    west: Math.max(bounds.west, west),
  };
  return clamped.north > clamped.south && clamped.east > clamped.west ? clamped : null;
}
