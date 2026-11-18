/**
 * Before the build changes a database (scripts/vercel-build.mjs: `prisma db push`, the seed) and
 * before the seed itself: refuse when the database belongs to the REAL site but this is not
 * SITE_ENV=production, or when it cannot be checked (SECURITY_REPORT 12.1.b; src/lib/site-env-marker.ts).
 *
 *   npx tsx --require ./scripts/server-script.cjs scripts/check-site-marker.ts    exit 0: fine; exit 1: refused
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import { readSiteEnv } from "../src/lib/site-env";
import { readSiteMarker, siteMarkerDecision } from "../src/lib/site-env-marker";

async function main(): Promise<number> {
  const site = readSiteEnv(process.env);
  if (!site) {
    console.error("[site-marker] SITE_ENV is not set or not valid: refusing.");
    return 1;
  }
  const decision = siteMarkerDecision(site, await readSiteMarker(db), { failClosed: true });
  if (decision.action === "refuse") {
    console.error(`[site-marker] ${decision.problem}`);
    return 1;
  }
  console.log(`[site-marker] OK for SITE_ENV=${site}.`);
  return 0;
}

main()
  .then(async (code) => {
    await db.$disconnect().catch(() => undefined);
    process.exit(code);
  })
  .catch(async (error) => {
    console.error("[site-marker] failed:", (error as Error)?.message ?? error);
    await db.$disconnect().catch(() => undefined);
    process.exit(1);
  });
