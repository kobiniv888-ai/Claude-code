import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isProductionRequest, robotsFor } from "@/lib/seo";

/**
 * /robots.txt (round 3, brief 10). On the real site (every host of the request is SITE_URL's host):
 * the public pages are open, /admin, /account (and trip pages) and the API are closed, and the
 * sitemap is named. The other private pages (post form, login, 2-step login, phone check, saved
 * places, shared lists, unsubscribe) are linked from public pages, so they stay crawlable and say
 * noindex themselves. On any other address (a codespace, localhost, a Vercel preview, or while
 * SITE_URL is unset): everything open, no sitemap, and every response says "noindex, nofollow"
 * (src/proxy.ts), which crawlers can then read. The rules are in @/lib/seo (unit-tested).
 */

// Answers per request: the same build serves the real domain and its previews.
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  return robotsFor(isProductionRequest(await headers()));
}
