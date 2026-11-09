import type { NearbyInfo } from "@/lib/nearby";

/**
 * Public walking times and distances (security checklist 6, founder's decision 2 and answer (b),
 * 8 Nov 2026).
 *
 * The walking minutes stored on a listing (Listing.synagogueWalkMin, chabadWalkMin,
 * seaWalkMinutes, liftWalkMinutes, the minutes inside Listing.nearby) are computed from the EXACT
 * pin. Shown to the minute, two or three of them pinpoint the home within a few dozen meters
 * (SECURITY_REPORT 6.d: 9–43 m on the demo listings), however far the map circle is moved. So no
 * page, RSC payload, JSON answer or API ever gets them as stored: every loader passes them through
 * these helpers first, and the components round again (it is idempotent).
 *
 *   publicWalkMinutes(3)   // → 5   shown "עד 5 דק׳" / "up to 5 min"
 *   publicWalkMinutes(5)   // → 5   "עד 5 דק׳"
 *   publicWalkMinutes(6)   // → 10  "עד 10 דק׳"
 *   publicWalkMinutes(14)  // → 15  "עד 15 דק׳"
 *   publicKm(1_740)        // → 2   whole kilometers, at least 1
 *
 * Every walking time reads "up to N" in all 5 languages, never "≈ N" (founder's answer (b)): the
 * value is rounded UP, so "up to 10" is always true, while "≈ 10" for a 6-minute walk is not.
 *
 * Why UP to the next 5 minutes (1–5 → 5, 6–10 → 10, …) and not to the nearest 5:
 * - "עד N דק׳" stays true for every walk under it;
 * - every step is a full 5 minutes wide (rounding to the nearest would make 5–7 a 3-minute step);
 * - the search filters ("בית כנסת עד 10 דק׳", "קרוב לים" = 15 minutes) keep working on the exact
 *   stored value, and because their limits are multiples of 5, "exact ≤ limit" is exactly
 *   "shown ≤ limit": a filter can never split a step and reveal more than the page shows
 *   (src/lib/geo/public-walk.test.ts checks every filter limit). The "nearest synagogue" sort
 *   orders by the shown step too (sortBySynagogueStep in @/lib/listing/where).
 *
 * What a page may show is also limited (walk-trilat-1; the test at the end of public-walk.test.ts):
 * - the supermarket and the stop (name and minutes) are the ones nearest to the PUBLIC map point
 *   (NearbyInfo.public, @/lib/nearby), never the pin's: "the nearest stop is X" from the pin puts
 *   the home inside X's Voronoi cell, which with the shop's cell is about one building;
 * - at most TWO walking times measured from the pin per listing: the nearest synagogue (or Chabad
 *   house) and the town's walk to the sea or the ski lifts. The Chabad house is a third one only
 *   when it is a different place from the nearest synagogue and the listing has a sea/lift walk,
 *   and then it is left out (chabadWalkIsPublic).
 *
 * Pure and tiny: safe on the server and in client components (the type import is erased).
 */

/** The step every public walking time is rounded up to. */
export const WALK_STEP_MINUTES = 5;

/**
 * A walking time a page may show: rounded UP to the next multiple of 5 minutes. Null for a
 * missing, non-numeric, zero or negative value (nothing is shown then).
 */
export function publicWalkMinutes(minutes: number | null | undefined): number | null {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.ceil(minutes / WALK_STEP_MINUTES) * WALK_STEP_MINUTES;
}

/** True for the first step (any walk of 5 minutes or less). Every step reads "up to N" anyway. */
export function isFirstWalkStep(publicMinutes: number | null | undefined): boolean {
  return typeof publicMinutes === "number" && publicMinutes > 0 && publicMinutes <= WALK_STEP_MINUTES;
}

/** A public distance in whole kilometers (at least 1), or null for a missing value. */
export function publicKm(meters: number | null | undefined): number | null {
  if (typeof meters !== "number" || !Number.isFinite(meters) || meters < 0) return null;
  return Math.max(1, Math.round(meters / 1000));
}

type Place = NonNullable<NearbyInfo["synagogue"]>;
type Poi = NonNullable<NearbyInfo["supermarket"]>;
type Transport = NonNullable<NearbyInfo["transport"]>;

/** A nearby place as a page may get it: no meters, the minutes rounded up to 5. */
export type PublicNearbyPlace = Omit<Place, "meters">;
export type PublicNearbyPoi = Omit<Poi, "meters">;
export type PublicNearbyTransport = Omit<Transport, "meters">;

/**
 * Listing.nearby as a page may get it (see publicNearby). Kosher food and mikveh entries are not
 * shown on any page, so they are not sent at all: every extra walking time is one more circle to
 * intersect.
 */
export type PublicNearbyInfo = {
  synagogue?: PublicNearbyPlace;
  chabad?: PublicNearbyPlace;
  supermarket?: PublicNearbyPoi;
  transport?: PublicNearbyTransport;
  airport?: { code: string; km: number };
};

function place(entry: Place | undefined): PublicNearbyPlace | undefined {
  const minutes = publicWalkMinutes(entry?.minutes);
  if (!entry || minutes === null || typeof entry.id !== "string") return undefined;
  return { id: entry.id, name: entry.name, minutes };
}

function poi(entry: Poi | undefined): PublicNearbyPoi | undefined {
  const minutes = publicWalkMinutes(entry?.minutes);
  if (!entry || minutes === null) return undefined;
  return { minutes, ...(entry.name ? { name: entry.name } : {}), ...(entry.names ? { names: entry.names } : {}) };
}

/**
 * Whether the Chabad house walk may be shown. It is a separate walking time from the pin only when
 * the Chabad house is not the nearest synagogue; with the town's sea/lift walk that would be a
 * third one, so it is shown only without a sea/lift walk, or when it is the same place.
 */
export function chabadWalkIsPublic(nearby: NearbyInfo | null | undefined, hasTownWalk: boolean): boolean {
  if (!hasTownWalk) return true;
  const chabadId = nearby?.chabad?.id;
  return typeof chabadId === "string" && chabadId === nearby?.synagogue?.id;
}

/**
 * Listing.nearby reduced to what a page shows: the synagogue and (see chabadWalkIsPublic) the
 * Chabad house, the supermarket and transport nearest to the PUBLIC map point (NearbyInfo.public;
 * never the pin's), all with their walking times rounded up to 5 minutes, and the airport in whole
 * km. The meters (50 m precise), the pin's own supermarket and transport, the entries no page
 * shows (kosher food, mikveh) and unknown keys of the stored JSON are dropped. Without
 * `opts.chabad` the Chabad house is kept only when it is the nearest synagogue (fail closed).
 */
export function publicNearby(nearby: NearbyInfo | null | undefined, opts: { chabad?: boolean } = {}): PublicNearbyInfo {
  const out: PublicNearbyInfo = {};
  if (!nearby || typeof nearby !== "object") return out;
  const synagogue = place(nearby.synagogue);
  const chabad = (opts.chabad ?? chabadWalkIsPublic(nearby, true)) ? place(nearby.chabad) : undefined;
  const fromPublicPoint = nearby.public && typeof nearby.public === "object" ? nearby.public : {};
  const supermarket = poi(fromPublicPoint.supermarket);
  const transportPoi = poi(fromPublicPoint.transport);
  if (synagogue) out.synagogue = synagogue;
  if (chabad) out.chabad = chabad;
  if (supermarket) out.supermarket = supermarket;
  if (transportPoi && fromPublicPoint.transport) out.transport = { ...transportPoi, kind: fromPublicPoint.transport.kind };
  const airport = nearby.airport;
  if (airport && typeof airport.code === "string" && typeof airport.km === "number" && Number.isFinite(airport.km)) {
    out.airport = { code: airport.code, km: Math.max(1, Math.round(airport.km)) };
  }
  return out;
}

/** The walking values stored on a listing row (any of them may be missing from a select). */
export type StoredWalkTimes = {
  synagogueWalkMin?: number | null;
  chabadWalkMin?: number | null;
  seaWalkMinutes?: number | null;
  liftWalkMinutes?: number | null;
  nearby?: NearbyInfo | null;
};

/**
 * Every walking value of a listing as a page may get it, with the "at most two walking times from
 * the pin" rule applied (see the module comment). Use this rather than publicWalkMinutes field by
 * field wherever a page shows more than one of them.
 */
export function publicWalkTimes(row: StoredWalkTimes): {
  synagogueWalkMin: number | null;
  chabadWalkMin: number | null;
  seaWalkMinutes: number | null;
  liftWalkMinutes: number | null;
  nearby: PublicNearbyInfo;
} {
  const seaWalkMinutes = publicWalkMinutes(row.seaWalkMinutes);
  const liftWalkMinutes = publicWalkMinutes(row.liftWalkMinutes);
  const chabad = chabadWalkIsPublic(row.nearby, seaWalkMinutes !== null || liftWalkMinutes !== null);
  return {
    synagogueWalkMin: publicWalkMinutes(row.synagogueWalkMin),
    chabadWalkMin: chabad ? publicWalkMinutes(row.chabadWalkMin) : null,
    seaWalkMinutes,
    liftWalkMinutes,
    nearby: publicNearby(row.nearby, { chabad }),
  };
}
