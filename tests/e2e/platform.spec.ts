import { expect, openAs, settle, test } from "./fixtures";
import { loginByPhone } from "./helpers/auth";
import { createTestUser } from "./helpers/db";

/**
 * Round 3, phase 1 (platform): logging out (brief 2.9 and 13.5), the currency defaults per language
 * with the visitor's choice winning (2.8), and the phone field's international format (2.5).
 */

test("log out from the account page: home with 'You're logged out', private device data gone; log in again", async ({ browser }) => {
  const user = await createTestUser({ name: "E2E Logout" });
  const { context, page } = await openAs(browser, user.phone);
  await page.goto("/en/account");
  await settle(page);
  await page.evaluate(() => {
    localStorage.setItem("bayit:recently-viewed", "[1001]");
    localStorage.setItem("bayit:compare", "[1002]");
    localStorage.setItem("bayit:phone-country:login", "IL");
    localStorage.setItem("theme", "dark");
  });
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page.waitForURL(/\/en\/?$/);
  await expect(page.getByText("You're logged out")).toBeVisible();
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).toContain("theme");
  expect(keys).not.toContain("bayit:recently-viewed");
  expect(keys).not.toContain("bayit:compare");
  expect(keys).not.toContain("bayit:phone-country:login");
  expect(await (await context.request.get("/api/auth/get-session")).json()).toBeNull();

  // Log in again (brief 13.5).
  await loginByPhone(page, user.phone);
  await page.goto("/en/account");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hello");
  await context.close();
});

test("log out of all devices ends every session of the account", async ({ browser }) => {
  const user = await createTestUser({ name: "E2E Everywhere" });
  const first = await openAs(browser, user.phone);
  const second = await openAs(browser, null);
  await loginByPhone(second.page, user.phone);
  await first.page.goto("/en/account/settings#security");
  await settle(first.page);
  await first.page.getByRole("button", { name: "Log out of all devices" }).click();
  await first.page.getByRole("alertdialog").getByRole("button", { name: "Yes, log out everywhere" }).click();
  await first.page.waitForURL(/\/en\/?$/);
  expect(await (await first.context.request.get("/api/auth/get-session")).json()).toBeNull();
  expect(await (await second.context.request.get("/api/auth/get-session")).json()).toBeNull();
  await first.context.close();
  await second.context.close();
});

test("prices follow the language until the visitor chooses; 'Automatic' goes back", async ({ browser }) => {
  const expected = { he: "ILS", ru: "ILS", ar: "ILS", en: "USD", ka: "GEL" } as const;
  for (const [locale, code] of Object.entries(expected)) {
    const { context, page } = await openAs(browser, null);
    await page.goto(`/${locale}`);
    await expect(page.locator("footer").getByRole("button", { name: new RegExp(code) })).toBeVisible();
    await context.close();
  }
  const { context, page } = await openAs(browser, null);
  await page.goto("/he");
  await settle(page);
  const footerCurrency = page.locator("footer").getByRole("button", { name: /ILS|GEL|USD|EUR/ });
  await footerCurrency.click();
  await page.getByRole("menuitemradio", { name: /GEL/ }).click();
  await expect(footerCurrency).toContainText("GEL");
  await page.goto("/en");
  await expect(page.locator("footer").getByRole("button", { name: /GEL/ })).toBeVisible();
  await page.locator("footer").getByRole("button", { name: /GEL/ }).click();
  await page.getByRole("menuitemradio", { name: /Automatic/ }).click();
  await expect(page.locator("footer").getByRole("button", { name: /USD/ })).toBeVisible();
  await context.close();
});
