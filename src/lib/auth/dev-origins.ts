/**
 * Extra addresses that may open the site and call its APIs besides NEXT_PUBLIC_SITE_URL and
 * BETTER_AUTH_URL: a GitHub Codespace's forwarded ports, localhost, and EXTRA_ALLOWED_ORIGINS
 * (comma-separated hosts or origins, e.g. a tunnel).
 *
 * ONE list shared by next.config.ts (allowedDevOrigins + Server Actions) and Better Auth's
 * trustedOrigins (./server.ts). Pure on purpose: next.config.ts imports it with a relative path,
 * so no "server-only" and no "@/" imports here.
 *
 * Narrow on purpose (SECURITY_REPORT 2.2.i): only THIS codespace's own forwarded addresses
 * (`<CODESPACE_NAME>-<port>.<forwarding domain>`), never "*.app.github.dev" (every codespace on
 * GitHub), and nothing local at all on the real site (SITE_ENV=production; the start-up check also
 * refuses EXTRA_ALLOWED_ORIGINS there: src/lib/startup-check.ts).
 *
 * Why: the Codespaces port forwarder can rewrite the browser's Origin header (for example to
 * https://localhost:3000). Better Auth checks Origin on every request that carries a cookie, so
 * "send code" failed with INVALID_ORIGIN before these origins were trusted.
 */

import { isProductionSite } from "../site-env";

export type OriginsEnv = Record<string, string | undefined>;

function extraEntries(env: OriginsEnv): string[] {
  return (env.EXTRA_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function codespacesDomain(env: OriginsEnv): string | null {
  const domain = env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN?.trim().toLowerCase();
  return env.CODESPACES === "true" && domain && /^[a-z0-9.-]+$/.test(domain) ? domain : null;
}

/** This codespace's own forwarded hosts ("<name>-3000.app.github.dev"), none without its name. */
function codespaceHosts(env: OriginsEnv): string[] {
  const domain = codespacesDomain(env);
  const name = env.CODESPACE_NAME?.trim().toLowerCase();
  if (!domain || !name || !/^[a-z0-9-]+$/.test(name)) return [];
  return localPorts(env).map((port) => `${name}-${port}.${domain}`);
}

/** Strips the scheme and path: "https://a.example.com:8443/x" → "a.example.com". */
function hostOf(entry: string): string {
  const withoutScheme = entry.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  return withoutScheme.split("/")[0]!.replace(/:\d+$/, "");
}

function localPorts(env: OriginsEnv): string[] {
  return [...new Set(["3000", env.PORT?.trim()].filter((port): port is string => !!port && /^\d+$/.test(port)))];
}

/**
 * Host patterns for next.config.ts `allowedDevOrigins` and `serverActions.allowedOrigins`
 * (they take hosts, not origins): "<codespace>-3000.app.github.dev", "localhost:3000" (inside a
 * Codespace, where the forwarder may rewrite Origin to it), "my-tunnel.example.com".
 */
export function extraAllowedHosts(env: OriginsEnv = process.env): string[] {
  const local = !isProductionSite(env) ? codespaceHosts(env) : [];
  return [
    ...new Set([
      ...(local.length > 0 ? [...local, ...localPorts(env).map((port) => `localhost:${port}`)] : []),
      ...extraEntries(env).map(hostOf),
    ]),
  ];
}

/**
 * Origin patterns for Better Auth `trustedOrigins`.
 * - A development or staging site on a development server, or any server running inside a
 *   Codespace (also `npm start` there): http(s)://localhost:3000 (+ $PORT) and this codespace's own
 *   https://<name>-<port>.<forwarding domain>. Never on the real site (SITE_ENV=production).
 * - Always: EXTRA_ALLOWED_ORIGINS — a bare host is trusted over https and http (refused at start
 *   on the real site).
 */
export function extraTrustedOrigins(env: OriginsEnv = process.env): string[] {
  const local = !isProductionSite(env) && (env.NODE_ENV !== "production" || env.CODESPACES === "true");
  const origins: string[] = [];
  if (local) {
    for (const port of localPorts(env)) origins.push(`http://localhost:${port}`, `https://localhost:${port}`);
    for (const host of codespaceHosts(env)) origins.push(`https://${host}`);
  }
  for (const entry of extraEntries(env)) {
    if (entry.includes("://")) origins.push(entry);
    else origins.push(`https://${entry}`, `http://${entry}`);
  }
  return [...new Set(origins)];
}
