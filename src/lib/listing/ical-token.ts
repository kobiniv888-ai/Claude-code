import { randomBytes } from "node:crypto";

/**
 * Calendar export tokens (SECURITY_REPORT 4.7.b, D3): the secret part of a listing's iCal export
 * link (/api/ical/<token>.ics), which hosts paste into Airbnb or Booking.com. 256 bits from the
 * system's secure random generator, URL-safe (base64url, 43 characters), made in the app.
 *
 *   await db.listing.create({ data: { …, icalToken: newIcalToken() } });
 *   await db.listing.update({ where: { id }, data: { icalToken: newIcalToken() } });  // "replace link"
 *
 * Every create path sets it explicitly; the schema default (`@default(nanoid(43))`, also 258
 * bits from crypto.getRandomValues) is only a safety net. Older listings got a cuid (time-based,
 * guessable prefix): scripts/backfill-ical-tokens.ts replaces those. Pure (node:crypto only), so
 * scripts and the seed can import it.
 */

export const ICAL_TOKEN_BYTES = 32;

/** A strong token as made by newIcalToken() (or the schema's nanoid(43) default). */
export const STRONG_ICAL_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function newIcalToken(): string {
  return randomBytes(ICAL_TOKEN_BYTES).toString("base64url");
}

/** True for a 256-bit token; false for an older cuid or anything else (replace those). */
export function isStrongIcalToken(token: string | null | undefined): boolean {
  return typeof token === "string" && STRONG_ICAL_TOKEN.test(token);
}
