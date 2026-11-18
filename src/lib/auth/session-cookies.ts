/**
 * The login cookies' names and attributes (SECURITY_REPORT 3.5.a). Pure, so it is unit-tested and
 * read by the e2e helpers.
 *
 * Wherever the cookies are Secure (a production build, or any https address: the real site,
 * staging, the codespace preview), every cookie of the login library is named `__Host-bayit.<name>`:
 * the browser then accepts it only with Secure, Path=/ and NO Domain, so no other subdomain and no
 * plain-http page can plant or overwrite a session ("session fixation", 3.5.b). Chromium (and
 * Firefox) count http://localhost as secure, so a production build on localhost (the e2e suite,
 * `npm start` in the codespace) uses the same names.
 *
 * A development server on plain http (`next dev` on http://localhost) keeps unprefixed,
 * non-Secure names (`bayit.session_token`): Safari does not accept Secure cookies there.
 *
 * The login library adds its own `__Secure-` prefix when `useSecureCookies` is on, which cannot be
 * combined with `__Host-`, so it stays off and Secure is set on every cookie through
 * `defaultCookieAttributes` instead.
 *
 * The staff cookie (STAFF_COOKIE, SameSite=Strict) is ours: src/lib/auth/staff-session.ts.
 */

export const COOKIE_PREFIX = "bayit";
export const HOST_PREFIX = "__Host-";

/** Every cookie the login library sets on this site (session, cache, OAuth state). */
export const AUTH_COOKIE_KEYS = ["session_token", "session_data", "dont_remember", "account_data", "state", "oauth_state"] as const;
export type AuthCookieKey = (typeof AUTH_COOKIE_KEYS)[number];

type Env = Partial<Record<string, string | undefined>>;

/** Secure cookies here: a production build, or the login library's address is https. */
export function secureCookiesFor(env: Env): boolean {
  if (env.NODE_ENV === "production") return true;
  const base = (env.BETTER_AUTH_URL ?? env.NEXT_PUBLIC_SITE_URL ?? "").trim().toLowerCase();
  return base.startsWith("https://");
}

/** "__Host-bayit.session_token" (secure) or "bayit.session_token" (plain-http development). */
export function cookieName(key: string, secure: boolean): string {
  return `${secure ? HOST_PREFIX : ""}${COOKIE_PREFIX}.${key}`;
}

export const sessionCookieName = (secure: boolean) => cookieName("session_token", secure);

/** The staff panel's SameSite=Strict cookie (src/lib/auth/staff-session.ts). */
export const staffCookieName = (secure: boolean) => cookieName("staff", secure);

/** The `advanced` cookie options for Better Auth. */
export function authCookieOptions(secure: boolean) {
  return {
    // Never the library's own "__Secure-" prefix: our names carry "__Host-" (see above).
    useSecureCookies: false,
    cookiePrefix: COOKIE_PREFIX,
    ...(secure && { defaultCookieAttributes: { secure: true, path: "/" } }),
    cookies: Object.fromEntries(AUTH_COOKIE_KEYS.map((key) => [key, { name: cookieName(key, secure) }])) as Record<
      AuthCookieKey,
      { name: string }
    >,
  };
}
