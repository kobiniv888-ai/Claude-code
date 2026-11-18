#!/usr/bin/env node
/**
 * Is the database ready for browsing? Counts cities and publicly visible LIVE listings (the same
 * rules as publicListingWhere in src/lib/listing/where.ts: LIVE, not deleted, not expired, owner
 * active or warned). Used by .devcontainer/start.sh to decide whether to (re)load the demo data.
 *
 *   node scripts/db-status.mjs          prints a summary
 *   node scripts/db-status.mjs --json   prints JSON
 *
 * Exit codes: 0 = ready, 10 = needs `npm run db:seed` (no cities, or no public listings — e.g.
 * every demo listing has expired), 1 = the database cannot be reached or has no tables.
 */
import "dotenv/config";
import pg from "pg";

const NEEDS_SEED = 10;
const json = process.argv.includes("--json");

function report(status, code) {
  if (json) console.log(JSON.stringify(status));
  else if (status.error) console.log(`Database: ${status.error}`);
  else
    console.log(
      `Database: ${status.cities} cities, ${status.publicListings} public listings ` +
        `(${status.demoListings} demo, ${status.expiredDemoListings} expired demo)` +
        (status.needsSeed ? ` — needs demo data: ${status.reason}` : " — ready"),
    );
  process.exit(code);
}

const url = process.env.DATABASE_URL;
if (!url) report({ error: "DATABASE_URL is not set" }, 1);

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
try {
  await client.connect();
  const count = async (sql) => Number((await client.query(sql)).rows[0].count);
  const cities = await count(`SELECT count(*) FROM "City"`);
  const publicListings = await count(`
    SELECT count(*) FROM "Listing" l JOIN "User" u ON u.id = l."ownerId"
    WHERE l.status = 'LIVE' AND l."deletedAt" IS NULL
      AND (l."expiresAt" IS NULL OR l."expiresAt" > now())
      AND u."deletedAt" IS NULL AND u.status IN ('ACTIVE', 'WARNED')`);
  const demoListings = await count(`SELECT count(*) FROM "Listing" WHERE "isDemo" AND "deletedAt" IS NULL`);
  const expiredDemoListings = await count(`
    SELECT count(*) FROM "Listing"
    WHERE "isDemo" AND "deletedAt" IS NULL
      AND (status = 'EXPIRED' OR (status = 'LIVE' AND "expiresAt" IS NOT NULL AND "expiresAt" <= now()))`);

  const reason =
    cities === 0
      ? "no cities"
      : publicListings === 0
        ? demoListings > 0 && expiredDemoListings === demoListings
          ? "all demo listings expired"
          : "no public listings"
        : null;
  report(
    { cities, publicListings, demoListings, expiredDemoListings, needsSeed: reason !== null, reason },
    reason ? NEEDS_SEED : 0,
  );
} catch (error) {
  // 42P01: relation does not exist — the schema was never pushed.
  const message = error?.code === "42P01" ? "tables missing (run npx prisma db push)" : String(error?.message ?? error);
  report({ error: message }, 1);
} finally {
  await client.end().catch(() => undefined);
}
