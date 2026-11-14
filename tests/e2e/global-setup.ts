import fs from "node:fs";
import { cleanupTestData, closeDb, restoreCounters, snapshotCounters, sql } from "./helpers/db";
import { BASE_URL } from "./helpers/env";
import { ADMIN_STATE_FILE, createTestAdmin } from "./helpers/staff";

/**
 * Pages the tests open. A development server compiles each route on its first request (up to
 * half a minute): request them once, one by one, so the tests do not wait for it mid-flow.
 */
const WARM_UP = [
  "/en",
  "/en/search?city=tbilisi",
  "/en/listing/91",
  "/en/login",
  "/en/account",
  "/en/account/listings",
  "/en/account/favorites",
  "/en/account/compare",
  "/en/account/tickets/1",
  "/en/post",
  "/en/jewish-life",
  "/en/help",
  "/en/contact",
  "/en/admin/moderation",
  "/en/this-page-does-not-exist",
];

async function warmUp() {
  for (const path of WARM_UP) {
    await fetch(`${BASE_URL}${path}`, { redirect: "manual", signal: AbortSignal.timeout(120_000) }).catch(() => undefined);
  }
}

/**
 * Before the run: remove anything a crashed earlier run left behind, check the demo data, create
 * the test admin (real 2-step login, helpers/staff.ts), and remember the demo listings' counters
 * (views, contacts, saves) so the teardown can put them back.
 */
export default async function globalSetup() {
  await cleanupTestData();
  fs.rmSync(ADMIN_STATE_FILE, { force: true });
  const [demo] = await sql<{ count: string }>(`SELECT count(*)::text AS count FROM "Listing" WHERE "isDemo" AND status = 'LIVE'`);
  if (Number(demo?.count ?? 0) < 10) {
    throw new Error("The end-to-end tests need the demo data: run `npm run db:seed` first.");
  }
  const [setting] = await sql<{ value: unknown }>(`SELECT value FROM "SiteSetting" WHERE key = 'demoDataVisible'`);
  if (setting && setting.value === false) {
    throw new Error("Turn on Admin → Settings → Show demo data: the tests search the demo listings.");
  }
  await createTestAdmin();
  const snapshot = await snapshotCounters();
  await closeDb();
  await warmUp();

  return async () => {
    fs.rmSync(ADMIN_STATE_FILE, { force: true });
    await cleanupTestData({ since: snapshot.startedAt });
    await restoreCounters(snapshot);
    await closeDb();
  };
}
