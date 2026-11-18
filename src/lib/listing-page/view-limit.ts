import "server-only";
import { rateLimitByIp } from "@/lib/rate-limit";
import { readSiteEnv } from "@/lib/site-env";

/**
 * The listing page's own rate limit against bulk copying (SECURITY_REPORT 14.5.d): per IP, generous
 * for a person (240 listing pages in 10 minutes is one every 2.5 seconds without a pause), low
 * enough that copying the site page by page is slow. The search actions, "show contact" and the
 * other listing actions have their own limits (fail closed).
 *
 * A broken rate-limit store does NOT take the listing pages down: they are public and read-only,
 * so on a store error the page is shown (the one place a limit fails open; everything a visitor
 * can use to cost money or guess something stays fail closed, src/lib/rate-limit.ts).
 */
export const LISTING_VIEW_LIMIT = { limit: 240, windowSeconds: 10 * 60 } as const;
/** A development site (the codespace, the test runs, many browsers on one address) allows more. */
export const DEV_LISTING_VIEW_LIMIT = { limit: 5000, windowSeconds: 10 * 60 } as const;

export function listingViewLimit(env: Partial<Record<string, string | undefined>> = process.env) {
  return readSiteEnv(env) === "development" ? DEV_LISTING_VIEW_LIMIT : LISTING_VIEW_LIMIT;
}

export async function listingViewAllowed(): Promise<boolean> {
  try {
    const result = await rateLimitByIp("listing:view", listingViewLimit());
    return result.ok || result.failed === true;
  } catch {
    return true;
  }
}
