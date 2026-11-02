/**
 * Extra addresses that may open the site and call its APIs besides NEXT_PUBLIC_SITE_URL and
 * BETTER_AUTH_URL: a GitHub Codespace's forwarded ports, localhost, and EXTRA_ALLOWED_ORIGINS
 * (comma-separated hosts or origins, e.g. a tunnel).
 *
 * ONE list shared by next.config.ts (allowedDevOrigins + Server Actions) and Better Auth's
 * trustedOrigins (./server.ts). Pure on purpose: next.config.ts imports it with a relative path,
 * so no "server-only" and no "@/" imports here.
 *
 * Why: the Codespaces port forwarder can rewrite the browser's Origin header (for example to
 * https://localhost:3000). Better Auth checks Origin on every request that carries a cookie, so
 * "send code" failed with INVALID_ORIGIN before these origins were trusted.
 */

export type OriginsEnv = Record<string, string | undefined>;

function extraEntries(env: OriginsEnv): string[] {
  return (env.EXTRA_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function codespacesDomain(env: OriginsEnv): string | null {
  const domain = env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN?.trim();
  return env.CODESPACES === "true" && domain ? domain : null;
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
 * (they take hosts, not origins): "*.app.github.dev", "localhost:3000" (inside a Codespace, where
 * the forwarder may rewrite Origin to it), "my-tunnel.example.com".
 */
export function extraAllowedHosts(env: OriginsEnv = process.env): string[] {
  const domain = codespacesDomain(env);
  return [
    ...new Set([
      ...(domain ? [`*.${domain}`, ...localPorts(env).map((port) => `localhost:${port}`)] : []),
      ...extraEntries(env).map(hostOf),
    ]),
  ];
}

/**
 * Origin patterns for Better Auth `trustedOrigins` (it accepts "https://*.example.com").
 * - Development, or any server running inside a Codespace (also `npm start` there):
 *   http(s)://localhost:3000 (+ $PORT) and https://*.<codespaces forwarding domain>.
 * - Always: EXTRA_ALLOWED_ORIGINS — a bare host is trusted over https and http.
 * Never adds anything in a production deployment unless EXTRA_ALLOWED_ORIGINS says so.
 */
export function extraTrustedOrigins(env: OriginsEnv = process.env): string[] {
  const domain = codespacesDomain(env);
  const local = env.NODE_ENV !== "production" || env.CODESPACES === "true";
  const origins: string[] = [];
  if (local) {
    for (const port of localPorts(env)) origins.push(`http://localhost:${port}`, `https://localhost:${port}`);
  }
  if (domain && local) origins.push(`https://*.${domain}`);
  for (const entry of extraEntries(env)) {
    if (entry.includes("://")) origins.push(entry);
    else origins.push(`https://${entry}`, `http://${entry}`);
  }
  return [...new Set(origins)];
}
