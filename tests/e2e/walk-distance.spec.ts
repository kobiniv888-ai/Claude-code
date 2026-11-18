import { expect, openAs, settle, test } from "./fixtures";

/**
 * Round 3, brief 7.3: the walking time to the sea and to the ski lifts, computed from the static
 * OpenStreetMap data (src/data/osm) for the demo listings in Batumi, Kobuleti, Gudauri and
 * Bakuriani (the seed and scripts/backfill-walk-minutes.ts fill it). Public pages only. Shown
 * rounded up to 5 minutes (security checklist 6.d) and always as "Up to N" (founder's answer (b),
 * 8 Nov 2026): "Up to 5 min", "Up to 10 min"… never "≈ N".
 */

/** "Up to N" with N a multiple of 5 (never "≈"). */
const UP_TO = String.raw`Up to (?:[1-9]\d*[05]|5)`;

test("Batumi cards show up to N min to the sea, and the Near the sea chip keeps only those listings", async ({ browser }) => {
  const { context, page, consoleErrors } = await openAs(browser, null);
  await page.goto("/en/search?city=batumi");
  await settle(page);
  const cards = page.locator("article");
  await expect(cards.first()).toBeVisible();
  await expect(cards.getByText(new RegExp(`^${UP_TO} min walk to the sea$`)).first()).toBeVisible();

  await page.getByRole("button", { name: "Near the sea", exact: true }).click();
  await expect(page).toHaveURL(/nearSea=1/);
  await settle(page);
  const total = await cards.count();
  expect(total).toBeGreaterThan(0);
  // Every result is 15 minutes or less from a beach, so every card carries the tag, and it comes
  // first of the card's (at most two) tags in a sea town (brief 7.3).
  for (let i = 0; i < total; i++) {
    await expect(cards.nth(i).getByText(new RegExp(`^${UP_TO} min walk to the sea$`))).toBeVisible();
    await expect(cards.nth(i).getByRole("listitem").first()).toHaveText(new RegExp(`^${UP_TO} min walk to the sea$`));
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
  await expect(page.locator("article").getByText(new RegExp(`^${UP_TO} min walk to the lifts$`)).first()).toBeVisible();

  await page.goto("/en/listing/107");
  await settle(page);
  const highlight = page.locator("[data-walk-highlight=lift]");
  await expect(highlight).toContainText(new RegExp(`${UP_TO} minutes' walk to the ski lifts`));
  await expect(highlight).toContainText("Estimated from OpenStreetMap");

  await page.goto("/en/listing/104");
  await settle(page);
  await expect(page.locator("[data-walk-highlight=sea]")).toContainText(new RegExp(`${UP_TO} minutes' walk to the sea`));
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

/**
 * Founder's answers (2) and (3), 9 Nov 2026: a listing page shows at most 3 walking times (sea or
 * lifts first, then the synagogue, the stop, the supermarket) and never a Chabad house walk (the
 * community map shows Chabad houses). Checked in the page's text, folded sections included.
 */
test("a listing page shows at most 3 walking times and never a Chabad house walk", async ({ browser }) => {
  const { context, page, consoleErrors } = await openAs(browser, null);
  for (const publicId of [104, 107]) {
    await page.goto(`/en/listing/${publicId}`);
    await settle(page);
    const text = ((await page.locator("main").textContent()) ?? "").replace(/[⁦-⁩‎‏]/g, "");
    const walks = text.match(/up to \d+ min(?:utes'?)? walk/gi) ?? [];
    expect(walks.length, `walking times on #${publicId}: ${walks.join(" | ")}`).toBeLessThanOrEqual(3);
    expect(text).not.toContain("Nearest Chabad house");
    expect(text).not.toMatch(/≈\s*\d+/);
  }
  expect(consoleErrors).toEqual([]);
  await context.close();
});
