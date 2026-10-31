import { expect, test } from "./fixtures";

/**
 * Definition of done: no broken links. Collects the internal links of the main public pages
 * (header, footer, content) in English and Hebrew and checks that each one answers below 400.
 */

const START_PAGES = [
  "/en",
  "/en/search?city=tbilisi",
  "/en/listing/91",
  "/en/jewish-life",
  "/en/help",
  "/en/safety",
  "/en/about",
  "/en/contact",
  "/en/how-it-works",
  "/he",
  "/he/legal/terms",
];

test("internal links on the main pages are not broken", async ({ page, request }) => {
  test.setTimeout(600_000);
  const links = new Map<string, string>();
  for (const start of START_PAGES) {
    await page.goto(start);
    // Listing pages fix a short or old slug with a client-side redirect: let it finish.
    if (/\/listing\/\d+$/.test(start)) await page.waitForURL(/\/listing\/\d+-/);
    await page.waitForLoadState("networkidle");
    const hrefs = await page.locator("a[href]").evaluateAll((anchors) => anchors.map((a) => (a as HTMLAnchorElement).href));
    for (const href of hrefs) {
      const url = new URL(href);
      if (url.origin !== new URL(page.url()).origin) continue;
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      const path = `${url.pathname}${url.search}`;
      if (!links.has(path)) links.set(path, start);
    }
  }
  expect(links.size).toBeGreaterThan(30);

  const broken: string[] = [];
  for (const [path, from] of links) {
    const response = await request.get(path, { maxRedirects: 5, timeout: 90_000 });
    if (response.status() >= 400) broken.push(`${path} → ${response.status()} (linked from ${from})`);
  }
  expect(broken).toEqual([]);
});
