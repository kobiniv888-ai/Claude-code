/**
 * Allow-lists of outside sites whose links hosts may paste (client-safe, pure).
 * SECURITY_REPORT 8.1.a and 7.f (founder's answer Q15, 8 November 2026). To add a site, add its
 * domain to the list: a domain also allows its subdomains ("booking.com" allows
 * "admin.booking.com"), never look-alikes ("booking.com.evil.example", "evilbooking.com").
 *
 * - CALENDAR_IMPORT_DOMAINS: the calendar links the hourly iCal import may download
 *   (src/lib/ical.ts assertSafeFeedUrl, checked on save and again on every redirect hop).
 * - TOUR_DOMAINS: the 360° tour links a listing may show (src/lib/wizard/schemas.ts on save,
 *   src/lib/listing-page/media.ts safeTourUrl on every render).
 */

/** Airbnb (its country sites too), Booking.com, Vrbo / HomeAway and Google Calendar. */
export const CALENDAR_IMPORT_DOMAINS = [
  "airbnb.com",
  "airbnb.co.il",
  "airbnb.ru",
  "airbnb.co.uk",
  "airbnb.de",
  "airbnb.fr",
  "airbnb.es",
  "airbnb.it",
  "airbnb.nl",
  "airbnb.pl",
  "airbnb.ca",
  "airbnb.com.au",
  "booking.com",
  "vrbo.com",
  "homeaway.com",
  "homeaway.co.uk",
  "calendar.google.com",
] as const;

/**
 * Airbnb's other country sites. Airbnb shows the calendar export link on the site the host
 * browses, and the same path works on www.airbnb.com, so a link on one of these is stored as
 * https://www.airbnb.com/<same path and query> (canonicalCalendarImportUrl, on save). We never
 * download from these hosts, so this list widens nothing: each entry is an exact domain (with its
 * subdomains), never a pattern like "airbnb.*".
 */
export const AIRBNB_COUNTRY_DOMAINS = [
  "airbnb.at",
  "airbnb.be",
  "airbnb.ch",
  "airbnb.cl",
  "airbnb.co.cr",
  "airbnb.co.id",
  "airbnb.co.in",
  "airbnb.co.kr",
  "airbnb.co.nz",
  "airbnb.co.ve",
  "airbnb.co.za",
  "airbnb.com.ar",
  "airbnb.com.bo",
  "airbnb.com.br",
  "airbnb.com.co",
  "airbnb.com.ec",
  "airbnb.com.gt",
  "airbnb.com.hk",
  "airbnb.com.mt",
  "airbnb.com.my",
  "airbnb.com.pe",
  "airbnb.com.ph",
  "airbnb.com.sg",
  "airbnb.com.tr",
  "airbnb.com.tw",
  "airbnb.com.ua",
  "airbnb.cz",
  "airbnb.dk",
  "airbnb.fi",
  "airbnb.gr",
  "airbnb.hu",
  "airbnb.ie",
  "airbnb.is",
  "airbnb.jp",
  "airbnb.lu",
  "airbnb.mx",
  "airbnb.no",
  "airbnb.pt",
  "airbnb.se",
] as const;

/**
 * The form an import link is stored in: a link on one of Airbnb's other country sites
 * (AIRBNB_COUNTRY_DOMAINS) becomes the same path and query on https://www.airbnb.com; anything
 * else is returned trimmed and unchanged (the allow-list check still follows).
 */
export function canonicalCalendarImportUrl(value: string): string {
  const raw = value.trim();
  const url = allowListedHttpsUrl(raw, AIRBNB_COUNTRY_DOMAINS);
  if (!url) return raw;
  return `https://www.airbnb.com${url.pathname}${url.search}`;
}

/** Matterport, Kuula, Momento360 and Roundme. */
export const TOUR_DOMAINS = ["matterport.com", "kuula.co", "momento360.com", "roundme.com"] as const;

/**
 * The host name as the allow-lists compare it: lower case, without one trailing dot
 * ("airbnb.com." is the same DNS name). Returns "" for anything that is not a plain DNS name.
 */
export function normalizeHostname(hostname: string): string {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : "";
}

/** True when `hostname` is one of `domains` or a subdomain of one. */
export function hostOnAllowList(hostname: string, domains: readonly string[]): boolean {
  const host = normalizeHostname(hostname);
  if (!host) return false;
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/**
 * A link on the allow-list: https, the default port, no user name or password, a listed host.
 * Returns the parsed URL, or null.
 */
export function allowListedHttpsUrl(value: string | null | undefined, domains: readonly string[], maxLength = 2048): URL | null {
  const raw = value?.trim();
  if (!raw || raw.length > maxLength) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "443") return null;
  return hostOnAllowList(url.hostname, domains) ? url : null;
}

export function isCalendarImportHost(hostname: string): boolean {
  return hostOnAllowList(hostname, CALENDAR_IMPORT_DOMAINS);
}

/** A 360° tour link we may save and show (https on Matterport, Kuula, Momento360 or Roundme). */
export function isTourUrl(value: string | null | undefined): boolean {
  return allowListedHttpsUrl(value, TOUR_DOMAINS) !== null;
}
