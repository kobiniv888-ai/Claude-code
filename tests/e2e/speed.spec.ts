import type { Page } from "@playwright/test";
import { expect, settle, test } from "./fixtures";

/**
 * Round 3, phase 6 (speed): what keeps the public pages' first screen fast, checked in the real
 * browser.
 * 1. The home page holds its first paint until the first recommended card (its photo is the largest
 *    paint on phones) has arrived: <link rel="expect"> to an element that is there.
 * 2. Photos below the first screen do not load with it: the home page's city photos and, on a phone,
 *    the search results' photos from the third card on load after the page.
 * 3. The place suggestions still work (the gazetteer loads at the first tap on "Where").
 * 4. Unknown addresses show the designed 404 inside the site frame (the language-level 404, which
 *    is sent with every page, no longer carries the frame).
 */

const PHONE = { width: 390, height: 844 };

/** The image-optimizer requests of a page load, split by whether they started before the load event. */
async function photoRequests(page: Page, path: string): Promise<{ before: string[]; after: string[] }> {
  const before: string[] = [];
  const after: string[] = [];
  let loaded = false;
  page.on("load", () => (loaded = true));
  page.on("request", (request) => {
    const url = request.url();
    if (!url.includes("/_next/image")) return;
    const source = decodeURIComponent(new URL(url).searchParams.get("url") ?? "");
    (loaded ? after : before).push(source);
  });
  await page.goto(path, { waitUntil: "load" });
  await settle(page);
  return { before, after };
}

test("the home page's first paint waits for the first card, which preloads its photo", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/he");
  // Ours points at the first card. React's experimental build (Next uses it for the taint API,
  // SECURITY_REPORT 5.k) adds its own for the end of the page shell ("#_R_"); no other may exist.
  const expectLinks = page.locator('head link[rel="expect"]');
  const hrefs = await expectLinks.evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(hrefs.filter((href) => href !== "#_R_")).toHaveLength(1);
  const expectLink = page.locator('head link[rel="expect"]:not([href="#_R_"])');
  await expect(expectLink).toHaveAttribute("blocking", "render");
  const target = (await expectLink.getAttribute("href"))!;
  expect(target).toMatch(/^#/);
  // The target exists (otherwise the browser would wait for the whole page), and holds a card.
  await expect(page.locator(target).locator("article")).toHaveCount(1);
  // Its photo is the preloaded, high-priority one.
  await expect(page.locator(target).locator('img[fetchpriority="high"]')).toHaveCount(1);
  await expect(page.locator('head link[rel="preload"][as="image"][fetchpriority="high"]')).toHaveCount(1);
});

test("the home page's city photos load after the page, and appear", async ({ page, consoleErrors }) => {
  await page.setViewportSize(PHONE);
  const { before, after } = await photoRequests(page, "/he");
  expect(before.filter((url) => url.includes("/photos/cities/"))).toEqual([]);
  const cities = page.getByRole("list", { name: "לאן נוסעים?" });
  await cities.scrollIntoViewIfNeeded();
  await expect(cities.locator("img").first()).toBeVisible();
  await expect.poll(() => after.some((url) => url.includes("/photos/cities/"))).toBe(true);
  expect(consoleErrors).toEqual([]);
});

test("on a phone, search results load photos from the third card on after the page", async ({ page, consoleErrors }) => {
  await page.setViewportSize(PHONE);
  const { before } = await photoRequests(page, "/he/search");
  const cards = page.getByRole("list", { name: /./ }).filter({ has: page.locator("[data-public-id]") }).first().locator("[data-public-id]");
  expect(await cards.count()).toBeGreaterThan(3);
  // At most the first two cards' photos started with the page.
  expect(new Set(before).size).toBeLessThanOrEqual(2);
  // A later card shows its photo once it is reached.
  const third = cards.nth(2);
  await third.scrollIntoViewIfNeeded();
  await expect(third.locator("img").first()).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("the place suggestions appear at the first tap on Where", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/en");
  await settle(page);
  const where = page.getByRole("search", { name: "Search homes" }).getByRole("combobox", { name: "Where" });
  // Closed, the list has no options in the page.
  await expect(page.getByRole("option")).toHaveCount(0);
  await where.fill("tbil");
  await expect(page.getByRole("option", { name: /^Tbilisi/ }).first()).toBeVisible();
});

for (const path of ["/en/this-page-does-not-exist", "/en/this/page/does-not-exist"]) {
  test(`unknown addresses show the 404 inside the site frame (${path})`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find this page");
    await expect(page.locator("header").first()).toBeVisible();
    await expect(page.locator("[data-site-footer]")).toHaveCount(1);
  });
}
