import { isPermanentSiteUrl, siteUrl } from "@/lib/site-url";
import { isTestHost, normalizeHost } from "./code-display";

/**
 * Who may open the admin panel (founder's answer 1, round 3). Pure, so it is unit-tested; the
 * server applies it in requireStaff / requireStaffForAction (`./session`).
 *
 * - Real staff accounts ALWAYS need 2-step login (an authenticator app), in development too.
 * - Demo staff accounts ("Demo Admin" etc., `isDemo`) may open the panel only while the site runs
 *   on a test address (localhost or a Codespaces preview), never on its permanent address. In
 *   development they may skip 2-step login with DEV_SKIP_STAFF_2FA=true; in production mode
 *   (`npm start` in the codespace) they need it like everyone else.
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
  DEV_SKIP_STAFF_2FA?: string;
  SITE_URL?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  BETTER_AUTH_URL?: string;
};

export type StaffAccessUser = {
  isStaff: boolean;
  isDemo: boolean;
  twoFactorEnabled: boolean;
  /** True when 2-step login is off, or its code was entered in this session. */
  twoFactorVerified: boolean;
};

/**
 * - ok: may open the panel (the permission is checked separately)
 * - not_staff: a regular account (the panel answers "not found")
 * - demo_blocked: a demo staff account on the permanent address (also "not found")
 * - needs_setup: 2-step login is not set up yet (→ /two-factor/setup)
 * - needs_code: 2-step login is on but its code was not entered in this session (→ /two-factor)
 */
export type StaffAccess = "ok" | "not_staff" | "demo_blocked" | "needs_setup" | "needs_code";

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

/** Does the site run on its permanent (real) address? Production without an address counts as yes. */
export function isPermanentSiteAddress(env: StaffAccessEnv): boolean {
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
 * The development shortcut: skip 2-step login. Only for demo accounts, only outside production,
 * only with DEV_SKIP_STAFF_2FA=true. Never for a real account.
 */
export function canSkipStaffTwoFactor(env: StaffAccessEnv, user: Pick<StaffAccessUser, "isDemo">): boolean {
  return env.NODE_ENV !== "production" && env.DEV_SKIP_STAFF_2FA?.trim() === "true" && user.isDemo === true;
}

/** The whole rule for one signed-in account. */
export function staffAccess(
  env: StaffAccessEnv,
  requestHosts: readonly (string | null | undefined)[] | null,
  user: StaffAccessUser,
): StaffAccess {
  if (!user.isStaff) return "not_staff";
  if (user.isDemo && !demoStaffAllowed(env, requestHosts)) return "demo_blocked";
  if (user.twoFactorEnabled) return user.twoFactorVerified ? "ok" : "needs_code";
  return canSkipStaffTwoFactor(env, user) ? "ok" : "needs_setup";
}
