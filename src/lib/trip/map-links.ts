/**
 * Map links of the trip page (round 3, brief 7.1; pure, client-safe). No API keys, no live calls:
 * the phone's Google Maps or Waze app opens on the exact point.
 *
 * - "פתיחה ב-Google Maps" / "פתיחה ב-Waze": directions to the place (src/lib/booking/reveal.ts
 *   directionsFor, also used by the booking emails), from the coordinates only — never the address
 *   text, which Google would have to guess.
 * - Walking directions from the place to a synagogue, Chabad house or kosher place nearby.
 */
import { directionsFor, type Directions } from "@/lib/booking/reveal";

export type MapPoint = { lat: number; lng: number };

/** A real point on Earth (finite, in range; 0,0 is the "no pin" mistake, never a home in Georgia). */
export function isMapPoint(point: { lat?: number | null; lng?: number | null } | null | undefined): point is MapPoint {
  if (!point || typeof point.lat !== "number" || typeof point.lng !== "number") return false;
  const { lat, lng } = point;
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

/** Google Maps and Waze directions to the exact point, or null without a usable pin. */
export function tripMapLinks(point: { lat?: number | null; lng?: number | null } | null | undefined): Directions | null {
  return isMapPoint(point) ? directionsFor(point.lat, point.lng) : null;
}

/** Google Maps walking directions between two points ("≈ 6 min walk" to the synagogue). */
export function walkingDirectionsUrl(from: MapPoint, to: MapPoint): string | null {
  if (!isMapPoint(from) || !isMapPoint(to)) return null;
  const point = (p: MapPoint) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  const params = new URLSearchParams({ api: "1", origin: point(from), destination: point(to), travelmode: "walking" });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
