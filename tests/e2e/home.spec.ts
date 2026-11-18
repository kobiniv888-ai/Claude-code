import type { Page } from "@playwright/test";
import { expect, settle, test } from "./fixtures";
import { BASE_URL } from "./helpers/env";

/** Round 3, brief 4: the lighter home page and "Pick up where you left off". */

/** The visitor allowed "preferences" cookies (the fixtures answer "necessary only"). */
async function allowPreferences(page: Page) {
  await page.context().addCookies([
    {
      name: "bayit_consent",
      value: encodeURIComponent(JSON.stringify({ necessary: true, preferences: true, analytics: false, v: 1 })),
      url: BASE_URL,
    },
  ]);
}

const continueBlock = (page: Page) => page.getByRole("region", { name: "Pick up where you left off" });
const recommended = (page: Page) => page.getByRole("region", { name: "Recommended places" });

test("a first visit gets the short home page, in the brief's order", async ({ page, consoleErrors }) => {
  await page.goto("/en");
  await settle(page);
  await expect(continueBlock(page)).toHaveCount(0);
  const sections = await page.locator("[data-home-section]").evaluateAll((els) => els.map((el) => el.getAttribute("data-home-section")));
  expect(sections).toEqual(["categories", "featured", "cities", "howItWorks", "listCta"]);
  // The Jewish life card left the home page (the "Kosher & Shabbat" chip stays).
  await expect(page.locator("main").getByRole("link", { name: /Shabbat times/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Kosher & Shabbat" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("the recommended row follows the selected tab", async ({ page, consoleErrors }) => {
  await page.goto("/en");
  await settle(page);
  const row = recommended(page);
  await expect(row.getByRole("link", { name: "All" })).toHaveAttribute("href", "/en/search?deal=short-stay");
  // Short stays only: a nightly price on every card, never a sale.
  await expect(row.locator("article").filter({ hasText: "For sale" })).toHaveCount(0);
  expect(await row.locator("article").count()).toBeLessThanOrEqual(6);

  await page.getByRole("search", { name: "Search homes" }).getByRole("radio", { name: "Buy" }).click();
  await expect(row.getByRole("link", { name: "All" })).toHaveAttribute("href", "/en/search?deal=buy");
  const sales = row.locator("article:visible");
  await expect(sales.first()).toBeVisible();
  for (const card of await sales.all()) await expect(card).toContainText("For sale");

  await page.getByRole("search", { name: "Search homes" }).getByRole("radio", { name: "Short stay" }).click();
  await expect(row.getByRole("link", { name: "All" })).toHaveAttribute("href", "/en/search?deal=short-stay");
  await expect(row.locator("article:visible").filter({ hasText: "For sale" })).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test("a returning visitor sees the last search and recently viewed places, and can clear them", async ({ page, consoleErrors }) => {
  await allowPreferences(page);
  await page.goto("/en/search?deal=short-stay&city=batumi&checkIn=2099-12-12&checkOut=2099-12-15&guests=2");
  await settle(page);
  await page.goto("/en/search?deal=short-stay&city=batumi");
  await settle(page);
  // A listing view goes to "Recently viewed".
  await page.locator("a[data-card-link]").first().click();
  await page.waitForURL(/\/en\/listing\//);
  await settle(page);

  await page.goto("/en");
  await settle(page);
  const block = continueBlock(page);
  await expect(block).toBeVisible();
  // The last search is the latest one with a place or dates: "Batumi" (the second search).
  const last = block.getByRole("link", { name: /^Your last search: Batumi/ });
  await expect(last).toHaveAttribute("href", /city=batumi/);
  await expect(block.getByRole("heading", { name: "Recently viewed" })).toBeVisible();
  await expect(block.locator("article")).toHaveCount(1);

  await block.getByRole("button", { name: "Clear the “Recently viewed” list" }).click();
  await expect(block.locator("article")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("bayit:recently-viewed"))).toBeNull();
  // Undo brings it back.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(block.locator("article")).toHaveCount(1);
  expect(consoleErrors).toEqual([]);
});

test("with 'necessary only' cookies, nothing is kept on the device", async ({ page, consoleErrors }) => {
  await page.goto("/en/search?city=batumi&checkIn=2099-12-12&checkOut=2099-12-15");
  await settle(page);
  await page.goto("/en/search?city=batumi");
  await settle(page);
  await page.locator("a[data-card-link]").first().click();
  await page.waitForURL(/\/en\/listing\//);
  await settle(page);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).not.toContain("bayit:recently-viewed");
  expect(keys).not.toContain("bayit:last-search");
  await page.goto("/en");
  await settle(page);
  await expect(continueBlock(page)).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});
