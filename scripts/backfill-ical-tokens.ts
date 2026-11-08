/**
 * Replaces weak calendar export tokens (SECURITY_REPORT 4.7.b, D3). Listings made before
 * 8 November 2026 got a cuid as Listing.icalToken: time-based, so tokens made close together share
 * a long prefix (all local ones started with "cmvwbte"). Every token that is not a 256-bit
 * newIcalToken() (src/lib/listing/ical-token.ts) gets a new one. Idempotent: a second run finds
 * nothing to do.
 *
 *   npm run ical:backfill-tokens -- --dry-run     count only, change nothing
 *   npm run ical:backfill-tokens                  replace the weak tokens
 *
 * A replaced token changes that listing's calendar link (/api/ical/<token>.ics): a host who pasted
 * the old link into Airbnb / Booking.com must paste the new one (Calendar page → copy link). Before
 * launch only demo and test listings exist, so no real link breaks. Prints counts only.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { isStrongIcalToken, newIcalToken } from "@/lib/listing/ical-token";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const rows = await db.listing.findMany({ select: { id: true, icalToken: true, isDemo: true } });
  const weak = rows.filter((row) => !isStrongIcalToken(row.icalToken));
  const real = weak.filter((row) => !row.isDemo).length;
  console.log(`[ical-tokens] ${rows.length} listings, ${weak.length} with a weak calendar token (${real} not demo).`);
  if (dryRun || weak.length === 0) {
    if (dryRun) console.log("[ical-tokens] Dry run: nothing changed.");
    return;
  }
  let done = 0;
  for (const row of weak) {
    // Only if the token is still the weak one (a host may have replaced it meanwhile).
    const { count } = await db.listing.updateMany({ where: { id: row.id, icalToken: row.icalToken }, data: { icalToken: newIcalToken() } });
    done += count;
  }
  console.log(`[ical-tokens] Replaced ${done} tokens.${real > 0 ? ` ${real} real hosts must copy their new calendar link.` : ""}`);
}

main()
  .catch((error) => {
    console.error("[ical-tokens] failed:", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
