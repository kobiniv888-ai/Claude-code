import { expect, test } from "./fixtures";
import { createTestUser, sql } from "./helpers/db";

/**
 * Round 3, brief 10 ("never let Google index demo listings or non-production addresses"). The
 * test server is NOT the production host (SITE_URL is unset or another address), so:
 *
 * - every response answers with "X-Robots-Tag: noindex, nofollow": pages, robots.txt, sitemap.xml,
 *   optimized images, the API and the share (OG) images
 * - robots.txt lets crawlers in ("Allow: /", so they can read that noindex) and names no sitemap
 * - hreflang comes only from the page's HTML: no HTTP "Link" hreflang header
 * - the sitemap never lists a demo listing; demo listing pages say noindex, nofollow
 * - a city page with fewer than 3 real listings says noindex
 * - structured data: WebSite + Organization on the home page (no SearchAction, no ratings),
 *   no listing or rating markup on a demo listing page
 *
 * The real site's behaviour (SITE_URL = the request's host) is checked in
 * tests/unit/seo-production-db.test.ts and tests/unit/seo-proxy.test.ts.
 */

type Row = { publicId: number };

async function demoListingId(): Promise<number | null> {
  const rows = await sql<Row>(`SELECT "publicId" FROM "Listing" WHERE "isDemo" = true AND status = 'LIVE' AND "deletedAt" IS NULL ORDER BY "publicId" LIMIT 1`);
  return rows[0]?.publicId ?? null;
}

function jsonLdBlocks(html: string): unknown[] {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}

function typesIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(typesIn);
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, inner]) => (key === "@type" ? [String(inner)] : typesIn(inner)));
  }
  return [];
}

test.describe("not the production host", () => {
  test("every response answers with X-Robots-Tag: noindex, nofollow (pages, files, images, the API)", async ({ request }) => {
    test.setTimeout(300_000);
    const demo = await demoListingId();
    const paths = [
      "/",
      "/he",
      "/en",
      "/ru/search",
      "/en/search?deal=hotels",
      "/he/search?deal=short-stay&city=batumi",
      "/he/batumi/short-stays",
      "/ka/batumi",
      "/he/jewish-life",
      "/ar/help",
      "/en/legal/terms",
      "/he/login",
      "/he/saved",
      ...(demo ? [`/he/listing/${demo}`] : []),
      // Not pages (seo-4): robots.txt lets crawlers in, so each of these must say noindex itself.
      "/robots.txt",
      "/sitemap.xml",
      "/manifest.webmanifest",
      "/photos/cities/batumi.webp",
      "/_next/image?url=%2Fphotos%2Fcities%2Fbatumi.webp&w=640&q=75",
      "/api/media/listings/does-not-exist.webp",
    ];
    for (const path of paths) {
      const response = await request.get(path, { maxRedirects: 0, timeout: 120_000 });
      expect(response.headers()["x-robots-tag"], `${path} (${response.status()})`).toBe("noindex, nofollow");
    }
  });

  test("the share (OG) images of a listing and a shared list answer as images with X-Robots-Tag (seo-11)", async ({ page, request }) => {
    test.setTimeout(180_000);
    const demo = await demoListingId();
    test.skip(!demo, "no live demo listing");
    const probe = await request.get(`/en/listing/${demo}`, { timeout: 120_000 });
    test.skip(probe.status() === 404, "the demo data is hidden (its pages are not found)");
    const targets = [`/en/listing/${demo}`];
    // A shared list of a test user (the gate's clean-up removes test users and their lists).
    const user = await createTestUser({ name: "E2E SEO Share" });
    const stamp = Date.now().toString(36);
    const token = `e2eseo${stamp}`.padEnd(43, "x");
    await sql(
      `INSERT INTO "SavedList" (id, "userId", name, "isDefault", "shareToken", "sharedAt", "createdAt", "updatedAt") VALUES ($1, $2, $3, false, $4, now(), now(), now())`,
      [`e2e-seo-list-${stamp}`, user.id, `E2E SEO ${stamp}`, token],
    );
    targets.push(`/en/lists/${token}`);
    for (const target of targets) {
      await page.goto(target);
      const og = await page.locator('meta[property="og:image"]').first().getAttribute("content");
      expect(og, target).toBeTruthy();
      // The address may be SITE_URL's rather than the test server's: request its path here.
      const url = new URL(og!);
      const response = await request.get(url.pathname + url.search, { timeout: 120_000 });
      expect(response.status(), `${target} → ${url.pathname}`).toBe(200);
      expect(response.headers()["content-type"], target).toMatch(/^image\//);
      expect(response.headers()["x-robots-tag"], target).toMatch(/noindex/);
    }
  });

  test("robots.txt lets crawlers in (to read the noindex) and names no sitemap", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).toMatch(/User-Agent: \*\s*\nAllow: \/\s*$/im);
    expect(text).not.toMatch(/^Disallow:/im);
    expect(text).not.toMatch(/^Sitemap:/im);
  });

  test("hreflang comes only from the HTML: no Link hreflang header (seo-2)", async ({ request }) => {
    test.setTimeout(180_000);
    const demo = await demoListingId();
    for (const path of ["/he", "/he/search?deal=hotels", "/he/batumi/short-stays", ...(demo ? [`/he/listing/${demo}`] : [])]) {
      const response = await request.get(path, { timeout: 120_000 });
      expect(response.headers()["link"] ?? "", path).not.toMatch(/hreflang/i);
    }
  });
});

test.describe("demo listings and thin pages", () => {
  test("the sitemap never lists a demo listing", async ({ request }) => {
    const response = await request.get("/sitemap.xml", { timeout: 120_000 });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("xml");
    const xml = await response.text();
    // Well-formed: every "&" in a URL is written "&amp;" (seo-1).
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    expect(locs.length).toBeGreaterThan(50);
    expect(locs.length).toBeLessThanOrEqual(50_000);
    expect(locs.some((loc) => loc.endsWith("/he/jewish-life"))).toBe(true);
    const demoIds = (await sql<Row>(`SELECT "publicId" FROM "Listing" WHERE "isDemo" = true`)).map((row) => row.publicId);
    for (const id of demoIds) {
      expect(locs.some((loc) => new RegExp(`/listing/${id}(-|$)`).test(loc)), `demo listing ${id} in the sitemap`).toBe(false);
    }
  });

  test("a demo listing page says noindex, nofollow and has no listing or rating markup", async ({ page, request }) => {
    const demo = await demoListingId();
    test.skip(!demo, "no live demo listing");
    const probe = await request.get(`/en/listing/${demo}`, { timeout: 120_000 });
    test.skip(probe.status() === 404, "the demo data is hidden (its pages are not found)");
    await page.goto(`/en/listing/${demo}`);
    await page.waitForURL(/\/listing\/\d+-/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex,\s*nofollow/);
    const types = typesIn(jsonLdBlocks(await page.content()));
    for (const banned of ["Apartment", "House", "Hotel", "Offer", "Product", "Review", "AggregateRating", "BreadcrumbList"]) {
      expect(types, banned).not.toContain(banned);
    }
  });

  test("a city page with fewer than 3 real listings says noindex", async ({ page, request }) => {
    const real = await sql<{ n: number }>(
      `SELECT count(*)::int AS n FROM "Listing" l JOIN "City" c ON c.id = l."cityId" WHERE c.slug = 'batumi' AND l."dealType" = 'SHORT_STAY' AND l.status = 'LIVE' AND l."isDemo" = false AND l."deletedAt" IS NULL`,
    );
    test.skip((real[0]?.n ?? 0) >= 3, "Batumi has 3 or more real short stays here");
    const probe = await request.get("/he/batumi/short-stays", { timeout: 120_000 });
    test.skip(probe.status() === 404, "the city pages are not built yet");
    await page.goto("/he/batumi/short-stays");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});

test.describe("canonical, hreflang and structured data", () => {
  test("a content page has an absolute self canonical and hreflang for the five languages and x-default", async ({ page }) => {
    await page.goto("/he/jewish-life");
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).toMatch(/^https?:\/\/[^/]+\/he\/jewish-life$/);
    const hreflangs = await page.locator('link[rel="alternate"][hreflang]').evaluateAll((links) =>
      links.map((link) => [link.getAttribute("hreflang"), link.getAttribute("href")]),
    );
    expect(hreflangs.map(([lang]) => lang).sort()).toEqual(["ar", "en", "he", "ka", "ru", "x-default"]);
    expect(Object.fromEntries(hreflangs)["x-default"]).toMatch(/\/en\/jewish-life$/);
  });

  test("a filtered search is noindex and canonical to its landing", async ({ page }) => {
    await page.goto("/en/search?deal=monthly&city=tbilisi&bedrooms=2&sort=newest");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/en\/search\?deal=monthly&city=tbilisi$/);
  });

  test("the home page has WebSite and Organization data only", async ({ request }) => {
    const html = await (await request.get("/he", { timeout: 120_000 })).text();
    const blocks = jsonLdBlocks(html);
    expect(typesIn(blocks).sort()).toEqual(["Organization", "WebSite"]);
    const json = JSON.stringify(blocks);
    for (const banned of ["SearchAction", "AggregateRating", "Review", "telephone"]) expect(json).not.toContain(banned);
  });
});
