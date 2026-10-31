import { expect, settle, test } from "./fixtures";

/** Phones from 360 px: the guest flow and right-to-left pages without overflow. */

test("search and filter on a phone", async ({ page, consoleErrors }) => {
  await page.goto("/en");
  await settle(page);
  await page.getByRole("button", { name: /Where to\?/ }).click();
  const sheet = page.getByRole("dialog", { name: "Search" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("combobox", { name: "Where" }).fill("Tbilisi");
  await page.getByRole("option", { name: /^Tbilisi/ }).first().click();
  await sheet.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/search\?.*city=tbilisi/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("3 homes in Tbilisi");
  await settle(page);

  await page.getByRole("button", { name: /^Filters/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Filters" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("checkbox", { name: "Shabbat-friendly" }).check();
  await dialog.getByRole("button", { name: "Show 2 homes" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/shabbatFriendly=/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("2 homes in Tbilisi");
  await expect(page.getByRole("list", { name: "Search results" }).getByRole("article")).toHaveCount(2);
  expect(consoleErrors).toEqual([]);
});

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
