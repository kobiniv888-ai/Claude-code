/**
 * Cross-site request check for route handlers that change data with the session cookie
 * (uploads, avatar). Server actions get the same check from Next.js, and Better Auth checks
 * the Origin of /api/auth/* itself.
 *
 * A request is refused when the browser says it came from another site:
 * - `Sec-Fetch-Site` (all current browsers) must be "same-origin" (or "none": typed by the user);
 * - otherwise an `Origin` header, when present, must be one of the allowed origins or the
 *   request's own host.
 * Requests with neither header do not come from a browser page, so they carry no victim's cookie.
 *
 * Pure (no server imports), so it is easy to test.
 */

function originOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/** The site's own origins: SITE_URL, NEXT_PUBLIC_SITE_URL and BETTER_AUTH_URL (when set). */
export function siteOrigins(env: Record<string, string | undefined> = process.env): string[] {
  return [env.SITE_URL, env.NEXT_PUBLIC_SITE_URL, env.BETTER_AUTH_URL]
    .map((value) => originOf(value?.trim()))
    .filter((value): value is string => !!value);
}

export function isSameOriginRequest(request: Request, allowedOrigins: readonly string[] = siteOrigins()): boolean {
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite) return fetchSite === "same-origin" || fetchSite === "none";

  const origin = request.headers.get("origin")?.trim();
  if (!origin) return true;
  if (origin === "null") return false;
  const normalized = originOf(origin);
  if (!normalized) return false;
  if (allowedOrigins.includes(normalized)) return true;

  // The host the request was sent to (Vercel and most proxies keep the public Host header).
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host")?.trim();
  return !!host && new URL(normalized).host === host.toLowerCase();
}
