import { CONSENT_COOKIE_NAME, CONSENT_MAX_AGE_SECONDS } from "@/lib/consent-cookie";
import { CURRENCY_COOKIE_MAX_AGE, CURRENCY_COOKIE_NAME } from "@/lib/currency/cookie";

/**
 * Every cookie the site sets (SECURITY_REPORT 15.10.a), in one place: the cookie policy's table
 * (src/components/content/cookie-table.tsx), the proxy (the device id) and the tests read it.
 * Pure and client-safe.
 *
 * ONLY ESSENTIAL COOKIES, for everyone, before and without any consent:
 *   - the login cookies ("__Host-bayit.*" on https, "bayit.*" on a plain-http dev server): only
 *     once someone signs in (session, the staff 2-step cookie, the short sign-in state);
 *   - "bayit_consent": the cookie choice itself;
 *   - "bayit_did": a random device id for security only (new-device alerts, code-send limits per
 *     device, "several accounts on one device", and never counting a host's own visits);
 *   - "NEXT_LOCALE" / "bayit_currency": a language or display currency the visitor chose (or the
 *     language of a page they opened that differs from their browser's), i.e. remembering an
 *     explicit interface choice (the CNIL's "user-interface customisation" exemption). The lawyer
 *     confirms the device id and these two (OWNER_TODO).
 * The banner's optional categories cover browser storage, not cookies: "preferences" (recently
 * viewed homes, the last search, closed notices on this device; src/lib/home/history-store.ts)
 * and "analytics" (none exists today). No advertising or third-party tracker is ever loaded.
 *
 * A new cookie must be added here first: tests/unit/cookies-essential.test.ts fails for a cookie
 * set anywhere in src/ that is not listed.
 */

export const DEVICE_COOKIE_NAME = "bayit_did";
/** One year, like the device links it feeds (DEVICE_LINK_RETENTION_DAYS). */
export const DEVICE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";
/** One year (src/i18n/routing.ts localeCookie.maxAge). */
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
/** A login session lasts at most this many days (Better Auth session.expiresIn, src/lib/auth/server.ts). */
export const SESSION_MAX_DAYS = 30;

const DAY = 24 * 60 * 60;

export type SiteCookie = {
  /** Key of its texts in legal.cookies.sections.list.table.rows.<id>. */
  id: "session" | "consent" | "device" | "locale" | "currency";
  /** As shown in the table (the login cookies are a group). */
  name: string;
  category: "necessary";
  /** How long it stays, in days (the text in the table says the same). */
  days: number;
};

export const siteCookies: readonly SiteCookie[] = [
  { id: "session", name: "__Host-bayit.*", category: "necessary", days: SESSION_MAX_DAYS },
  { id: "consent", name: CONSENT_COOKIE_NAME, category: "necessary", days: CONSENT_MAX_AGE_SECONDS / DAY },
  { id: "device", name: DEVICE_COOKIE_NAME, category: "necessary", days: DEVICE_COOKIE_MAX_AGE_SECONDS / DAY },
  { id: "locale", name: LOCALE_COOKIE_NAME, category: "necessary", days: LOCALE_COOKIE_MAX_AGE_SECONDS / DAY },
  { id: "currency", name: CURRENCY_COOKIE_NAME, category: "necessary", days: CURRENCY_COOKIE_MAX_AGE / DAY },
];

/** Is a cookie with this name one of ours, as documented above? (The login cookies by prefix.) */
export function isDocumentedCookie(name: string): boolean {
  if (/^(?:__Host-)?bayit\.[a-z_]+$/.test(name)) return true;
  return siteCookies.some((cookie) => cookie.name === name);
}

/** Every cookie of the site is essential: nothing here may wait for consent. */
export function isEssentialCookie(name: string): boolean {
  return isDocumentedCookie(name);
}
