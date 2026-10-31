import { cleanupTestData, closeDb, restoreCounters, snapshotCounters, sql } from "./helpers/db";

/**
 * Before the run: remove anything a crashed earlier run left behind, check the demo data, and
 * remember the demo listings' counters (views, contacts, saves) so the teardown can put them back.
 */
export default async function globalSetup() {
  await cleanupTestData();
  const [demo] = await sql<{ count: string }>(`SELECT count(*)::text AS count FROM "Listing" WHERE "isDemo" AND status = 'LIVE'`);
  if (Number(demo?.count ?? 0) < 10) {
    throw new Error("The end-to-end tests need the demo data: run `npm run db:seed` first.");
  }
  const [setting] = await sql<{ value: unknown }>(`SELECT value FROM "SiteSetting" WHERE key = 'demoDataVisible'`);
  if (setting && setting.value === false) {
    throw new Error("Turn on Admin → Settings → Show demo data: the tests search the demo listings.");
  }
  const snapshot = await snapshotCounters();
  await closeDb();

  return async () => {
    await cleanupTestData({ since: snapshot.startedAt });
    await restoreCounters(snapshot);
    await closeDb();
  };
}
