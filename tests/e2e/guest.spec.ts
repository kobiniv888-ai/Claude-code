import type { Page } from "@playwright/test";
import { expect, settle, test } from "./fixtures";
import { loginThroughForm } from "./helpers/auth";
import { freshPhone, sql, userIdByPhone } from "./helpers/db";

/**
 * Definition of done: a guest can search, filter, sort, use the map, open a listing, and message
 * the owner on WhatsApp with a ready message. Uses the demo listings in Tbilisi (short stays:
 * #89 $85 Shabbat-friendly, #91 $70 kosher + Shabbat-friendly; phase 1 of the redesign trimmed the
 * demo data to 20 listings, which removed the third one).
 */

const results = (page: Page) => page.getByRole("list", { name: "Search results" }).getByRole("article");
const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const quickFilters = (page: Page) => page.getByRole("group", { name: "Quick filters" });

/** Opens the filters sheet, runs `change` in it and applies it with its "Show N homes" button. */
async function inFiltersSheet(page: Page, change: (sheet: ReturnType<Page["getByRole"]>) => Promise<void>, apply: string) {
  await quickFilters(page).getByRole("button", { name: /^Filters/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await expect(sheet).toBeVisible();
  await change(sheet);
  await sheet.getByRole("button", { name: apply }).click();
  await expect(sheet).toBeHidden();
}

/** Prices shown on the result cards, in order ("$85 / night" → 85). */
async function cardPrices(page: Page): Promise<number[]> {
  const texts = await results(page).allInnerTexts();
  return texts.map((text) => {
    const match = text.replace(/[⁦-⁩]/g, "").match(/\$([\d,]+)/);
    return match ? Number(match[1].replace(/,/g, "")) : NaN;
  });
}

test.describe("guest search", () => {
  test("home search bar → Tbilisi results → filters, chips and sort", async ({ page, consoleErrors }) => {
    await page.goto("/en");
    await settle(page);
    const where = page.getByRole("search", { name: "Search homes" }).getByRole("combobox", { name: "Where" });
    await where.click();
    await where.fill("Tbilisi");
    await page.getByRole("option", { name: /^Tbilisi/ }).first().click();
    await page.getByRole("search", { name: "Search homes" }).getByRole("button", { name: "Search", exact: true }).click();

    await expect(page).toHaveURL(/\/en\/search\?/);
    const url = new URL(page.url());
    expect(url.searchParams.get("city")).toBe("tbilisi");
    expect(url.searchParams.get("deal")).toBe("short-stay");
    await expect(heading(page)).toHaveText("2 homes in Tbilisi");
    await expect(results(page)).toHaveCount(2);
    await settle(page);

    // Kosher kitchen → 1 result, with a removable chip.
    await quickFilters(page).getByRole("button", { name: "Kosher", exact: true }).click();
    await expect(page).toHaveURL(/kitchen=kosher/);
    await expect(heading(page)).toHaveText("1 home in Tbilisi");
    const chips = page.getByRole("heading", { name: "Active filters" }).locator("xpath=following-sibling::ul[1]");
    const kosherChip = chips.getByRole("button", { name: /Kosher kitchen/ });
    await expect(kosherChip).toBeVisible();
    await kosherChip.click();
    await expect(page).not.toHaveURL(/kitchen=/);
    await expect(heading(page)).toHaveText("2 homes in Tbilisi");

    // Shabbat-friendly → both results stay.
    await inFiltersSheet(page, (sheet) => sheet.getByRole("button", { name: "Shabbat-friendly", exact: true }).click(), "Show 2 homes");
    await expect(page).toHaveURL(/shabbatFriendly=/);
    await expect(heading(page)).toHaveText("2 homes in Tbilisi");
    await expect(chips.getByRole("button", { name: /Shabbat-friendly/ })).toBeVisible();

    // Price range $60–$80 → only the $70 flat.
    await inFiltersSheet(
      page,
      async (sheet) => {
        await sheet.getByRole("textbox", { name: "Minimum price" }).fill("60");
        await sheet.getByRole("textbox", { name: "Maximum price" }).fill("80");
        await sheet.getByRole("textbox", { name: "Maximum price" }).press("Enter");
      },
      "Show 1 home",
    );
    await expect(page).toHaveURL(/priceMin=60/);
    await expect(page).toHaveURL(/priceMax=80/);
    await expect(heading(page)).toHaveText("1 home in Tbilisi");
    expect(await cardPrices(page)).toEqual([70]);
    const priceChip = chips.getByRole("button", { name: /\$60/ });
    await expect(priceChip).toBeVisible();

    // Remove the chips again.
    await priceChip.click();
    await expect(page).not.toHaveURL(/priceMin=/);
    await chips.getByRole("button", { name: /Shabbat-friendly/ }).click();
    await expect(heading(page)).toHaveText("2 homes in Tbilisi");

    // Sort: price low → high.
    await page.getByRole("button", { name: /^Sort: / }).first().click();
    await page.getByRole("dialog", { name: "Sort by" }).getByRole("radio", { name: "Price: low to high" }).click();
    await expect(page).toHaveURL(/sort=price_asc/);
    await expect(results(page)).toHaveCount(2);
    await expect.poll(() => cardPrices(page)).toEqual([70, 85]);

    // …and high → low.
    await page.getByRole("button", { name: /^Sort: / }).first().click();
    await page.getByRole("dialog", { name: "Sort by" }).getByRole("radio", { name: "Price: high to low" }).click();
    await expect(page).toHaveURL(/sort=price_desc/);
    await expect.poll(() => cardPrices(page)).toEqual([85, 70]);
    expect(consoleErrors).toEqual([]);
  });

  test("the map next to the results shows the homes as markers", async ({ page, consoleErrors }) => {
    await page.goto("/en/search?city=tbilisi&deal=short-stay");
    await settle(page);
    const markers = page.locator(".leaflet-container .leaflet-marker-icon");
    await expect(markers.first()).toBeVisible({ timeout: 45_000 });
    expect(await markers.count()).toBeGreaterThanOrEqual(1);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe("guest contact", () => {
  test("open a listing → WhatsApp asks to log in → safety tip → WhatsApp with a ready message", async ({ page, context, consoleErrors }) => {
    // Never leave the test machine: answer wa.me ourselves.
    await context.route(/https:\/\/(api\.)?(wa\.me|whatsapp\.com)\//, (route) => route.fulfill({ status: 200, contentType: "text/plain", body: "WhatsApp" }));

    await page.goto("/en/search?city=tbilisi&deal=short-stay");
    const card = results(page).filter({ hasText: "Kosher apartment in a historic house in Sololaki" });
    await card.getByRole("link").first().click();
    await expect(page).toHaveURL(/\/en\/listing\/91-/);
    const title = (await heading(page).innerText()).trim();
    expect(title).toContain("Kosher apartment");
    await settle(page);

    // Signed out: the WhatsApp button (redesign phase 3) opens the login dialog first.
    const whatsapp = page.getByRole("button", { name: /Message on WhatsApp/ }).first();
    await whatsapp.click();
    const dialog = page.getByRole("dialog", { name: "Log in to continue" });
    await expect(dialog).toBeVisible();

    // A brand-new guest signs up in the dialog with a phone code.
    const phone = await freshPhone();
    // The dialog starts on +972 for English (redesign phase 1); the helper switches to +995.
    await loginThroughForm(page, phone, dialog);
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    // After logging in the tap goes on by itself; the first contact shows the safety tip.
    const tip = page.getByRole("dialog", { name: "Before you contact the owner" });
    await expect(tip).toBeVisible();
    await expect(tip).toContainText("Never pay before");
    await expect(tip).toContainText("payment link");

    const popupPromise = page.waitForEvent("popup");
    await tip.getByRole("button", { name: "I understand" }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded").catch(() => undefined);
    const href = new URL(popup.url());
    expect(href.origin).toBe("https://wa.me");
    expect(href.pathname).toMatch(/^\/\d{8,15}$/);
    const text = href.searchParams.get("text") ?? "";
    expect(text).toContain("(ID 91)");
    const [listing] = await sql<{ title: string }>(`SELECT title FROM "Listing" WHERE "publicId" = 91`);
    expect([title, listing.title].some((t) => text.includes(t)), `message "${text}" names the listing`).toBe(true);
    await popup.close();

    // The tap is recorded for the owner's stats.
    const userId = await userIdByPhone(phone);
    await expect
      .poll(async () => (await sql(`SELECT 1 FROM "ContactClick" c JOIN "Listing" l ON l.id = c."listingId" WHERE c."userId" = $1 AND l."publicId" = 91 AND c.channel = 'WHATSAPP'`, [userId])).length)
      .toBe(1);
    // The safety tip is shown once: the next tap goes straight to WhatsApp.
    const second = page.waitForEvent("popup");
    await whatsapp.click();
    await (await second).close();
    await expect(tip).toBeHidden();
    await expect.poll(async () => (await sql(`SELECT "safetyTipSeenAt" FROM "User" WHERE id = $1`, [userId]))[0]?.safetyTipSeenAt ?? null).not.toBeNull();
    expect(consoleErrors).toEqual([]);
  });
});
