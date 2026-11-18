import { isPermanentSiteUrl, siteUrl } from "@/lib/site-url";
import { isProductionSite, readSiteEnv } from "@/lib/site-env";
import { isTestHost, normalizeHost } from "./code-display";

/**
 * Who may open the admin panel (founder's answer 1, round 3). Pure, so it is unit-tested; the
 * server applies it in requireStaff / requireStaffForAction (`./session`).
 *
 * - Real staff accounts ALWAYS need 2-step login (an authenticator app), in development too.
 * - Demo staff accounts ("Demo Admin" etc., `isDemo`) may open the panel only while the site runs
 *   on a test address (localhost or a Codespaces preview), never on its permanent address and
 *   never on the real site (SITE_ENV=production: demo accounts are never staff there, and cannot
 *   even sign in). On a development server (`next dev`, SITE_ENV=development) they may skip 2-step
 *   login with DEV_SKIP_STAFF_2FA=true; on a production build (`npm start` in the codespace) they
 *   need it like everyone else.
 *
 * "Permanent address": the links address is permanent (isPermanentSiteUrl, src/lib/site-url.ts),
 * or any configured site address (SITE_URL, NEXT_PUBLIC_SITE_URL, BETTER_AUTH_URL) is not a test
 * host, or, in production, no address is configured at all. This is stricter than the links rule
 * on purpose: a Vercel preview or a tunnel also counts as "permanent" here, so demo staff work
 * only on localhost and Codespaces. The request's own Host / X-Forwarded-Host must be test hosts
 * too, so a wrong setting can never let a demo account in on the real domain.
 */

export type StaffAccessEnv = {
  NODE_ENV?: string;
  SITE_ENV?: string;
  DEV_SKIP_STAFF_2FA?: string;
  SITE_URL?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  BETTER_AUTH_URL?: string;
};

export type StaffAccessUser = {
  isStaff: boolean;
  isDemo: boolean;
  twoFactorEnabled: boolean;
  /** True when 2-step login is off, or its code was entered in this session (and it was not idle 12 hours). */
  twoFactorVerified: boolean;
  /**
   * The request carries this session's SameSite=Strict staff cookie (./staff-session.ts), set when
   * the 2-step code was entered. Without it (a request started by another site, or a cookie that
   * is gone) staff rights are refused even in a verified session.
   */
  strictCookie: boolean;
};

/**
 * - ok: may open the panel (the permission is checked separately)
 * - not_staff: a regular account (the panel answers "not found")
 * - demo_blocked: a demo staff account on the permanent address (also "not found")
 * - needs_setup: 2-step login is not set up yet (→ /two-factor/setup)
 * - needs_code: 2-step login is on but its code was not entered in this session (→ /two-factor)
 * - needs_strict_cookie: the code was entered, but this request has no staff cookie (→ /two-factor,
 *   which offers "continue" for a link from another site, or asks for the code again)
 */
export type StaffAccess = "ok" | "not_staff" | "demo_blocked" | "needs_setup" | "needs_code" | "needs_strict_cookie";

function hostOfUrl(url: string | undefined): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  try {
    return normalizeHost(new URL(raw).host);
  } catch {
    return null;
  }
}

/** The configured site addresses' hosts (SITE_URL, NEXT_PUBLIC_SITE_URL, BETTER_AUTH_URL). */
export function configuredSiteHosts(env: StaffAccessEnv): string[] {
  return [env.SITE_URL, env.NEXT_PUBLIC_SITE_URL, env.BETTER_AUTH_URL]
    .map(hostOfUrl)
    .filter((host): host is string => !!host);
}

/**
 * Does the site run on its permanent (real) address? The real site (SITE_ENV=production, or
 * SITE_ENV missing/invalid) always counts as yes; so does a production build without an address.
 */
export function isPermanentSiteAddress(env: StaffAccessEnv): boolean {
  if (isProductionSite(env)) return true;
  if (isPermanentSiteUrl(siteUrl(env))) return true;
  const hosts = configuredSiteHosts(env);
  if (hosts.length === 0) return env.NODE_ENV === "production";
  return hosts.some((host) => !isTestHost(host));
}

/**
 * May a demo staff account use staff rights here? Only on a test address: every configured
 * address and every request host (when known) must be localhost or a Codespaces preview.
 * `requestHosts` = null when the caller has no request (then only the configuration counts).
 */
export function demoStaffAllowed(env: StaffAccessEnv, requestHosts: readonly (string | null | undefined)[] | null): boolean {
  if (isPermanentSiteAddress(env)) return false;
  if (requestHosts === null) return true;
  const hosts = requestHosts.filter((host): host is string => !!host?.trim());
  if (hosts.length === 0) return false;
  return hosts.every(isTestHost);
}

/**
 * The development shortcut: skip 2-step login. Only for demo accounts, only on a development
 * server (`next dev`) of a development site (SITE_ENV=development; both must hold, so it is never
 * looser than before SITE_ENV existed), only with DEV_SKIP_STAFF_2FA=true. Never for a real account.
 */
export function canSkipStaffTwoFactor(env: StaffAccessEnv, user: Pick<StaffAccessUser, "isDemo">): boolean {
  return (
    env.NODE_ENV !== "production" &&
    readSiteEnv(env) === "development" &&
    env.DEV_SKIP_STAFF_2FA?.trim() === "true" &&
    user.isDemo === true
  );
}

/** The whole rule for one signed-in account. */
export function staffAccess(
  env: StaffAccessEnv,
  requestHosts: readonly (string | null | undefined)[] | null,
  user: StaffAccessUser,
): StaffAccess {
  if (!user.isStaff) return "not_staff";
  if (user.isDemo && !demoStaffAllowed(env, requestHosts)) return "demo_blocked";
  if (user.twoFactorEnabled) {
    if (!user.twoFactorVerified) return "needs_code";
    return user.strictCookie ? "ok" : "needs_strict_cookie";
  }
  return canSkipStaffTwoFactor(env, user) ? "ok" : "needs_setup";
}
