import "server-only";
import { locales, siteConfig, type Localized } from "@/config/site";
import { Prisma, type JewishPlaceType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/site-url";
import { haversineMeters, walkingMinutes, type LatLng } from "@/lib/geo";

/**
 * "Nearby, with walking times" for the listing page (server-only).
 *
 *   await computeListingProximity(listing.id);              // on publish / location change
 *   await recomputeProximityNear(place.lat, place.lng);     // after an admin adds/edits a place
 *
 * Sets Listing.synagogueWalkMin (nearest synagogue or Chabad house), Listing.chabadWalkMin,
 * Listing.nearby (NearbyInfo JSON) and nearbyUpdatedAt.
 * - Jewish places: active JewishPlace rows within 5 km. A real listing uses ONLY verified, non-demo
 *   places (JewishPlace.verifiedAt set, brief 5.9); a demo listing may also use demo places (the
 *   demo shows them labeled "(דמו)" and its cards never get a walking-time tag).
 * - Supermarket and public transport: OpenStreetMap through the Overpass API, 1.2 km around the
 *   listing, 8 s timeout. Fail-safe: when Overpass is slow or down, the previous values are kept.
 *   OVERPASS_ENABLED="false" switches it off; OVERPASS_URL points to another instance.
 * - Airport: straight-line distance to the city's airport (City.airportCode/Lat/Lng).
 * Walking minutes are estimates (straight line × detour factor, see @/lib/geo), computed from the
 * EXACT pin and stored exactly (the search filters use them). They never leave the server as
 * stored: pages, RSC data and APIs get them through @/lib/geo/public-walk (publicWalkMinutes,
 * publicNearby: rounded up to 5 minutes, no meters, whole km), because a few exact walking times
 * pinpoint the home (security checklist 6.d).
 * - The supermarket and the stop a PAGE shows (NearbyInfo.public) are picked around the listing's
 *   public map point (approxLat/approxLng), never around the pin: naming "the nearest stop is X"
 *   from the pin puts the home inside X's Voronoi cell, and with the shop's cell that is about one
 *   building (SECURITY_REPORT 6.d, walk-trilat-1). The pin's own supermarket and transport stay in
 *   NearbyInfo for staff only; publicNearby never reads them.
 */

export type NearbyPlace = { id: string; name: Localized; minutes: number; meters: number };
export type NearbyPoi = { minutes: number; meters: number; name?: string; names?: Partial<Localized> };
export type TransportKind = "metro" | "train" | "tram" | "bus";
export type NearbyTransport = NearbyPoi & { kind: TransportKind };

export type NearbyInfo = {
  synagogue?: NearbyPlace;
  chabad?: NearbyPlace;
  kosherFood?: NearbyPlace;
  mikveh?: NearbyPlace;
  supermarket?: NearbyPoi;
  /** The nearest metro entrance when there is one within 1.2 km, else the nearest train/tram/bus stop. */
  transport?: NearbyTransport;
  airport?: { code: string; km: number };
  /**
   * The supermarket and transport around the PUBLIC map point (names and minutes), the only ones a
   * page may show (publicNearby). They depend on public data alone, so they add nothing to what
   * the map circle already tells. Missing on rows computed before this field existed: pages then
   * show no supermarket or stop until the next recompute (fail closed).
   */
  public?: Pick<NearbyInfo, "supermarket" | "transport">;
};

const JEWISH_RADIUS_M = 5_000;
const OVERPASS_RADIUS_M = 1_200;
/**
 * The public point is at most this far from the pin (siteConfig.listings.approximateLocationMeters),
 * so every OSM element within OVERPASS_RADIUS_M - this of the public point is in the answer of a
 * query around the pin: the public pick is then a function of the public point alone.
 */
const PUBLIC_PICK_RADIUS_M = OVERPASS_RADIUS_M - siteConfig.listings.approximateLocationMeters;
const OVERPASS_TIMEOUT_MS = 8_000;
const DEFAULT_OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const ROUND_TO_M = 50;

function roundMeters(meters: number): number {
  return Math.max(ROUND_TO_M, Math.round(meters / ROUND_TO_M) * ROUND_TO_M);
}

function distanceEntry(meters: number): { meters: number; minutes: number } {
  const rounded = roundMeters(meters);
  return { meters: rounded, minutes: walkingMinutes(rounded) };
}

/** Degrees of latitude/longitude that cover `meters` around `lat` (for a bounding-box query). */
function boundingBox(center: LatLng, meters: number) {
  const dLat = meters / 111_320;
  const dLng = meters / (111_320 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)));
  return { minLat: center.lat - dLat, maxLat: center.lat + dLat, minLng: center.lng - dLng, maxLng: center.lng + dLng };
}

export function toLocalized(value: unknown): Localized {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const fallback =
    (typeof record.en === "string" && record.en) ||
    Object.values(record).find((v): v is string => typeof v === "string" && v.length > 0) ||
    "";
  return Object.fromEntries(
    locales.map((locale) => [locale, typeof record[locale] === "string" && record[locale] ? record[locale] : fallback]),
  ) as Localized;
}

// ─── Jewish places ────────────────────────────────────────────

type PlaceRow = { id: string; type: JewishPlaceType; names: Prisma.JsonValue; lat: number; lng: number };

function nearestOf(point: LatLng, places: PlaceRow[], types: JewishPlaceType[]): NearbyPlace | undefined {
  let best: { place: PlaceRow; meters: number } | null = null;
  for (const place of places) {
    if (!types.includes(place.type)) continue;
    const meters = haversineMeters(point, place);
    if (meters <= JEWISH_RADIUS_M && (!best || meters < best.meters)) best = { place, meters };
  }
  if (!best) return undefined;
  return { id: best.place.id, name: toLocalized(best.place.names), ...distanceEntry(best.meters) };
}

/**
 * Which community places may give a listing its walking times (brief 5.9): never invented ones.
 * Real listings: active, non-demo places with a verification date. Demo listings: those, plus
 * active demo places. Exported for tests.
 */
export function proximityPlaceWhere(listingIsDemo: boolean): Prisma.JewishPlaceWhereInput {
  const verifiedReal: Prisma.JewishPlaceWhereInput = { isDemo: false, verifiedAt: { not: null } };
  return listingIsDemo ? { active: true, OR: [verifiedReal, { isDemo: true }] } : { active: true, ...verifiedReal };
}

async function jewishPlacesNear(point: LatLng, listingIsDemo: boolean): Promise<PlaceRow[]> {
  const box = boundingBox(point, JEWISH_RADIUS_M);
  return db.jewishPlace.findMany({
    where: {
      ...proximityPlaceWhere(listingIsDemo),
      lat: { gte: box.minLat, lte: box.maxLat },
      lng: { gte: box.minLng, lte: box.maxLng },
    },
    select: { id: true, type: true, names: true, lat: true, lng: true },
  });
}

// ─── OpenStreetMap (Overpass) ─────────────────────────────────

export function isOverpassEnabled(): boolean {
  return process.env.OVERPASS_ENABLED?.trim().toLowerCase() !== "false";
}

type OverpassElement = {
  type: "node" | "way" | "relation";
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function overpassQuery({ lat, lng }: LatLng): string {
  const around = `(around:${OVERPASS_RADIUS_M},${lat.toFixed(6)},${lng.toFixed(6)})`;
  return `[out:json][timeout:${Math.floor(OVERPASS_TIMEOUT_MS / 1000)}];
(
  nwr["shop"="supermarket"]${around};
  node["railway"="subway_entrance"]${around};
  nwr["station"="subway"]${around};
  nwr["railway"~"^(station|halt)$"]${around};
  node["railway"="tram_stop"]${around};
  node["highway"="bus_stop"]${around};
);
out center tags qt;`;
}

function elementPoint(element: OverpassElement): LatLng | null {
  if (typeof element.lat === "number" && typeof element.lon === "number") return { lat: element.lat, lng: element.lon };
  if (element.center) return { lat: element.center.lat, lng: element.center.lon };
  return null;
}

function elementNames(tags: Record<string, string> = {}): Pick<NearbyPoi, "name" | "names"> {
  const names: Partial<Localized> = {};
  for (const locale of locales) {
    const value = tags[`name:${locale}`]?.trim();
    if (value) names[locale] = value.slice(0, 120);
  }
  const name = (tags["name:en"] ?? tags.name ?? tags.brand)?.trim().slice(0, 120);
  return { ...(name ? { name } : {}), ...(Object.keys(names).length ? { names } : {}) };
}

function transportKind(tags: Record<string, string> = {}): TransportKind | null {
  if (tags.railway === "subway_entrance" || tags.station === "subway") return "metro";
  if (tags.railway === "tram_stop") return "tram";
  if (tags.railway === "station" || tags.railway === "halt") return "train";
  if (tags.highway === "bus_stop") return "bus";
  return null;
}

/**
 * Nearest supermarket and transport from Overpass elements, within `radius` of `point` (exported
 * for tests).
 */
export function pickOsmNearby(
  point: LatLng,
  elements: OverpassElement[],
  radius: number = OVERPASS_RADIUS_M,
): Pick<NearbyInfo, "supermarket" | "transport"> {
  let supermarket: { element: OverpassElement; meters: number } | null = null;
  const nearestByKind = new Map<TransportKind, { element: OverpassElement; meters: number }>();
  for (const element of elements) {
    const at = elementPoint(element);
    if (!at) continue;
    const meters = haversineMeters(point, at);
    if (meters > radius) continue;
    if (element.tags?.shop === "supermarket") {
      if (!supermarket || meters < supermarket.meters) supermarket = { element, meters };
      continue;
    }
    const kind = transportKind(element.tags);
    if (!kind) continue;
    const current = nearestByKind.get(kind);
    if (!current || meters < current.meters) nearestByKind.set(kind, { element, meters });
  }

  const result: Pick<NearbyInfo, "supermarket" | "transport"> = {};
  if (supermarket) result.supermarket = { ...distanceEntry(supermarket.meters), ...elementNames(supermarket.element.tags) };

  let transport: { kind: TransportKind; element: OverpassElement; meters: number } | null = null;
  const metro = nearestByKind.get("metro");
  if (metro) transport = { kind: "metro", ...metro };
  else {
    for (const kind of ["train", "tram", "bus"] as const) {
      const entry = nearestByKind.get(kind);
      if (entry && (!transport || entry.meters < transport.meters)) transport = { kind, ...entry };
    }
  }
  if (transport) {
    result.transport = { kind: transport.kind, ...distanceEntry(transport.meters), ...elementNames(transport.element.tags) };
  }
  return result;
}

/**
 * The supermarket and transport around the pin (staff only) and around the public map point (what
 * pages show), from one Overpass query around the pin (exported for tests).
 */
export function pickOsmForListing(
  pin: LatLng,
  publicPoint: LatLng | null,
  elements: OverpassElement[],
): { exact: Pick<NearbyInfo, "supermarket" | "transport">; public: Pick<NearbyInfo, "supermarket" | "transport"> } {
  return {
    exact: pickOsmNearby(pin, elements),
    public: publicPoint ? pickOsmNearby(publicPoint, elements, PUBLIC_PICK_RADIUS_M) : {},
  };
}

async function fetchOsmElements(point: LatLng): Promise<OverpassElement[] | null> {
  if (!isOverpassEnabled()) return null;
  const url = process.env.OVERPASS_URL?.trim() || DEFAULT_OVERPASS_URL;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": `${siteConfig.name}/1.0 (+${siteUrl()})`,
      },
      body: new URLSearchParams({ data: overpassQuery(point) }),
      signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { elements?: OverpassElement[] };
    return Array.isArray(data.elements) ? data.elements : [];
  } catch (error) {
    console.warn("[nearby] Overpass request failed, keeping the previous values:", (error as Error)?.message ?? error);
    return null;
  }
}

// ─── Listing proximity ────────────────────────────────────────

/** Reads Listing.nearby (JSON) — tolerant of old or partial values. */
export function parseNearby(value: unknown): NearbyInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as NearbyInfo;
}

export async function computeListingProximity(
  listingId: string,
  opts: { useOverpass?: boolean } = {},
): Promise<NearbyInfo | null> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: {
      lat: true,
      lng: true,
      approxLat: true,
      approxLng: true,
      isDemo: true,
      nearby: true,
      city: { select: { airportCode: true, airportLat: true, airportLng: true } },
    },
  });
  if (!listing) throw new Error(`computeListingProximity: listing ${listingId} not found`);

  if (listing.lat === null || listing.lng === null) {
    await db.listing.update({
      where: { id: listingId },
      data: { synagogueWalkMin: null, chabadWalkMin: null, nearby: Prisma.DbNull, nearbyUpdatedAt: new Date() },
    });
    return null;
  }
  const point = { lat: listing.lat, lng: listing.lng };
  const publicPoint = listing.approxLat !== null && listing.approxLng !== null ? { lat: listing.approxLat, lng: listing.approxLng } : null;
  const previous = parseNearby(listing.nearby);

  const [places, elements] = await Promise.all([
    jewishPlacesNear(point, listing.isDemo),
    opts.useOverpass === false ? Promise.resolve(null) : fetchOsmElements(point),
  ]);
  const osm = elements ? pickOsmForListing(point, publicPoint, elements) : null;

  const nearby: NearbyInfo = {};
  const synagogue = nearestOf(point, places, ["SYNAGOGUE", "CHABAD_HOUSE"]);
  const chabad = nearestOf(point, places, ["CHABAD_HOUSE"]);
  const kosherFood = nearestOf(point, places, ["KOSHER_RESTAURANT", "KOSHER_SHOP"]);
  const mikveh = nearestOf(point, places, ["MIKVEH"]);
  if (synagogue) nearby.synagogue = synagogue;
  if (chabad) nearby.chabad = chabad;
  if (kosherFood) nearby.kosherFood = kosherFood;
  if (mikveh) nearby.mikveh = mikveh;

  const osmValues = osm?.exact ?? { supermarket: previous.supermarket, transport: previous.transport };
  if (osmValues.supermarket) nearby.supermarket = osmValues.supermarket;
  if (osmValues.transport) nearby.transport = osmValues.transport;
  // Without a public point there is nothing a page may show (a listing without one has no map).
  const publicOsm = publicPoint ? (osm?.public ?? previous.public) : undefined;
  if (publicOsm && (publicOsm.supermarket || publicOsm.transport)) {
    nearby.public = {
      ...(publicOsm.supermarket ? { supermarket: publicOsm.supermarket } : {}),
      ...(publicOsm.transport ? { transport: publicOsm.transport } : {}),
    };
  }

  const { airportCode, airportLat, airportLng } = listing.city ?? {};
  if (airportCode && typeof airportLat === "number" && typeof airportLng === "number") {
    const km = haversineMeters(point, { lat: airportLat, lng: airportLng }) / 1000;
    nearby.airport = { code: airportCode, km: Math.max(1, Math.round(km)) };
  }

  await db.listing.update({
    where: { id: listingId },
    data: {
      synagogueWalkMin: synagogue?.minutes ?? null,
      chabadWalkMin: chabad?.minutes ?? null,
      nearby: nearby as Prisma.InputJsonObject,
      nearbyUpdatedAt: new Date(),
    },
  });
  return nearby;
}

/**
 * Recomputes the Jewish-place distances of every listing (not deleted) within `radiusKm` of a
 * point — call after an admin adds, moves, hides or deletes a JewishPlace. OSM values are kept.
 * Returns the number of listings updated.
 */
export async function recomputeProximityNear(lat: number, lng: number, radiusKm = 5): Promise<number> {
  const center = { lat, lng };
  const meters = radiusKm * 1000;
  const box = boundingBox(center, meters);
  const listings = await db.listing.findMany({
    where: {
      status: { not: "DELETED" },
      lat: { gte: box.minLat, lte: box.maxLat },
      lng: { gte: box.minLng, lte: box.maxLng },
    },
    select: { id: true, lat: true, lng: true },
  });
  const inRange = listings.filter((l) => l.lat !== null && l.lng !== null && haversineMeters(center, { lat: l.lat, lng: l.lng }) <= meters);

  let updated = 0;
  const queue = [...inRange];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      try {
        await computeListingProximity(next.id, { useOverpass: false });
        updated++;
      } catch (error) {
        console.error(`[nearby] could not update listing ${next.id}:`, error);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return updated;
}
