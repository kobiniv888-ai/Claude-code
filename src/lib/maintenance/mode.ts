/**
 * Maintenance mode (SECURITY_REPORT 12.5.c, 17.1 "contain"): the site offline in ONE step. Pure
 * rules (no server imports) for src/proxy.ts (./proxy-gate.ts), the admin switch (./actions.ts)
 * and the tests.
 *
 * Two switches, either one is enough:
 *   - the hosting setting MAINTENANCE_MODE=on: works even when the database is down (a redeploy);
 *   - Admin → Maintenance → "Turn on maintenance mode" (SiteSetting "maintenanceMode"): within
 *     MAINTENANCE_CACHE_MS on every server, no redeploy.
 *
 * While it is on, every public page answers a calm 503 page in the visitor's language with
 * Retry-After (./page.ts) and every public API a 503 JSON. What stays reachable:
 *   - always: the health check (/api/health), scheduled jobs (/api/cron/*, CRON_SECRET: backups
 *     and the founder's security alerts keep running), signed provider webhooks (/api/webhooks/*),
 *     the login library (/api/auth/*, with its own limits) and /.well-known/security.txt, public
 *     photos (/api/media, /_next/image) and static files;
 *   - the staff entry pages (/<locale>/login, /<locale>/two-factor…): anyone may LOAD them; their
 *     actions only for an ADMIN account's session;
 *   - the admin panel (/<locale>/admin…, /api/admin/…): only an ADMIN account's session (the panel
 *     itself still asks for the 2-step code, as always);
 *   - everything else: only an ADMIN whose 2-step code is entered in this session.
 * Moderators, support and editors wait like everyone else.
 *
 * Fail-safe defaults: an unknown MAINTENANCE_MODE value counts as ON (someone meant to close the
 * site; the startup check warns); a stored value that is not exactly { on: true } counts as off; a
 * database that cannot be read keeps the last value known (none known: off, retried on the next
 * request); a session check that fails counts as "not an admin" (503).
 */
import { locales } from "@/config/site";

/** SiteSetting key of the admin switch (value: StoredMaintenance). */
export const MAINTENANCE_SETTING_KEY = "maintenanceMode";
/** The 503's Retry-After: ten minutes. */
export const MAINTENANCE_RETRY_AFTER_SECONDS = 600;
/** How long a server keeps the stored switch before reading it again. */
export const MAINTENANCE_CACHE_MS = 10_000;

export { envForcesMaintenance, readMaintenanceEnv, type MaintenanceEnvValue } from "./env";

export type StoredMaintenance = { on: boolean; since: string | null; by: string | null };

export const MAINTENANCE_OFF: StoredMaintenance = { on: false, since: null, by: null };

/** The stored admin switch; anything but `{ on: true }` is off. */
export function parseStoredMaintenance(value: unknown): StoredMaintenance {
  if (!value || typeof value !== "object" || Array.isArray(value)) return MAINTENANCE_OFF;
  const raw = value as Record<string, unknown>;
  if (raw.on !== true) return MAINTENANCE_OFF;
  return {
    on: true,
    since: typeof raw.since === "string" ? raw.since : null,
    by: typeof raw.by === "string" ? raw.by : null,
  };
}

/** Where a request goes while maintenance mode is on. */
export type MaintenanceArea = "open" | "staff-entry" | "admin" | "closed";

const LOCALE = `(?:${locales.join("|")})`;
const OPEN_PATHS = [
  /^\/api\/health\/?$/,
  /^\/api\/cron\//,
  /^\/api\/webhooks\//,
  /^\/api\/auth\//,
  /^\/api\/media\//,
  /^\/\.well-known\/security\.txt$/,
  /^\/_next\//,
  /^\/_vercel\//,
];
/** robots.txt and the sitemap are pages too (they read the database): closed like the rest. */
const CLOSED_FILES = /^\/(?:robots\.txt|sitemap\.xml)$/;
const LOCALE_PREFIX = new RegExp(`^/${LOCALE}(?:/|$)`);
/**
 * A static file from public/ (icons, photos, fonts, the manifest). Never under a language prefix:
 * there a dot can still render a page ("/he/listing/12-x.y"), which stays closed.
 */
const STATIC_FILE = /^\/(?!api\/)[^?#]*\.[A-Za-z0-9]{2,8}$/;
const STAFF_ENTRY = new RegExp(`^(?:/${LOCALE})?/(?:login|two-factor)(?:/|$)`);
const ADMIN_AREA = new RegExp(`^(?:/${LOCALE}/admin(?:/|$)|/api/admin/)`);

export function maintenanceArea(pathname: string): MaintenanceArea {
  if (OPEN_PATHS.some((pattern) => pattern.test(pathname))) return "open";
  if (CLOSED_FILES.test(pathname)) return "closed";
  if (STATIC_FILE.test(pathname) && !LOCALE_PREFIX.test(pathname)) return "open";
  if (STAFF_ENTRY.test(pathname)) return "staff-entry";
  if (ADMIN_AREA.test(pathname)) return "admin";
  return "closed";
}

/** Who is asking, as far as maintenance mode cares (null: signed out, or the check failed). */
export type MaintenanceViewer = { role: string; twoFactorVerified: boolean } | null;

export type MaintenanceRequest = {
  pathname: string;
  method: string;
  /** A server action call (the Next-Action header): it can run any action, whatever the path. */
  isAction: boolean;
};

/** May this request through while maintenance mode is on? */
export function maintenanceAllows(request: MaintenanceRequest, viewer: MaintenanceViewer): boolean {
  const area = maintenanceArea(request.pathname);
  if (area === "open") return true;
  const admin = viewer?.role === "ADMIN";
  const reading = (request.method === "GET" || request.method === "HEAD") && !request.isAction;
  if (area === "staff-entry") return reading || admin;
  if (area === "admin") return admin;
  return admin && viewer!.twoFactorVerified;
}

/** Does this request need the session looked up to decide (no lookup for open paths and staff-entry page loads)? */
export function maintenanceNeedsViewer(request: MaintenanceRequest): boolean {
  const area = maintenanceArea(request.pathname);
  if (area === "open") return false;
  if (area === "staff-entry") return !((request.method === "GET" || request.method === "HEAD") && !request.isAction);
  return true;
}

/** "/ru/search" → "ru"; else the first supported language of Accept-Language; else Hebrew. */
export function maintenanceLocale(pathname: string, acceptLanguage: string | null | undefined): (typeof locales)[number] {
  const first = pathname.split("/")[1] ?? "";
  if ((locales as readonly string[]).includes(first)) return first as (typeof locales)[number];
  for (const part of (acceptLanguage ?? "").split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase().split("-")[0] ?? "";
    if ((locales as readonly string[]).includes(tag)) return tag as (typeof locales)[number];
  }
  return "he";
}

/** Requests that want JSON (the API), not a page. */
export function wantsJson(pathname: string): boolean {
  return pathname.startsWith("/api/");
}
