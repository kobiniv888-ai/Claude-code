import "server-only";
import { db } from "@/lib/db";
import { RateLimitError } from "@/lib/errors";
import { getIpHash } from "@/lib/request";

/**
 * Fixed-window rate limiting stored in Postgres (table RateLimit), so it works the same
 * on one server or many serverless instances.
 *
 *   await assertRateLimit(`listing:create:${user.id}`, { limit: 10, windowSeconds: 3600 });
 *   const r = await rateLimitByIp("places", { limit: 60, windowSeconds: 60 });
 *
 * One atomic INSERT … ON CONFLICT per call: the first hit opens a window, later hits
 * increment it, and a hit after `resetAt` starts a new window.
 * If the database is unreachable the check fails open (logged) — every other database
 * write would fail in that case anyway.
 */

export type RateLimitOptions = { limit: number; windowSeconds: number };
export type RateLimitResult = { ok: boolean; remaining: number; resetAt: Date };

const MAX_KEY_LENGTH = 200;

function normalizeKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) throw new Error("rateLimit: key is required");
  return trimmed.length > MAX_KEY_LENGTH ? trimmed.slice(0, MAX_KEY_LENGTH) : trimmed;
}

export async function rateLimit(key: string, { limit, windowSeconds }: RateLimitOptions): Promise<RateLimitResult> {
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
    return { ok: count <= limit, remaining: Math.max(0, limit - count), resetAt };
  } catch (error) {
    console.error(`[rate-limit] check failed for "${id}" — allowing the request:`, error);
    return { ok: true, remaining: limit, resetAt: windowEnd };
  }
}

/** Throws RateLimitError when the limit is exceeded. */
export async function assertRateLimit(key: string, options: RateLimitOptions): Promise<RateLimitResult> {
  const result = await rateLimit(key, options);
  if (!result.ok) throw new RateLimitError(result.resetAt);
  return result;
}

/** Rate limit keyed by the visitor's hashed IP: `${prefix}:ip:<hash>`. */
export async function rateLimitByIp(prefix: string, options: RateLimitOptions): Promise<RateLimitResult> {
  const ipHash = await getIpHash().catch(() => null);
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
