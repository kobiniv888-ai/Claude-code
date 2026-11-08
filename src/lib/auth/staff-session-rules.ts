/**
 * Staff sessions (SECURITY_REPORT 3.5.a, 3.5.c, D9 a). Pure rules, unit-tested; the database and
 * cookie side is ./staff-session.ts.
 *
 * - 12 IDLE HOURS: a staff session whose 2-step code was entered stays verified while it is used.
 *   Each use moves a marker row in the Verification table ("staff-active:<sessionId>", no schema
 *   change) to now + 12 hours. A session without a live marker counts as idle: its 2-step check is
 *   cleared and the next page asks for the authenticator code again (/two-factor).
 * - THE STRICT COOKIE: entering the 2-step code also sets `__Host-bayit.staff` (SameSite=Strict,
 *   HttpOnly, Secure, 12 hours), an HMAC of the session id. The admin panel and every staff action
 *   require it, so a request started by another site (a link, a form) never carries staff rights.
 */

export const STAFF_IDLE_LIMIT_MS = 12 * 60 * 60 * 1000;
/** The marker is moved at most this often (one write per 5 minutes of use, not per request). */
export const STAFF_MARKER_REFRESH_MS = 5 * 60 * 1000;

export const staffActiveKey = (sessionId: string) => `staff-active:${sessionId}`;

/** No marker, or its time ran out: the staff session was idle for 12 hours (or never verified here). */
export function isStaffSessionIdle(markerExpiresAt: Date | null | undefined, now: Date): boolean {
  return !markerExpiresAt || markerExpiresAt.getTime() <= now.getTime();
}

/** Move the marker now? Only once STAFF_MARKER_REFRESH_MS of its 12 hours have passed. */
export function shouldRefreshStaffMarker(markerExpiresAt: Date, now: Date): boolean {
  return markerExpiresAt.getTime() - now.getTime() < STAFF_IDLE_LIMIT_MS - STAFF_MARKER_REFRESH_MS;
}

export const nextStaffMarkerExpiry = (now: Date) => new Date(now.getTime() + STAFF_IDLE_LIMIT_MS);

/** The value the staff cookie must carry for this session (hashed with the server's key). */
export const staffCookiePayload = (sessionId: string) => `staff-cookie:${sessionId}`;

/**
 * Was this request started by another site? (`Sec-Fetch-Site: cross-site`, sent by every current
 * browser.) A SameSite=Strict cookie is then missing on purpose, even though the browser has it.
 */
export function isCrossSiteRequest(secFetchSite: string | null | undefined): boolean {
  return secFetchSite?.trim().toLowerCase() === "cross-site";
}
