import type { Page } from "@playwright/test";
import { expect, settle, test } from "./fixtures";
import { devOtp } from "./helpers/auth";
import { freshPhone, sql, userIdByPhone } from "./helpers/db";

/**
 * Definition of done: a guest can search, filter, sort, use the map, open a listing, and message
 * the owner on WhatsApp with a ready message. Uses the demo listings in Tbilisi (short stays:
 * #89 $85 Shabbat-friendly, #91 $70 kosher + Shabbat-friendly, #113 $48).
 */

const results = (page: Page) => page.getByRole("list", { name: "Search results" }).getByRole("article");
const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const filters = (page: Page) => page.getByRole("complementary", { name: "Filters" });

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
    await expect(heading(page)).toHaveText("3 homes in Tbilisi");
    await expect(results(page)).toHaveCount(3);
    await settle(page);

    // Kosher kitchen → 1 result, with a removable chip.
    await filters(page).getByRole("group", { name: "Kitchen" }).getByRole("button", { name: "Kosher kitchen" }).click();
    await expect(page).toHaveURL(/kitchen=kosher/);
    await expect(heading(page)).toHaveText("1 home in Tbilisi");
    const chips = page.getByRole("heading", { name: "Active filters" }).locator("xpath=following-sibling::ul[1]");
    const kosherChip = chips.getByRole("button", { name: /Kosher kitchen/ });
    await expect(kosherChip).toBeVisible();
    await kosherChip.click();
    await expect(page).not.toHaveURL(/kitchen=/);
    await expect(heading(page)).toHaveText("3 homes in Tbilisi");

    // Shabbat-friendly → 2 results.
    await filters(page).getByRole("checkbox", { name: "Shabbat-friendly" }).check();
    await expect(page).toHaveURL(/shabbatFriendly=/);
    await expect(heading(page)).toHaveText("2 homes in Tbilisi");
    await expect(chips.getByRole("button", { name: /Shabbat-friendly/ })).toBeVisible();

    // Price range $60–$80 → only the $70 flat.
    await filters(page).getByRole("textbox", { name: "Minimum price" }).fill("60");
    await filters(page).getByRole("textbox", { name: "Maximum price" }).fill("80");
    await filters(page).getByRole("textbox", { name: "Maximum price" }).press("Enter");
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
    await expect(heading(page)).toHaveText("3 homes in Tbilisi");

    // Sort: price low → high.
    await page.getByRole("combobox", { name: "Sort by" }).click();
    await page.getByRole("option", { name: "Price: low to high" }).click();
    await expect(page).toHaveURL(/sort=price_asc/);
    await expect(results(page)).toHaveCount(3);
    await expect.poll(() => cardPrices(page)).toEqual([48, 70, 85]);

    // …and high → low.
    await page.getByRole("combobox", { name: "Sort by" }).click();
    await page.getByRole("option", { name: "Price: high to low" }).click();
    await expect(page).toHaveURL(/sort=price_desc/);
    await expect.poll(() => cardPrices(page)).toEqual([85, 70, 48]);
    expect(consoleErrors).toEqual([]);
  });

  test("map view shows the homes as markers", async ({ page, consoleErrors }) => {
    await page.goto("/en/search?city=tbilisi&deal=short-stay");
    await settle(page);
    await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Map" }).click();
    await expect(page).toHaveURL(/view=map/);
    const markers = page.locator(".leaflet-container .leaflet-marker-icon");
    await expect(markers.first()).toBeVisible({ timeout: 45_000 });
    expect(await markers.count()).toBeGreaterThanOrEqual(1);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe("guest contact", () => {
  test("open a listing → Show contact asks to log in → safety tip → WhatsApp with a ready message", async ({ page, context, consoleErrors }) => {
    // Never leave the test machine: answer wa.me ourselves.
    await context.route(/https:\/\/(api\.)?(wa\.me|whatsapp\.com)\//, (route) => route.fulfill({ status: 200, contentType: "text/plain", body: "WhatsApp" }));

    await page.goto("/en/search?city=tbilisi&deal=short-stay");
    const card = results(page).filter({ hasText: "Kosher apartment in a historic house in Sololaki" });
    await card.getByRole("link").first().click();
    await expect(page).toHaveURL(/\/en\/listing\/91-/);
    const title = (await heading(page).innerText()).trim();
    expect(title).toContain("Kosher apartment");
    await settle(page);

    // Signed out: "Show contact" opens the login dialog.
    await page.getByRole("button", { name: "Show contact" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Log in to continue" });
    await expect(dialog).toBeVisible();

    // A brand-new guest signs up in the dialog with a phone code.
    const phone = await freshPhone();
    await dialog.getByRole("textbox", { name: "Phone number" }).fill(phone.replace("+995", ""));
    await dialog.getByRole("button", { name: "Send code" }).click();
    const code = await devOtp(page.context().request, phone);
    await dialog.getByLabel("6-digit code").fill(code);
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    // The contact buttons appear; the first tap shows the safety tip.
    const whatsapp = page.getByRole("button", { name: /Message on WhatsApp/ }).first();
    await expect(whatsapp).toBeVisible();
    await whatsapp.click();
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
