import type { SiteEnv } from "./site-env";

/**
 * Which kind of site a DATABASE belongs to (SECURITY_REPORT 12.1.b, 3.4.a; founder's decision 1):
 * a staging, preview or development server must never run on the real site's database, where it
 * would show login codes for real accounts (test mode), load demo data or push the schema.
 *
 * The real site writes a marker row when it starts: SiteSetting "siteEnvironment" = "production"
 * (no schema change; getSettings() skips unknown keys). Everything else reads it first:
 * - src/instrumentation-node.ts: a development or staging server whose database carries the marker
 *   EXITS (code 1). On staging a database that cannot be read also exits (fail closed); in
 *   development it only warns.
 * - scripts/check-site-marker.ts (before `prisma db push` and the seed in scripts/vercel-build.mjs,
 *   and in prisma/seed): refuses on the marker, and when the database cannot be read.
 *
 * A backup of the real database restored into a test database carries the marker too: delete that
 * row on purpose (SQL: DELETE FROM "SiteSetting" WHERE key = 'siteEnvironment') once the copy is
 * scrubbed. No "@/" imports: scripts load it with tsx.
 */

export const SITE_ENV_MARKER_KEY = "siteEnvironment";
export const PRODUCTION_MARKER = "production";

/** The part of the Prisma client this needs (a test passes a fake). */
export type MarkerStore = {
  siteSetting: {
    findUnique(args: { where: { key: string }; select: { value: true } }): Promise<{ value: unknown } | null>;
    upsert(args: {
      where: { key: string };
      create: { key: string; value: string };
      update: { value: string };
    }): Promise<unknown>;
  };
};

export type MarkerRead = { ok: true; marker: string | null } | { ok: false; error: string };

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms).unref?.())]);

/** The marker of this database (null: none). A missing table (a new, empty database) is no marker. */
export async function readSiteMarker(store: MarkerStore, timeoutMs = 10_000): Promise<MarkerRead> {
  try {
    const row = await withTimeout(store.siteSetting.findUnique({ where: { key: SITE_ENV_MARKER_KEY }, select: { value: true } }), timeoutMs);
    return { ok: true, marker: typeof row?.value === "string" ? row.value : row ? JSON.stringify(row.value) : null };
  } catch (error) {
    if ((error as { code?: string })?.code === "P2021") return { ok: true, marker: null };
    return { ok: false, error: ((error as Error)?.message ?? String(error)).slice(0, 200) };
  }
}

/** The real site marks its database (idempotent). */
export async function writeProductionMarker(store: MarkerStore, timeoutMs = 10_000): Promise<void> {
  await withTimeout(
    store.siteSetting.upsert({
      where: { key: SITE_ENV_MARKER_KEY },
      create: { key: SITE_ENV_MARKER_KEY, value: PRODUCTION_MARKER },
      update: { value: PRODUCTION_MARKER },
    }),
    timeoutMs,
  );
}

export type MarkerDecision = { action: "start" } | { action: "refuse"; problem: string } | { action: "warn"; warning: string };

/**
 * The rule (pure). `failClosed`: a database that cannot be read refuses too (always for staging;
 * for development only in the build and seed scripts, which are about to write to it).
 */
export function siteMarkerDecision(site: SiteEnv, read: MarkerRead, options: { failClosed?: boolean } = {}): MarkerDecision {
  if (site === "production") return { action: "start" };
  if (read.ok) {
    if (read.marker === PRODUCTION_MARKER) {
      return {
        action: "refuse",
        problem: `DATABASE_URL is the REAL site's database (it carries the "${SITE_ENV_MARKER_KEY}" = production marker): a ${site} server, build or seed never uses it. Point DATABASE_URL at this site's own database.`,
      };
    }
    return { action: "start" };
  }
  if (site === "staging" || options.failClosed) {
    return { action: "refuse", problem: `The database could not be checked for the real site's marker (${read.error}): refusing to run as ${site} (fail closed).` };
  }
  return { action: "warn", warning: `[startup] Could not check whether this database belongs to the real site (${read.error}).` };
}
