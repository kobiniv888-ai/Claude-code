import type { Locator, Page } from "@playwright/test";
import { expect, settle, test } from "./fixtures";

/** Phones from 360 px and tablets: the guest flow and right-to-left pages without overflow. */

test("search and filter on a phone", async ({ page, consoleErrors }) => {
  await page.goto("/en");
  await settle(page);
  // The home search card shows its fields right away on phones (no sheet).
  const card = page.getByRole("search", { name: "Search homes" });
  await card.getByRole("combobox", { name: "Where" }).fill("Tbilisi");
  await page.getByRole("option", { name: /^Tbilisi/ }).first().click();
  await card.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/search\?.*city=tbilisi/);
  // Demo data since redesign phase 1: 2 short stays in Tbilisi, both Shabbat-friendly.
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("2 homes in Tbilisi");
  await settle(page);

  await page.getByRole("button", { name: /^Filters/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Filters" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("switch", { name: "Shabbat-friendly", exact: true }).click();
  await dialog.getByRole("button", { name: "Show 2 homes" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/shabbatFriendly=/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("2 homes in Tbilisi");
  await expect(page.getByRole("list", { name: "Search results" }).getByRole("article")).toHaveCount(2);
  expect(consoleErrors).toEqual([]);
});

/** A slow phone: 4× CPU throttling (Chromium only), so the gaps between hydration passes are wide. */
async function slowCpu(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  return cdp;
}

/** Resolves on the first animation frame after React has hydrated `locator` (its handlers are attached). */
async function whenHydrated(locator: Locator) {
  await locator.waitFor({ state: "attached", timeout: 120_000 });
  const handle = await locator.elementHandle();
  await locator.page().waitForFunction(
    (element) => !!element && Object.keys(element).some((key) => key.startsWith("__reactProps$")),
    handle,
    { polling: "raf", timeout: 120_000 },
  );
}

test("the Map pill opens the map on a phone, even when tapped the moment it hydrates", async ({ page, consoleErrors }) => {
  // Client-side navigation from a fresh page load, before any lazily hydrated part of the header or
  // footer has loaded (redesign final check: these used to block every navigation on phones). The
  // tap comes as soon as React has hydrated the pill, on a slow phone: before the lazily hydrated
  // islands listen (hardening C1 — this first tap used to be lost and the pill stuck on "List").
  // The page fixture has answered the cookie banner (it would sit over the floating pill).
  const cdp = await slowCpu(page);
  await page.goto("/en/search?city=tbilisi", { waitUntil: "commit" });
  const pill = page.locator("[data-floating-map-toggle]").getByRole("button", { name: /^Map/ });
  await whenHydrated(pill);
  await pill.click();
  // A cold development server compiles the map view and the header tools on this first tap.
  await expect(page).toHaveURL(/view=map/, { timeout: 60_000 });
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  expect(consoleErrors).toEqual([]);
});

test("dragging the phone map with a finger searches the new area (no tap anywhere)", async ({ page }) => {
  // "Search as I move" is on when the address has an area. A finger drag fires no click or key
  // press, which used to leave the search waiting for the header's lazily hydrated tools (C2).
  const area = "41.75000,41.65000,44.90000,44.70000";
  await page.goto(`/en/search?city=tbilisi&view=map&bounds=${area}`);
  const map = page.locator(".leaflet-container");
  await expect(map).toBeVisible();
  await settle(page);
  await page.waitForTimeout(1_000);
  const box = await map.boundingBox();
  if (!box) throw new Error("no map");
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let step = 1; step <= 10; step++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - step * 12, y: y - step * 8 }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => new URL(page.url()).searchParams.get("bounds"), { timeout: 30_000 }).not.toBe(area);
  await expect.poll(() => new URL(page.url()).searchParams.get("bounds"), { timeout: 5_000 }).toBeTruthy();
});

test("an early tap on the listing's share button opens the phone's share sheet", async ({ page }) => {
  // Phones with Web Share: the share island hydrates late; a tap before that is replayed, and the
  // replay must reach the share sheet (C3: it used to open and drop the menu instead).
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: number };
    w.__shared = 0;
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        w.__shared++;
      },
    });
  });
  const cdp = await slowCpu(page);
  await page.goto("/en/listing/91", { waitUntil: "commit" });
  const share = page.locator("[data-share-menu]").getByRole("button", { name: "Share" });
  // Tap once the page itself has hydrated (the gallery's photo buttons), whether or not the share
  // island has: either way the share sheet must open.
  await whenHydrated(page.getByRole("button", { name: /^Open photo 1/ }).first());
  await share.tap();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: number }).__shared), { timeout: 60_000 }).toBe(1);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
});

for (const locale of ["ka", "ru"] as const) {
  test(`the cookie notice leaves the home Search button free at 360×780 (${locale}, first visit)`, async ({ page }) => {
    // Hardening C4: the longest languages. At 360×640 a bottom sheet cannot clear it (accepted).
    // The fixture answers the banner up front: forget that answer for this first visit.
    await page.context().clearCookies({ name: "bayit_consent" });
    await page.goto(`/${locale}`);
    const banner = page.locator("section[aria-describedby].fixed");
    await expect(banner).toBeVisible();
    await settle(page);
    const submit = page.getByRole("search").locator('button[type="submit"]');
    const [bannerBox, buttonBox] = await Promise.all([banner.boundingBox(), submit.boundingBox()]);
    expect(bannerBox && buttonBox && bannerBox.y >= buttonBox.y + buttonBox.height).toBe(true);
    const free = await submit.evaluate((button) => {
      const r = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
    });
    expect(free).toBe(true);
  });
}

for (const path of ["/he/search?city=tbilisi", "/he/listing/91", "/ar/jewish-life", "/he/help", "/ar/post"]) {
  test(`no sideways overflow at 360 px: ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await settle(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test.describe("tablet", () => {
  test.use({ viewport: { width: 768, height: 1024 } });
  for (const path of ["/he", "/en/search?city=tbilisi", "/ar/listing/91"]) {
    test(`no sideways overflow at 768 px: ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await settle(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

test("the listing's sticky-bar … opens its menu at the first tap (the menu code loads on demand)", async ({ page, consoleErrors }) => {
  await page.goto("/en/listing/105");
  await settle(page);
  const bar = page.locator("[data-sticky-bar]");
  // "More options": besides the other ways to contact, the menu holds "Report the host".
  const more = bar.getByRole("button", { name: "More options" });
  await whenHydrated(more);
  // A plain button until the first tap: the Radix dropdown is not part of the page's first load.
  await expect(bar.locator("[data-slot=dropdown-menu-trigger]")).toHaveCount(0);
  await more.tap();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "All ways to contact" })).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test("tapping a listing card shows the listing skeleton until the listing arrives", async ({ page, consoleErrors }) => {
  await page.goto("/en");
  await settle(page);
  // Hold the listing's page data back, so the skeleton is on screen long enough to be seen.
  await page.route(
    (url) => /\/listing\/[^/]+$/.test(url.pathname),
    async (route) => {
      const headers = route.request().headers();
      if (headers["rsc"] && !headers["next-router-prefetch"]) await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    },
  );
  const card = page.locator("a[data-card-link]").first();
  await whenHydrated(card);
  await card.scrollIntoViewIfNeeded();
  await card.click();
  const skeleton = page.locator("main [role=status]", { hasText: "Loading the listing" });
  await expect(skeleton).toBeVisible({ timeout: 2_000 });
  await page.waitForURL(/\/en\/listing\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(skeleton).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});
