import "server-only";
import { db } from "@/lib/db";
import { RateLimitError } from "@/lib/errors";
import { hmacHash } from "@/lib/crypto";
import { getClientIp, getIpHash } from "@/lib/request";
import { recordSecurityEvent } from "@/lib/security/events";

/**
 * Fixed-window rate limiting stored in Postgres (table RateLimit), so it works the same
 * on one server or many serverless instances.
 *
 *   await assertRateLimit(`listing:create:${user.id}`, { limit: 10, windowSeconds: 3600 });
 *   const r = await rateLimitByIp("places", { limit: 60, windowSeconds: 60 });
 *   if (!r.ok) …                       // over the limit, OR the store could not be checked
 *   const q = await rateLimit(key, { limit: 1, windowSeconds: 3600, failOpen: true });
 *
 * One atomic INSERT … ON CONFLICT per call: the first hit opens a window, later hits
 * increment it, and a hit after `resetAt` starts a new window.
 *
 * FAIL CLOSED (SECURITY_REPORT 12.5.b, L6, C13; checklist rule 0.4): when the store errors (the
 * database is down, a timeout), the action is REFUSED: `rateLimit` answers `{ ok: false,
 * failed: true }` and `assertRateLimit` / `assertRateLimitByIp` throw RateLimitError (shown as
 * "too many tries, try again in a moment"), with a short retry time (STORE_ERROR_RETRY_SECONDS).
 * Login codes, SMS, 2-step login, bookings, reports, uploads… all stay limited when the store is
 * broken. The error is logged; it never lets a request through.
 *
 * `failOpen: true` is an explicit opt-in for HARMLESS counters only, where refusing would do harm
 * and allowing costs nothing. Today only the alert quotas that decide whether to send a FOUNDER /
 * host alert use it (src/lib/alerts/founder-admin.ts, src/lib/alerts/host.ts,
 * src/lib/booking/alerts.ts, src/lib/reports/notify.ts): with a broken store, an alert is sent
 * rather than silently dropped. Never use it for anything a visitor can trigger to cost us money
 * or to guess something.
 */

export type RateLimitOptions = {
  limit: number;
  windowSeconds: number;
  /** Allow the request when the store cannot be checked (harmless counters only; default false). */
  failOpen?: boolean;
};
export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: Date;
  /** True when the store could not be checked (the answer is then the fail-closed/fail-open default). */
  failed?: boolean;
};

/** How long a refused-because-the-store-failed request is asked to wait. */
export const STORE_ERROR_RETRY_SECONDS = 30;

const MAX_KEY_LENGTH = 200;

/**
 * What a key limits, for the security event log: its leading NAME parts ("auth:otp-send",
 * "listing:create", "places:ip"), at most two, stopping at the first part that could be an id, a
 * hash or a value (digits, long, or anything but lowercase words). Never an id, IP hash or address.
 */
export function rateLimitScope(key: string): string {
  const parts: string[] = [];
  for (const part of key.split(":")) {
    if (parts.length === 2 || !/^[a-z][a-z_-]{0,23}$/.test(part)) break;
    parts.push(part);
  }
  return parts.join(":") || "other";
}

function normalizeKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) throw new Error("rateLimit: key is required");
  return trimmed.length > MAX_KEY_LENGTH ? trimmed.slice(0, MAX_KEY_LENGTH) : trimmed;
}

export async function rateLimit(key: string, { limit, windowSeconds, failOpen = false }: RateLimitOptions): Promise<RateLimitResult> {
  if (!Number.isFinite(limit) || limit < 1) throw new Error("rateLimit: limit must be ≥ 1");
  if (!Number.isFinite(windowSeconds) || windowSeconds < 1) throw new Error("rateLimit: windowSeconds must be ≥ 1");

  const id = normalizeKey(key);
  const now = new Date();
  const windowEnd = new Date(now.getTime() + Math.round(windowSeconds) * 1000);

  try {
    const rows = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt")
      VALUES (${id}, 1, ${windowEnd})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN EXCLUDED."resetAt" ELSE "RateLimit"."resetAt" END
      RETURNING "count", "resetAt"`;
    const row = rows[0];
    const count = Number(row?.count ?? 1);
    const resetAt = row?.resetAt instanceof Date ? row.resetAt : new Date(row?.resetAt ?? windowEnd);

    maybePrune();
    // The FIRST refusal of a window is a security event (SECURITY_REPORT 16.2): one row per window
    // and key, so a flood of refused requests is not a flood of writes. Alert quotas (failOpen) are not.
    if (count === limit + 1 && !failOpen) void recordSecurityEvent({ type: "rate_limited", meta: { scope: rateLimitScope(id) } });
    return { ok: count <= limit, remaining: Math.max(0, limit - count), resetAt };
  } catch (error) {
    if (failOpen) {
      console.error(`[rate-limit] check failed for "${id}" — allowing it (failOpen: a harmless counter):`, error);
      return { ok: true, remaining: limit, resetAt: windowEnd, failed: true };
    }
    console.error(`[rate-limit] check failed for "${id}" — REFUSING the request (fail closed):`, error);
    return { ok: false, remaining: 0, resetAt: new Date(now.getTime() + STORE_ERROR_RETRY_SECONDS * 1000), failed: true };
  }
}

/** Throws RateLimitError when the limit is exceeded, or when the store fails (fail closed). */
export async function assertRateLimit(key: string, options: RateLimitOptions): Promise<RateLimitResult> {
  const result = await rateLimit(key, options);
  if (!result.ok) throw new RateLimitError(result.resetAt);
  return result;
}

/**
 * The block an IP address is limited as (SECURITY_REPORT 3.1.c, 3.2.c): an IPv4 address itself, an
 * IPv6 address its /64 (one home or phone network owns a whole /64 and could otherwise rotate
 * through it for fresh limits). Null for anything that is not an IP address. Pure.
 */
export function rateLimitIpBlock(ip: string | null | undefined): string | null {
  const value = ip?.trim().toLowerCase();
  if (!value) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return value;
  if (!value.includes(":")) return null;
  const [head = "", tail = ""] = value.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = value.includes("::") ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  if (groups.length < 4 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return `${groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/**
 * The hashed IP for limits: the same as getIpHash() for IPv4, the /64 for IPv6. Null when the IP
 * cannot be read.
 */
export async function getIpLimitHash(): Promise<string | null> {
  let ip: string | null = null;
  try {
    ip = await getClientIp();
  } catch {
    ip = null;
  }
  if (ip && ip.includes(":")) {
    const block = rateLimitIpBlock(ip);
    if (block) return hmacHash(`ip:${block}`);
  }
  return getIpHash().catch(() => null);
}

/** Rate limit keyed by the visitor's hashed IP (an IPv6 address by its /64): `${prefix}:ip:<hash>`. */
export async function rateLimitByIp(prefix: string, options: RateLimitOptions): Promise<RateLimitResult> {
  const ipHash = await getIpLimitHash();
  return rateLimit(`${prefix}:ip:${ipHash ?? "unknown"}`, options);
}

export async function assertRateLimitByIp(prefix: string, options: RateLimitOptions): Promise<RateLimitResult> {
  const result = await rateLimitByIp(prefix, options);
  if (!result.ok) throw new RateLimitError(result.resetAt);
  return result;
}

/** Clears a key, e.g. after a successful login. */
export async function resetRateLimit(key: string): Promise<void> {
  try {
    await db.rateLimit.deleteMany({ where: { key: normalizeKey(key) } });
  } catch (error) {
    console.error("[rate-limit] reset failed:", error);
  }
}

/** Deletes windows that ended more than a day ago. Safe to call from a cron job. */
export async function pruneRateLimits(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
  const { count } = await db.rateLimit.deleteMany({ where: { resetAt: { lt: cutoff } } });
  return count;
}

let lastPrune = 0;
function maybePrune() {
  const now = Date.now();
  if (now - lastPrune < 6 * 3600 * 1000) return;
  lastPrune = now;
  pruneRateLimits().catch((error) => console.error("[rate-limit] prune failed:", error));
}

/** Standard headers for a 429 response. */
export function rateLimitHeaders(result: RateLimitResult, limit: number): Record<string, string> {
  const retryAfter = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000));
  return {
    "Retry-After": String(retryAfter),
    "RateLimit-Limit": String(limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(retryAfter),
  };
}
