/**
 * Fills Listing.seaWalkMinutes / liftWalkMinutes ("≈ 5 דק׳ הליכה לים" / "למעליות", round 3 brief
 * 7.3) for every listing that is not deleted, from the static OpenStreetMap data in src/data/osm/.
 * Run it once after deploying the feature, and again after refreshing the OSM data
 * (scripts/build-osm-walk-targets.mjs). New pins are computed when they are saved.
 *
 *   npx tsx --require ./scripts/server-script.cjs scripts/backfill-walk-minutes.ts           # dry run: lists the changes
 *   npx tsx --require ./scripts/server-script.cjs scripts/backfill-walk-minutes.ts --apply   # writes them
 *
 * Only these two derived columns change; nothing is deleted. The same run also recomputes the
 * nearest-synagogue walks (founder's answer (2), 9 Nov 2026: a Chabad house is never a listing's
 * walk; rows computed before it may still hold one): the dry run counts the stale rows, --apply
 * recomputes the community-place distances of every listing (no OpenStreetMap call).
 */
import "../prisma/seed/esm-interop";
import "dotenv/config";
import { db } from "@/lib/db";
import { backfillSynagogueWalks, backfillWalkMinutes } from "@/lib/geo/walk-minutes-server";

const show = (minutes: number | null) => (minutes === null ? "–" : `${minutes} min`);

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (copy .env.example to .env).");
  const apply = process.argv.slice(2).includes("--apply");
  const result = await backfillWalkMinutes({ apply });
  for (const change of result.changed) {
    console.log(
      `#${change.publicId} (${change.city ?? "no city"}): sea ${show(change.before.seaWalkMinutes)} → ${show(change.after.seaWalkMinutes)}, ` +
        `lifts ${show(change.before.liftWalkMinutes)} → ${show(change.after.liftWalkMinutes)}`,
    );
  }
  console.log(`${result.checked} listings checked, ${result.changed.length} ${apply ? "updated" : "would change"}.`);
  const synagogues = await backfillSynagogueWalks({ apply });
  console.log(
    `${synagogues.checked} listings checked for Chabad walks: ${synagogues.stale} stale` +
      (apply ? `, ${synagogues.recomputed} recomputed.` : "."),
  );
  if (!apply && (result.changed.length > 0 || synagogues.stale > 0)) console.log("Nothing was written. Run again with --apply to save.");
}

main()
  .catch((error) => {
    console.error("Backfilling the walking times failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
