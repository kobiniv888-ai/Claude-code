import "server-only";
import { db } from "@/lib/db";
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
      lat: true,
      lng: true,
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
    const after = walkMinutesFor(row.city?.slug, row.lat, row.lng);
    if (same(before, after)) continue;
    changed.push({ id: row.id, publicId: row.publicId, city: row.city?.slug ?? null, before, after });
    if (opts.apply) {
      await db.listing.updateMany({ where: { id: row.id, lat: row.lat, lng: row.lng, cityId: row.cityId }, data: after });
    }
  }
  return { checked: rows.length, changed, applied: !!opts.apply };
}
