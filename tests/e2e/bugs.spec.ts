import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, openAs, settle, test } from "./fixtures";
import { acceptCookies, loginThroughForm } from "./helpers/auth";
import { freshPhone } from "./helpers/db";

/**
 * Round-2 bugs (brief section 8): the post-form map (8.1), rotating the phone (8.4), the
 * currency (8.5) and phone prefix (8.6) defaults, and the address search (8.9).
 */

const LOCALES = ["he", "en", "ru", "ar", "ka"] as const;
type Locale = (typeof LOCALES)[number];

/** A message from messages/<locale>/<namespace>.json, with {placeholders} filled in. */
function message(locale: Locale, namespace: string, key: string, values: Record<string, string> = {}): string {
  const file = path.join(process.cwd(), "messages", locale, `${namespace}.json`);
  const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], JSON.parse(fs.readFileSync(file, "utf8")));
  return Object.entries(values).reduce((text, [name, v]) => text.replace(`{${name}}`, v), String(value));
}

test.describe("currency defaults by language (8.5)", () => {
  const expected: Record<Locale, string> = { he: "ILS", ru: "ILS", ar: "ILS", en: "USD", ka: "GEL" };

  test("he/ru/ar show ₪, en shows $, ka shows ₾ until the visitor picks one, and the pick is kept", async ({ browser }) => {
    // A browser set to English (US) and no country hint: only the page language decides.
    for (const locale of LOCALES) {
      const { context, page } = await openAs(browser, null);
      await page.goto(`/${locale}/search`);
      await settle(page);
      await expect(page.locator(`button[aria-label*="${expected[locale]}"]`).first()).toBeVisible();
      await context.close();
    }

    // The visitor's own choice wins over the language default and is remembered.
    const { context, page } = await openAs(browser, null);
    await page.goto("/ka/search");
    await settle(page);
    await page.locator('button[aria-label*="GEL"]').first().click();
    await page.getByRole("menuitemradio", { name: /USD/ }).or(page.getByRole("menuitem", { name: /USD/ })).first().click();
    await expect(page.locator('button[aria-label*="USD"]').first()).toBeVisible();
    await page.reload();
    await settle(page);
    await expect(page.locator('button[aria-label*="USD"]').first()).toBeVisible();
    await page.goto("/he/search");
    await settle(page);
    await expect(page.locator('button[aria-label*="USD"]').first()).toBeVisible();
    await context.close();
  });
});

test.describe("phone prefix defaults (8.6)", () => {
  async function openPhoneForm(page: Page, locale: Locale) {
    await page.goto(`/${locale}/login`);
    await settle(page);
    await page.getByRole("button", { name: message(locale, "auth", "login.usePhone") }).click();
  }
  const countryButton = (page: Page, locale: Locale, code: string) =>
    page.getByRole("button", { name: message(locale, "auth", "country.selected", { code }) });

  test("+972 for he/en/ru/ar and +995 for ka, whatever the browser's language", async ({ browser }) => {
    for (const locale of LOCALES) {
      const { context, page } = await openAs(browser, null);
      await openPhoneForm(page, locale);
      await expect(countryButton(page, locale, locale === "ka" ? "+995" : "+972")).toBeVisible();
      await context.close();
    }
  });

  test("the searchable picker remembers the last choice", async ({ browser }) => {
    const { context, page } = await openAs(browser, null);
    await openPhoneForm(page, "en");
    await countryButton(page, "en", "+972").click();
    await page.getByPlaceholder("Search country or code").fill("995");
    await page.getByRole("option", { name: /\+995/ }).click();
    await expect(countryButton(page, "en", "+995")).toBeVisible();
    await openPhoneForm(page, "en");
    await expect(countryButton(page, "en", "+995")).toBeVisible();
    await context.close();
  });
});

test.describe("rotating the phone (8.4)", () => {
  async function layout(page: Page) {
    return page.evaluate(() => {
      const root = document.documentElement;
      const header = document.querySelector("header");
      return {
        overflow: root.scrollWidth - root.clientWidth,
        header: header ? Math.round(header.getBoundingClientRect().width) : 0,
        body: Math.round(document.body.getBoundingClientRect().width),
        width: root.clientWidth,
      };
    });
  }

  for (const url of ["/he", "/he/search", "/en/listing/104"]) {
    test(`portrait → landscape → portrait keeps the phone layout: ${url}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await acceptCookies(page);
      await page.goto(url);
      await settle(page);
      const fresh = await layout(page);
      expect(fresh.overflow).toBeLessThanOrEqual(0);

      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(400);
      const landscape = await layout(page);
      expect(landscape.overflow).toBeLessThanOrEqual(0);
      expect(landscape.header).toBe(landscape.width);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(400);
      const back = await layout(page);
      expect(back).toEqual(fresh);
    });
  }
});

test.describe("post form: the map and the address search (8.1, 8.9)", () => {
  test("the map opens on Georgia with no pin; the address search asks our server once per Search", async ({ page }) => {
    const geocodeRequests: string[] = [];
    const osmRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/geocode")) geocodeRequests.push(request.url());
      if (request.url().includes("nominatim")) osmRequests.push(request.url());
    });
    // The server route is unit-tested (cache, 1 request per second); here it answers from a stub.
    await page.route("**/api/geocode**", (route) =>
      route.fulfill({
        json: {
          results: [{ id: "1", label: "Shota Rustaveli Avenue 12, Tbilisi, Georgia", lat: 41.6995, lng: 44.7965 }],
          attribution: "© OpenStreetMap contributors (ODbL)",
        },
      }),
    );

    await acceptCookies(page);
    await page.goto("/en/login");
    await settle(page);
    await loginThroughForm(page, await freshPhone(), page, { firstName: "Dana" });
    await expect(page).toHaveURL(/\/en\/account$/, { timeout: 90_000 });
    await page.goto("/en/post");
    await page.getByRole("button", { name: "Start a new listing" }).first().click();
    await expect(page).toHaveURL(/\/en\/post\/[^/?]+\?step=1/);
    await settle(page);
    const choose = (name: RegExp) => page.getByRole("radio", { name }).locator("xpath=ancestor::label[1]").click();
    await choose(/^Short stay/);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await choose(/^Apartment/);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Where is it?" })).toBeVisible();

    // 8.1: no pin until the person taps the map or picks a result, and the map shows Georgia.
    const map = page.getByRole("region", { name: "Map for choosing the exact location" });
    await expect(map).toBeVisible();
    await settle(page);
    await expect(page.getByText("Pin set at")).toBeHidden();
    const box = await map.boundingBox();
    await map.click({ position: { x: (box?.width ?? 300) / 2, y: (box?.height ?? 300) / 2 } });
    const pinText = await page.getByText(/Pin set at/).innerText();
    const [lat, lng] = (pinText.match(/-?\d+\.\d+/g) ?? []).map(Number);
    expect(lat).toBeGreaterThan(41);
    expect(lat).toBeLessThan(43.6);
    expect(lng).toBeGreaterThan(40);
    expect(lng).toBeLessThan(46.8);

    // 8.9: typing never searches; Enter or "Search" asks our own server once.
    const field = page.getByLabel("Search the address");
    await field.pressSequentially("Rustaveli Avenue 12", { delay: 30 });
    await page.waitForTimeout(1500);
    expect(geocodeRequests).toHaveLength(0);
    await field.press("Enter");
    const results = page.getByRole("list", { name: "Address suggestions" });
    await expect(results.getByRole("button", { name: /Shota Rustaveli Avenue 12/ })).toBeVisible();
    expect(geocodeRequests).toHaveLength(1);
    // The same words again: the last answer is shown, nothing is asked.
    await page.getByRole("button", { name: "Search", exact: true }).click();
    expect(geocodeRequests).toHaveLength(1);
    await results.getByRole("button", { name: /Shota Rustaveli Avenue 12/ }).click();
    await expect(page.getByText(/Pin set at 41\.6995/)).toBeVisible();
    // The OpenStreetMap credit stays, and the browser never calls OpenStreetMap itself.
    await expect(page.getByText(/OpenStreetMap/).first()).toBeVisible();
    expect(osmRequests).toHaveLength(0);
  });
});
