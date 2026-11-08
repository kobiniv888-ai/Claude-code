import { readSiteEnv, testModeOn, testModeRequested } from "../site-env";

/**
 * May a login code appear on the screen? (founder's decision 1, 8 November 2026)
 *
 * Only in TEST MODE: AUTH_TEST_MODE=true on a site whose SITE_ENV is development or staging
 * (src/lib/site-env.ts). The real site (SITE_ENV=production) refuses to start with test mode on
 * (src/lib/startup-check.ts), so it never shows codes. NODE_ENV plays no part: `npm run dev`
 * without AUTH_TEST_MODE=true shows no codes either.
 *
 * On top of that, every host involved must belong to the site (a site address must be configured):
 * - development: the request's Host and X-Forwarded-Host AND the configured addresses
 *   (NEXT_PUBLIC_SITE_URL, BETTER_AUTH_URL) are all test hosts: localhost, 127.0.0.1, ::1 or a
 *   GitHub Codespaces preview (*.app.github.dev). A forged "Host: localhost" never turns it on for
 *   a real domain.
 * - staging (the password-protected test site): every request host is one of the configured
 *   addresses.
 * - A request without any host: never. `requestHosts = null` means "no request at all" (a job):
 *   then only the configured addresses count.
 *
 * Pure (no server imports) so it is unit-tested; the server reads it with `codeDisplayForHeaders`.
 */

export type CodeDisplayMode = "development" | "test";

export type CodeDisplayEnv = {
  NODE_ENV?: string;
  SITE_ENV?: string;
  AUTH_TEST_MODE?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  BETTER_AUTH_URL?: string;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const CODESPACES_SUFFIX = ".app.github.dev";

/** "Name-3000.app.github.dev:443" → "name-3000.app.github.dev"; "[::1]:3000" → "::1". */
export function normalizeHost(value: string | null | undefined): string | null {
  const raw = value?.trim().toLowerCase();
  if (!raw) return null;
  if (raw.startsWith("[")) {
    const end = raw.indexOf("]");
    return end > 0 ? raw.slice(1, end) : null;
  }
  // A bare IPv6 address has several colons and no port.
  if ((raw.match(/:/g) ?? []).length > 1) return raw;
  return raw.replace(/:\d+$/, "") || null;
}

/** localhost, 127.0.0.1, ::1 or a Codespaces preview address. */
export function isTestHost(value: string | null | undefined): boolean {
  const host = normalizeHost(value);
  if (!host) return false;
  if (LOCAL_HOSTS.has(host)) return true;
  return host.endsWith(CODESPACES_SUFFIX) && host.length > CODESPACES_SUFFIX.length && !host.includes("/");
}

function hostOfUrl(url: string | undefined): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname || null;
  } catch {
    return null;
  }
}

/** Test mode is on for this site: AUTH_TEST_MODE=true and SITE_ENV development or staging. */
export function isTestModeOn(env: CodeDisplayEnv): boolean {
  return testModeOn(env);
}

/**
 * The rule itself. `requestHosts`: the Host header and every X-Forwarded-Host entry, or null
 * when there is no request (a scheduled job). Returns why codes may be shown ("development" on a
 * development server, "test" on a production build), or null when they must not be.
 */
export function codeDisplayMode(
  env: CodeDisplayEnv,
  requestHosts: readonly (string | null | undefined)[] | null,
): CodeDisplayMode | null {
  if (!testModeOn(env)) return null;
  const configured = [hostOfUrl(env.NEXT_PUBLIC_SITE_URL), hostOfUrl(env.BETTER_AUTH_URL)].filter(
    (host): host is string => !!host,
  );
  if (configured.length === 0) return null;
  const fromRequest = requestHosts === null ? [] : requestHosts.filter((host): host is string => !!host?.trim());
  if (requestHosts !== null && fromRequest.length === 0) return null;
  const label: CodeDisplayMode = env.NODE_ENV === "production" ? "test" : "development";
  if (readSiteEnv(env) === "development") {
    return [...fromRequest, ...configured].every(isTestHost) ? label : null;
  }
  // Staging: only the site's own configured address(es).
  const own = new Set(configured.map((host) => normalizeHost(host)));
  return fromRequest.every((host) => own.has(normalizeHost(host))) ? label : null;
}

/** Host + X-Forwarded-Host entries of a request. */
export function requestHostsOf(headers: Pick<Headers, "get"> | null | undefined): string[] {
  if (!headers) return [];
  const forwarded = (headers.get("x-forwarded-host") ?? "").split(",").map((entry) => entry.trim());
  return [headers.get("host") ?? "", ...forwarded].filter(Boolean);
}

let warnedTestMode = false;
let warnedIgnored = false;

/** The rule for this request (process.env + its headers). Logs loudly when test mode is on. */
export function codeDisplayForHeaders(headers: Pick<Headers, "get"> | null | undefined): CodeDisplayMode | null {
  const env = process.env as CodeDisplayEnv;
  const hosts = requestHostsOf(headers);
  const mode = codeDisplayMode(env, hosts);
  if (testModeRequested(env)) {
    if (mode === "test" && !warnedTestMode) {
      warnedTestMode = true;
      console.warn(
        "\n[auth] ************************************************************\n" +
          `[auth] AUTH_TEST_MODE=true (SITE_ENV=${env.SITE_ENV ?? "?"}): login codes are SHOWN ON SCREEN\n` +
          `[auth] for this site's own test address. Request host: ${hosts.join(", ")}\n` +
          "[auth] Never set AUTH_TEST_MODE on the real site.\n" +
          "[auth] ************************************************************\n",
      );
    }
    if (mode === null && !warnedIgnored) {
      warnedIgnored = true;
      console.error(
        `[auth] AUTH_TEST_MODE=true is IGNORED for host "${hosts.join(", ") || "(none)"}" ` +
          "(not this site's test address, or SITE_ENV does not allow test mode). Remove AUTH_TEST_MODE from this server's environment.",
      );
    }
  }
  return mode;
}
