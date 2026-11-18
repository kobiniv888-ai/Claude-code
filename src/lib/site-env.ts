/**
 * Which kind of site this server is (founder's decision 1, 8 November 2026): our own SITE_ENV
 * setting, never NODE_ENV. NODE_ENV only says how the code was built (`next dev` or `next build`);
 * a codespace's fast version and the password-protected staging site are production BUILDS of
 * sites that are not the real one.
 *
 *   SITE_ENV=development   your computer or the codespace: fake data, test mode allowed
 *   SITE_ENV=staging       the password-protected test site: test mode allowed, demo data allowed
 *   SITE_ENV=production    the real site: no test mode, no demo logins, accounts or listings
 *
 * The server refuses to start when SITE_ENV is missing or invalid (src/lib/startup-check.ts).
 * Everything here fails closed: a missing or misspelled SITE_ENV counts as production for every
 * "is this allowed?" question (test mode, demo data), and as "not production" only where that is the
 * safer answer (search engines: src/lib/seo.ts indexes only SITE_ENV=production).
 *
 * Pure (no server imports, no "@/" imports) so next.config.ts, scripts and tests can import it.
 */

export const SITE_ENVS = ["development", "staging", "production"] as const;
export type SiteEnv = (typeof SITE_ENVS)[number];

type Env = Partial<Record<string, string | undefined>>;

const processEnv = (): Env => (typeof process === "undefined" ? {} : (process.env as Env));

/** SITE_ENV exactly as one of the three names (spaces around it ignored), else null. */
export function readSiteEnv(env: Env = processEnv()): SiteEnv | null {
  const raw = env.SITE_ENV?.trim();
  return raw && (SITE_ENVS as readonly string[]).includes(raw) ? (raw as SiteEnv) : null;
}

/** SITE_ENV, or an Error that says how to set it. */
export function siteEnv(env: Env = processEnv()): SiteEnv {
  const value = readSiteEnv(env);
  if (!value) {
    const raw = env.SITE_ENV?.trim();
    throw new Error(
      raw
        ? `SITE_ENV="${raw}" is not valid: use development, staging or production.`
        : "SITE_ENV is not set: use development, staging or production (see .env.example).",
    );
  }
  return value;
}

/** The real site, or SITE_ENV missing/invalid (fail closed). */
export function isProductionSite(env: Env = processEnv()): boolean {
  const value = readSiteEnv(env);
  return value !== "development" && value !== "staging";
}

/** Test mode may be switched on here: development or staging only. */
export function testModeAllowed(env: Env = processEnv()): boolean {
  const value = readSiteEnv(env);
  return value === "development" || value === "staging";
}

/** AUTH_TEST_MODE asks for test mode (exactly "true", any case, spaces ignored). */
export function testModeRequested(env: Env = processEnv()): boolean {
  return env.AUTH_TEST_MODE?.trim().toLowerCase() === "true";
}

/** Test mode is on: AUTH_TEST_MODE=true AND the site may use it (development or staging). */
export function testModeOn(env: Env = processEnv()): boolean {
  return testModeRequested(env) && testModeAllowed(env);
}

/** Demo logins, demo accounts and demo listings may exist here: never on the real site. */
export function demoAllowed(env: Env = processEnv()): boolean {
  return !isProductionSite(env);
}
