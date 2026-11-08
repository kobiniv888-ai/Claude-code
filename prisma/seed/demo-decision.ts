import { readSiteEnv } from "@/lib/site-env";

/**
 * Does `npm run db:seed` add the demo part (users, staff, Jewish places, listings, activity,
 * bookings, the demo scam alert)? Pure, unit-tested (tests/unit/seed-demo-decision.test.ts).
 *
 * Founder's decision 1: never into the real site's database. Demo data is seeded only when
 * - SITE_ENV is development or staging in the REAL environment (the command line, the host's
 *   settings; read before .env is loaded), or
 * - SITE_ENV comes from .env AND the database is on this machine (localhost, 127.0.0.1, ::1, a
 *   socket): a codespace or a laptop, or
 * - SEED_DEMO=yes is given on the command line (a remote staging database seeded on purpose).
 * Everything else (SITE_ENV=production, SITE_ENV missing, a .env-only "development" pointed at a
 * remote database) seeds the real content only.
 */

export type SeedDemoInput = {
  /** SITE_ENV before .env was loaded (prisma/seed/site-env-before-dotenv.ts). */
  siteEnvBeforeDotenv: string | undefined;
  /** SITE_ENV after .env was loaded. */
  siteEnv: string | undefined;
  databaseUrl: string | undefined;
  /** SEED_DEMO before .env was loaded: only an explicit "yes" counts. */
  seedDemo: string | undefined;
};

export type SeedDemoDecision = { demo: boolean; reason: "real_env" | "local_database" | "seed_demo_flag" | "production" | "not_development" | "remote_database" };

const DEMO_SITES = new Set(["development", "staging"]);

/** The database is on this machine (or a local socket). An unparsable URL is not local. */
export function isLocalDatabaseUrl(url: string | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (!host) return parsed.searchParams.has("host") && (parsed.searchParams.get("host") ?? "").startsWith("/");
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
  } catch {
    return false;
  }
}

export function seedDemoDecision(input: SeedDemoInput): SeedDemoDecision {
  const real = readSiteEnv({ SITE_ENV: input.siteEnvBeforeDotenv });
  const site = readSiteEnv({ SITE_ENV: input.siteEnv });
  if (real === "production" || site === "production") return { demo: false, reason: "production" };
  if (real && DEMO_SITES.has(real)) return { demo: true, reason: "real_env" };
  if (input.seedDemo?.trim().toLowerCase() === "yes" && site && DEMO_SITES.has(site)) return { demo: true, reason: "seed_demo_flag" };
  if (!site || !DEMO_SITES.has(site)) return { demo: false, reason: "not_development" };
  return isLocalDatabaseUrl(input.databaseUrl) ? { demo: true, reason: "local_database" } : { demo: false, reason: "remote_database" };
}
