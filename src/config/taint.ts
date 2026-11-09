/**
 * React's taint API on or off (SECURITY_REPORT 5.k): the one switch. next.config.ts reads it for
 * `experimental.taint`, which also moves the app directory to React's EXPERIMENTAL build (the only
 * build that has the API). src/lib/security/taint.ts does nothing when the API is missing, so the
 * pages work either way; with it off, the DTOs and the data-exposure e2e test are the guard.
 *
 * The committed value decides on the real site (SITE_ENV=production, or SITE_ENV missing). On a
 * development or staging site REACT_TAINT="off" or "on" overrides it for a speed A/B. Build and
 * start must then see the same value: `next start` reads next.config.ts again, and a server that
 * says "on" over a build made "off" answers every page with an error (Next.js taints process.env
 * itself when the flag is on).
 *
 * Pure (no server or "@/" imports) so next.config.ts, scripts and tests can import it.
 */
import { isProductionSite } from "../lib/site-env";

/** The committed choice. The founder decides between taint and the speed score (SECURITY_REPORT 5.k). */
export const REACT_TAINT = true;

type Env = Partial<Record<string, string | undefined>>;

/** Whether this build/server uses React's taint API (and with it React's experimental build). */
export function reactTaintEnabled(env: Env = typeof process === "undefined" ? {} : (process.env as Env)): boolean {
  if (isProductionSite(env)) return REACT_TAINT;
  const override = env.REACT_TAINT?.trim().toLowerCase();
  if (override === "off") return false;
  if (override === "on") return true;
  return REACT_TAINT;
}
