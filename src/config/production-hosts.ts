/**
 * The REAL site's host names (SECURITY_REPORT 2.2.j, 3.4.a; founder's decision 1). EMPTY until
 * launch: on launch day the founder adds the real domain(s) here, exactly ("bayit.ge",
 * "www.bayit.ge"; OWNER_TODO "Launch day"). Then:
 *
 * - a development or staging server whose own address is one of them (BETTER_AUTH_URL,
 *   NEXT_PUBLIC_SITE_URL, Netlify's URL or VERCEL_PROJECT_PRODUCTION_URL) REFUSES TO START
 *   (src/lib/startup-check.ts): the real domain is only ever served as SITE_ENV=production, so a
 *   wrong label can never turn test mode or the demo logins on for it;
 * - login codes are never shown on screen for a request to one of them
 *   (src/lib/auth/code-display.ts), whatever the settings say.
 *
 * Staging lives on its own host (a separate hosting project), never a sub-domain of a name here
 * that is listed. Exact names only (no wildcards). Pure: next.config, scripts and tests import it.
 */
export const PRODUCTION_HOSTS: readonly string[] = [];

/** "Bayit.GE:443" → "bayit.ge" (a trailing dot and the port dropped). */
function cleanHost(value: string | null | undefined): string | null {
  const raw = value?.trim().toLowerCase();
  if (!raw) return null;
  const host = raw.startsWith("[") ? raw.slice(1, raw.indexOf("]")) : raw.replace(/:\d+$/, "");
  return host.replace(/\.$/, "") || null;
}

/** Is this host one of the real site's names? */
export function isRealSiteHost(host: string | null | undefined, hosts: readonly string[] = PRODUCTION_HOSTS): boolean {
  const clean = cleanHost(host);
  if (!clean) return false;
  return hosts.some((entry) => cleanHost(entry) === clean);
}

/** The host of an address given with or without a scheme ("https://bayit.ge/x" or "bayit.ge"). */
export function hostOfAddress(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}
