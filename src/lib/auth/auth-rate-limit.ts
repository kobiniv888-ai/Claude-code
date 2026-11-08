import "server-only";
import type { BetterAuthOptions } from "better-auth";
import { hmacHash } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Better Auth's own rate limiter, stored in OUR Postgres table (SECURITY_REPORT 12.5.b) instead of
 * each server instance's memory: its limits (sign-in, social sign-in, session lists, callbacks…)
 * then hold across every instance, and it FAILS CLOSED like the rest (src/lib/rate-limit.ts: a
 * broken store refuses). The library's key holds the client IP, so only its keyed hash is stored.
 * Our own limits on login codes stay in front of it (./login-rate-limit.ts).
 */
type RateLimitStorage = NonNullable<NonNullable<BetterAuthOptions["rateLimit"]>["customStorage"]>;

export const betterAuthRateLimitStorage: RateLimitStorage = {
  async consume(key, rule) {
    const result = await rateLimit(`ba:${hmacHash(`better-auth-limit:${key}`)}`, {
      limit: Math.max(1, Math.floor(rule.max)),
      windowSeconds: Math.max(1, Math.ceil(rule.window)),
    });
    if (result.ok) return { allowed: true, retryAfter: null };
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)) };
  },
};

/**
 * The headers Better Auth reads the client IP from (its limiter keys and session IPs), the same
 * ones as src/lib/request.ts getClientIp: CLIENT_IP_HEADER when set (behind Cloudflare or another
 * proxy), Vercel's own headers on Vercel, else X-Forwarded-For.
 */
export function authIpAddressHeaders(env: Partial<Record<string, string | undefined>> = process.env): string[] {
  const trusted = env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (trusted) return [trusted];
  if (env.VERCEL) return ["x-vercel-forwarded-for", "x-forwarded-for"];
  return ["x-forwarded-for"];
}
