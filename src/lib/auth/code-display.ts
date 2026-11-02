/**
 * May a login code appear on the screen? (founder rule, redesign round 2)
 *
 * - Development (NODE_ENV !== "production"): yes, so anyone can sign in without an SMS or email
 *   service, including as the demo accounts.
 * - Production with AUTH_TEST_MODE=true: only when EVERY host involved is a test host — the
 *   request's Host and X-Forwarded-Host, and the configured site address (NEXT_PUBLIC_SITE_URL,
 *   BETTER_AUTH_URL): localhost, 127.0.0.1, ::1 or a GitHub Codespaces preview (*.app.github.dev).
 *   Checking the configured address too means a forged "Host: localhost" can never turn it on for
 *   the real domain.
 * - Otherwise: never. The real site never shows codes.
 *
 * Pure (no server imports) so it is unit-tested; the server reads it with `codeDisplayForHeaders`.
 */

export type CodeDisplayMode = "development" | "test";

export type CodeDisplayEnv = {
  NODE_ENV?: string;
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

export function isTestModeOn(env: CodeDisplayEnv): boolean {
  return env.AUTH_TEST_MODE?.trim().toLowerCase() === "true";
}

/**
 * The rule itself. `requestHosts`: the Host header and every X-Forwarded-Host entry.
 * Returns why codes may be shown, or null when they must not be.
 */
export function codeDisplayMode(
  env: CodeDisplayEnv,
  requestHosts: readonly (string | null | undefined)[],
): CodeDisplayMode | null {
  if (env.NODE_ENV !== "production") return "development";
  if (!isTestModeOn(env)) return null;
  const fromRequest = requestHosts.filter((host): host is string => !!host?.trim());
  if (fromRequest.length === 0) return null;
  const configured = [hostOfUrl(env.NEXT_PUBLIC_SITE_URL), hostOfUrl(env.BETTER_AUTH_URL)].filter(
    (host): host is string => !!host,
  );
  return [...fromRequest, ...configured].every(isTestHost) ? "test" : null;
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
  if (env.NODE_ENV === "production" && isTestModeOn(env)) {
    if (mode === "test" && !warnedTestMode) {
      warnedTestMode = true;
      console.warn(
        "\n[auth] ************************************************************\n" +
          "[auth] AUTH_TEST_MODE=true: login codes are SHOWN ON SCREEN for test hosts\n" +
          `[auth] (localhost / *.app.github.dev). Request host: ${hosts.join(", ")}\n` +
          "[auth] Never set AUTH_TEST_MODE on the real site.\n" +
          "[auth] ************************************************************\n",
      );
    }
    if (mode === null && !warnedIgnored) {
      warnedIgnored = true;
      console.error(
        `[auth] AUTH_TEST_MODE=true is IGNORED for host "${hosts.join(", ") || "(none)"}" ` +
          "(not localhost or a Codespaces preview). Remove AUTH_TEST_MODE from this server's environment.",
      );
    }
  }
  return mode;
}
