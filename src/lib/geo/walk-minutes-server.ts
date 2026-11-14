import "server-only";
import { db } from "@/lib/db";
import { openPin } from "@/lib/field-crypto";
import { computeListingProximity, parseNearby } from "@/lib/nearby";
import { walkMinutesFor, type WalkMinutes } from "./walk-targets";

/**
 * Listing.seaWalkMinutes / liftWalkMinutes in the database (round 3, brief 7.3). The pin saves of
 * the post form and prepareListingDerivedFields write them with the pin; this module is for the
 * one-off backfill (scripts/backfill-walk-minutes.ts) and for a refresh after new OSM data.
 */

export type WalkBackfillChange = { id: string; publicId: number; city: string | null; before: WalkMinutes; after: WalkMinutes };
export type WalkBackfillResult = { checked: number; changed: WalkBackfillChange[]; applied: boolean };

const same = (a: WalkMinutes, b: WalkMinutes) => a.seaWalkMinutes === b.seaWalkMinutes && a.liftWalkMinutes === b.liftWalkMinutes;

/**
 * Recomputes the walking times of every listing that is not deleted (deleted ones are never shown).
 * Dry run by default: `apply: true` writes the changed rows, each with its own conditional update
 * (only when the pin and city are still the ones the value was computed from, so a pin moved in
 * the meantime is never overwritten with a stale value).
 */
export async function backfillWalkMinutes(opts: { apply?: boolean } = {}): Promise<WalkBackfillResult> {
  const rows = await db.listing.findMany({
    where: { status: { not: "DELETED" } },
    select: {
      id: true,
      publicId: true,
      pinEnc: true,
      cityId: true,
      seaWalkMinutes: true,
      liftWalkMinutes: true,
      city: { select: { slug: true } },
    },
    orderBy: { publicId: "asc" },
  });
  const changed: WalkBackfillChange[] = [];
  for (const row of rows) {
    const before = { seaWalkMinutes: row.seaWalkMinutes, liftWalkMinutes: row.liftWalkMinutes };
    // The exact pin, decrypted for the computation only (12.3.c); one that cannot be opened is skipped.
    const pin = openPin(row.pinEnc, "walk_backfill");
    if (pin.failed) continue;
    const after = walkMinutesFor(row.city?.slug, pin.value?.lat ?? null, pin.value?.lng ?? null);
    if (same(before, after)) continue;
    changed.push({ id: row.id, publicId: row.publicId, city: row.city?.slug ?? null, before, after });
    if (opts.apply) {
      // Only while the pin (the same sealed value) and the city are still the ones computed from.
      await db.listing.updateMany({ where: { id: row.id, pinEnc: row.pinEnc, cityId: row.cityId }, data: after });
    }
  }
  return { checked: rows.length, changed, applied: !!opts.apply };
}

export type SynagogueBackfillResult = { checked: number; stale: number; recomputed: number; applied: boolean };

/**
 * Founder's answer (2), 9 Nov 2026: a Chabad house is never a listing's walking time, and the
 * nearest synagogue is a place of type SYNAGOGUE. Rows computed before that may still hold a Chabad
 * walk (chabadWalkMin, Listing.nearby.chabad) or a Chabad house as their nearest "synagogue". This
 * recomputes the community-place distances of every listing that is not deleted (no OpenStreetMap
 * call: the supermarket and stop are kept). Dry run by default: it counts the stale rows; `apply:
 * true` recomputes every listing (the same code a pin move runs).
 */
export async function backfillSynagogueWalks(opts: { apply?: boolean } = {}): Promise<SynagogueBackfillResult> {
  const rows = await db.listing.findMany({
    where: { status: { not: "DELETED" } },
    select: { id: true, chabadWalkMin: true, nearby: true },
    orderBy: { publicId: "asc" },
  });
  const synagogueIds = [...new Set(rows.map((row) => parseNearby(row.nearby).synagogue?.id).filter((id): id is string => typeof id === "string"))];
  const chabadIds = new Set(
    synagogueIds.length
      ? (await db.jewishPlace.findMany({ where: { id: { in: synagogueIds }, type: { not: "SYNAGOGUE" } }, select: { id: true } })).map((p) => p.id)
      : [],
  );
  const stale = rows.filter((row) => {
    const nearby = parseNearby(row.nearby);
    return row.chabadWalkMin !== null || nearby.chabad !== undefined || (nearby.synagogue?.id !== undefined && chabadIds.has(nearby.synagogue.id));
  }).length;
  let recomputed = 0;
  if (opts.apply) {
    for (const row of rows) {
      try {
        await computeListingProximity(row.id, { useOverpass: false });
        recomputed++;
      } catch (error) {
        console.error(`[walks] could not recompute listing ${row.id}:`, (error as Error)?.message ?? error);
      }
    }
  }
  return { checked: rows.length, stale, recomputed, applied: !!opts.apply };
}
