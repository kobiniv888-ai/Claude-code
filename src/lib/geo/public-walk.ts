import type { NearbyInfo } from "@/lib/nearby";

/**
 * Public walking times and distances (security checklist 6.d; founder's decision 2, answer (b) of
 * 8 Nov 2026 and answers (2) and (3) of 9 Nov 2026).
 *
 * The walking minutes stored on a listing (Listing.synagogueWalkMin, seaWalkMinutes,
 * liftWalkMinutes, the minutes inside Listing.nearby) are computed from the EXACT pin. Shown to the
 * minute, two or three of them pinpoint the home within a few dozen meters (SECURITY_REPORT 6.d:
 * 9–43 m on the demo listings), however far the map circle is moved. So the server sends ONLY the
 * rounded "up to N" value (answer (3)): no page, RSC payload, JSON answer, API, JSON-LD, share
 * image or email ever gets an exact minute or a meter. Every loader passes the stored values
 * through publicWalkTimes (or publicWalkMinutes for one value) before anything leaves the server;
 * the components round again (it is idempotent). Filters and the "nearest synagogue" sort keep
 * using the exact stored values ON THE SERVER, and their limits are multiples of 5, so they never
 * tell more than the rounded number (src/lib/geo/public-walk.test.ts).
 *
 *   publicWalkMinutes(3)   // → 5   shown "עד 5 דק׳" / "up to 5 min"
 *   publicWalkMinutes(5)   // → 5   "עד 5 דק׳"
 *   publicWalkMinutes(6)   // → 10  "עד 10 דק׳"
 *   publicWalkMinutes(14)  // → 15  "עד 15 דק׳"
 *   publicKm(1_740)        // → 2   whole kilometers, at least 1
 *
 * Every walking time reads "up to N" in all 5 languages, never "≈ N" (answer (b)): the value is
 * rounded UP, so "up to 10" is always true, while "≈ 10" for a 6-minute walk is not.
 *
 * Why UP to the next 5 minutes (1–5 → 5, 6–10 → 10, …) and not to the nearest 5:
 * - "עד N דק׳" stays true for every walk under it;
 * - every step is a full 5 minutes wide (rounding to the nearest would make 5–7 a 3-minute step);
 * - the search filters ("בית כנסת עד 10 דק׳", "קרוב לים" = 15 minutes) work on the exact stored
 *   value, and because their limits are multiples of 5, "exact ≤ limit" is exactly "shown ≤ limit":
 *   a filter can never split a step and reveal more than the page shows. The "nearest synagogue"
 *   sort orders by the shown step too (sortBySynagogueStep in @/lib/listing/where).
 *
 * What a listing may show (answers (2) and (3), walk-trilat-1):
 * - Chabad houses are NEVER a walking time on a listing (answer (2)): they appear on the community
 *   map only. The nearest synagogue is the nearest place of type SYNAGOGUE (src/lib/nearby.ts) and
 *   keeps its walking time. (The earlier "no Chabad walk next to a sea or lift walk" rule, C21, is
 *   gone with it.)
 * - At most MAX_PUBLIC_WALKS (3) walking times per listing, of every kind together, kept in
 *   PUBLIC_WALK_ORDER: the town's walk to the sea or the ski lifts first (the reason people choose
 *   a beach or ski town), then the nearest synagogue, then the public-transport stop, then the
 *   supermarket. A walk that does not fit is not sent at all. The card shows a subset of the first
 *   two kinds, so it never shows one the page left out.
 * - The supermarket and the stop (name and minutes) are the ones nearest to the PUBLIC map point
 *   (NearbyInfo.public, @/lib/nearby), never the pin's: "the nearest stop is X" from the pin puts
 *   the home inside X's Voronoi cell, which with the shop's cell is about one building. So at most
 *   TWO of the three walking times are measured from the pin (sea/lift and synagogue).
 * - Kosher food and mikveh walks, and the pin's own supermarket and stop, are never sent.
 *
 * Pure and tiny: safe on the server and in client components (the type import is erased).
 */

/** The step every public walking time is rounded up to. */
export const WALK_STEP_MINUTES = 5;

/** At most this many walking times per listing, of every kind together (founder's answer (3)). */
export const MAX_PUBLIC_WALKS = 3;

/**
 * Which walking times a listing keeps when it has more than MAX_PUBLIC_WALKS, first kept first:
 * the town's sea or ski-lift walk, the nearest synagogue, the transport stop, the supermarket.
 */
export const PUBLIC_WALK_ORDER = ["sea", "lift", "synagogue", "transport", "supermarket"] as const;
export type PublicWalkKind = (typeof PUBLIC_WALK_ORDER)[number];

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
 * Listing.nearby as a page may get it (see publicNearby): the nearest synagogue, the stop and the
 * supermarket around the public point, the airport in whole km. No Chabad house (answer (2)), no
 * kosher food or mikveh (no page shows them, and every extra walking time is one more circle to
 * intersect).
 */
export type PublicNearbyInfo = {
  synagogue?: PublicNearbyPlace;
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
 * The walking kinds to keep, in PUBLIC_WALK_ORDER, at most MAX_PUBLIC_WALKS of them (exported for
 * tests and for any page that shows a subset).
 */
export function keptWalkKinds(present: Partial<Record<PublicWalkKind, boolean>>): Set<PublicWalkKind> {
  const kept = new Set<PublicWalkKind>();
  for (const kind of PUBLIC_WALK_ORDER) {
    if (kept.size >= MAX_PUBLIC_WALKS) break;
    if (present[kind]) kept.add(kind);
  }
  return kept;
}

/**
 * Listing.nearby reduced to what a page may show: the nearest synagogue, and the supermarket and
 * transport nearest to the PUBLIC map point (NearbyInfo.public; never the pin's), with their
 * walking times rounded up to 5 minutes, and the airport in whole km. The meters (50 m precise),
 * the Chabad house, the pin's own supermarket and transport, kosher food, mikveh and unknown keys
 * of the stored JSON are dropped. `townWalks` = how many sea/lift walks the listing shows (they
 * come first in PUBLIC_WALK_ORDER, so they leave less room here).
 */
export function publicNearby(nearby: NearbyInfo | null | undefined, opts: { townWalks?: number } = {}): PublicNearbyInfo {
  const out: PublicNearbyInfo = {};
  if (!nearby || typeof nearby !== "object") return out;
  const synagogue = place(nearby.synagogue);
  const fromPublicPoint = nearby.public && typeof nearby.public === "object" ? nearby.public : {};
  const supermarket = poi(fromPublicPoint.supermarket);
  const transportPoi = poi(fromPublicPoint.transport);
  const town = Math.max(0, Math.min(2, Math.floor(opts.townWalks ?? 0)));
  const kept = keptWalkKinds({
    sea: town >= 1,
    lift: town >= 2,
    synagogue: !!synagogue,
    transport: !!transportPoi && !!fromPublicPoint.transport,
    supermarket: !!supermarket,
  });
  if (synagogue && kept.has("synagogue")) out.synagogue = synagogue;
  if (transportPoi && fromPublicPoint.transport && kept.has("transport")) out.transport = { ...transportPoi, kind: fromPublicPoint.transport.kind };
  if (supermarket && kept.has("supermarket")) out.supermarket = supermarket;
  const airport = nearby.airport;
  if (airport && typeof airport.code === "string" && typeof airport.km === "number" && Number.isFinite(airport.km)) {
    out.airport = { code: airport.code, km: Math.max(1, Math.round(airport.km)) };
  }
  return out;
}

/** The walking values stored on a listing row (any of them may be missing from a select). */
export type StoredWalkTimes = {
  synagogueWalkMin?: number | null;
  seaWalkMinutes?: number | null;
  liftWalkMinutes?: number | null;
  nearby?: NearbyInfo | null;
};

/** Every walking value of a listing as a page may get it (see publicWalkTimes). */
export type PublicWalkTimes = {
  synagogueWalkMin: number | null;
  seaWalkMinutes: number | null;
  liftWalkMinutes: number | null;
  nearby: PublicNearbyInfo;
};

/**
 * Every walking value of a listing as a page may get it: rounded up to 5 minutes, no meters, no
 * Chabad house, at most MAX_PUBLIC_WALKS walking times in PUBLIC_WALK_ORDER (see the module
 * comment). Use this rather than publicWalkMinutes field by field wherever a page shows more than
 * one of them. `synagogueWalkMin` and `nearby.synagogue` are the same walk (counted once).
 */
export function publicWalkTimes(row: StoredWalkTimes): PublicWalkTimes {
  const sea = publicWalkMinutes(row.seaWalkMinutes);
  const lift = publicWalkMinutes(row.liftWalkMinutes);
  const synagogue = publicWalkMinutes(row.synagogueWalkMin);
  const nearby = publicNearby(row.nearby, { townWalks: (sea !== null ? 1 : 0) + (lift !== null ? 1 : 0) });
  // The synagogue walk keeps its place in the order whether it comes from the column or the JSON.
  const kept = keptWalkKinds({ sea: sea !== null, lift: lift !== null, synagogue: synagogue !== null || !!nearby.synagogue });
  const synagogueKept = kept.has("synagogue");
  if (!synagogueKept) delete nearby.synagogue;
  return {
    synagogueWalkMin: synagogueKept ? (synagogue ?? nearby.synagogue?.minutes ?? null) : null,
    seaWalkMinutes: kept.has("sea") ? sea : null,
    liftWalkMinutes: kept.has("lift") ? lift : null,
    nearby,
  };
}

/** How many walking times a public walk object carries (tests, the page-data check). */
export function countPublicWalks(walks: PublicWalkTimes): number {
  const synagogue = walks.synagogueWalkMin !== null || !!walks.nearby.synagogue;
  return (
    (walks.seaWalkMinutes !== null ? 1 : 0) +
    (walks.liftWalkMinutes !== null ? 1 : 0) +
    (synagogue ? 1 : 0) +
    (walks.nearby.transport ? 1 : 0) +
    (walks.nearby.supermarket ? 1 : 0)
  );
}
