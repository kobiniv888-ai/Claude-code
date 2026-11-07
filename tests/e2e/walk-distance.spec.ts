import { expect, openAs, settle, test } from "./fixtures";

/**
 * Round 3, brief 7.3: the walking time to the sea and to the ski lifts, computed from the static
 * OpenStreetMap data (src/data/osm) for the demo listings in Batumi, Kobuleti, Gudauri and
 * Bakuriani (the seed and scripts/backfill-walk-minutes.ts fill it). Public pages only.
 */

test("Batumi cards show ≈ N min to the sea, and the Near the sea chip keeps only those listings", async ({ browser }) => {
  const { context, page, consoleErrors } = await openAs(browser, null);
  await page.goto("/en/search?city=batumi");
  await settle(page);
  const cards = page.locator("article");
  await expect(cards.first()).toBeVisible();
  await expect(cards.getByText(/^≈ \d+ min walk to the sea$/).first()).toBeVisible();

  await page.getByRole("button", { name: "Near the sea", exact: true }).click();
  await expect(page).toHaveURL(/nearSea=1/);
  await settle(page);
  const total = await cards.count();
  expect(total).toBeGreaterThan(0);
  // Every result is 15 minutes or less from a beach, so every card carries the tag, and it comes
  // first of the card's (at most two) tags in a sea town (brief 7.3).
  for (let i = 0; i < total; i++) {
    await expect(cards.nth(i).getByText(/^≈ \d+ min walk to the sea$/)).toBeVisible();
    await expect(cards.nth(i).getByRole("listitem").first()).toHaveText(/^≈ \d+ min walk to the sea$/);
    expect(await cards.nth(i).getByRole("listitem").count()).toBeLessThanOrEqual(2);
  }

  // Not a sea town: no chip, and an old link with the filter is ignored (same results as without it).
  await page.goto("/en/search?city=tbilisi");
  await settle(page);
  const tbilisi = await page.getByText(/\d+ homes? in Tbilisi/).first().innerText();
  await page.goto("/en/search?city=tbilisi&nearSea=1");
  await settle(page);
  await expect(page.getByRole("button", { name: "Near the sea", exact: true })).toHaveCount(0);
  await expect(page.getByText(/\d+ homes? in Tbilisi/).first()).toHaveText(tbilisi);
  expect(consoleErrors).toEqual([]);
  await context.close();
});

test("Gudauri offers Near the lifts; the listing page highlights the walk with its OpenStreetMap source", async ({ browser }) => {
  const { context, page, consoleErrors } = await openAs(browser, null);
  await page.goto("/en/search?city=gudauri");
  await settle(page);
  await expect(page.getByRole("button", { name: "Near the lifts", exact: true })).toBeVisible();
  await expect(page.locator("article").getByText(/^≈ \d+ min walk to the lifts$/).first()).toBeVisible();

  await page.goto("/en/listing/107");
  await settle(page);
  const highlight = page.locator("[data-walk-highlight=lift]");
  await expect(highlight).toContainText(/≈ (1 minute's|\d+ minutes') walk to the ski lifts/);
  await expect(highlight).toContainText("Estimated from OpenStreetMap");

  await page.goto("/en/listing/104");
  await settle(page);
  await expect(page.locator("[data-walk-highlight=sea]")).toContainText(/≈ (1 minute's|\d+ minutes') walk to the sea/);
  expect(consoleErrors).toEqual([]);
  await context.close();
});

test("the credits page names OpenStreetMap and its licence", async ({ browser }) => {
  const { context, page } = await openAs(browser, null);
  await page.goto("/en/photo-credits");
  const data = page.locator("section", { has: page.getByRole("heading", { name: "Map data" }) });
  await expect(data).toContainText("© OpenStreetMap contributors");
  await expect(data.getByRole("link", { name: "Open Database License (ODbL)" })).toHaveAttribute("href", /opendatacommons\.org\/licenses\/odbl/);
  await expect(data.getByRole("link", { name: "OpenStreetMap copyright" })).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
  await context.close();
});
