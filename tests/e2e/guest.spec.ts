import type { Page } from "@playwright/test";
import { expect, settle, test } from "./fixtures";
import { loginThroughEmailForm } from "./helpers/auth";
import { TEST_EMAIL_DOMAIN, sql } from "./helpers/db";

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
    await expect(heading(page)).toHaveAccessibleName("2 homes in Tbilisi");
    await expect(results(page)).toHaveCount(2);
    await settle(page);

    // The quick "Kosher & Shabbat" chip (round 2): kosher kitchen OR Shabbat-friendly → both stay.
    const kosherShabbat = quickFilters(page).getByRole("button", { name: "Kosher & Shabbat", exact: true });
    await kosherShabbat.click();
    await expect(page).toHaveURL(/kosherShabbat=1/);
    await expect(kosherShabbat).toHaveAttribute("aria-pressed", "true");
    await expect(heading(page)).toHaveAccessibleName("2 homes in Tbilisi");
    await expect(results(page)).toHaveCount(2);
    await kosherShabbat.click();
    await expect(page).not.toHaveURL(/kosherShabbat=/);

    // Kosher kitchen (a switch in the sheet's "Kosher & Shabbat" group) → 1 result, with a removable chip.
    await inFiltersSheet(page, (sheet) => sheet.getByRole("switch", { name: "Kosher kitchen", exact: true }).click(), "Show 1 home");
    await expect(page).toHaveURL(/kitchen=kosher/);
    await expect(heading(page)).toHaveAccessibleName("1 home in Tbilisi");
    const chips = page.getByRole("heading", { name: "Active filters" }).locator("xpath=following-sibling::ul[1]");
    const kosherChip = chips.getByRole("button", { name: /Kosher kitchen/ });
    await expect(kosherChip).toBeVisible();
    await kosherChip.click();
    await expect(page).not.toHaveURL(/kitchen=/);
    await expect(heading(page)).toHaveAccessibleName("2 homes in Tbilisi");

    // Shabbat-friendly → both results stay.
    await inFiltersSheet(page, (sheet) => sheet.getByRole("switch", { name: "Shabbat-friendly", exact: true }).click(), "Show 2 homes");
    await expect(page).toHaveURL(/shabbatFriendly=/);
    await expect(heading(page)).toHaveAccessibleName("2 homes in Tbilisi");
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
    await expect(heading(page)).toHaveAccessibleName("1 home in Tbilisi");
    expect(await cardPrices(page)).toEqual([70]);
    const priceChip = chips.getByRole("button", { name: /\$60/ });
    await expect(priceChip).toBeVisible();

    // Remove the chips again.
    await priceChip.click();
    await expect(page).not.toHaveURL(/priceMin=/);
    await chips.getByRole("button", { name: /Shabbat-friendly/ }).click();
    await expect(heading(page)).toHaveAccessibleName("2 homes in Tbilisi");

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

    const whatsappTaps = async () =>
      Number(
        (
          await sql<{ count: string }>(
            `SELECT count(*)::text AS count FROM "ContactClick" c JOIN "Listing" l ON l.id = c."listingId" WHERE l."publicId" = 91 AND c.channel = 'WHATSAPP'`,
          )
        )[0].count,
      );
    const tapsBefore = await whatsappTaps();

    await page.goto("/en/search?city=tbilisi&deal=short-stay");
    const card = results(page).filter({ hasText: "Kosher apartment in a historic house in Sololaki" });
    await card.getByRole("link").first().click();
    await expect(page).toHaveURL(/\/en\/listing\/91-/);
    const title = (await heading(page).innerText()).trim();
    expect(title).toContain("Kosher apartment");
    await settle(page);

    // Signed out: "Ask the host" (the owner's WhatsApp; round 2 moved it from the bar into the booking
    // box on desktop and the "…" menu on phones) opens the login dialog first.
    const whatsapp = page.getByRole("button", { name: "Ask the host", exact: true }).first();
    await whatsapp.click();
    const dialog = page.getByRole("dialog", { name: "Log in to continue" });
    await expect(dialog).toBeVisible();

    // A brand-new guest signs up in the dialog with an email code, then gives a first name.
    const email = `guest-${Date.now()}@${TEST_EMAIL_DOMAIN}`;
    await loginThroughEmailForm(page, email, dialog, { firstName: "Noa" });
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

    // Listing 91 is a demo listing: host stats never count demo listings (round 3, brief 6.2; the
    // counting on a real listing is in host-stats.spec.ts and src/lib/listing/stats.test.ts). Taps
    // never keep who tapped (founder's answer 8: only the listing, the channel and the time).
    const [{ id: userId }] = await sql<{ id: string }>(`SELECT id FROM "User" WHERE email = $1`, [email]);
    await page.waitForTimeout(1_500);
    expect(await whatsappTaps()).toBe(tapsBefore);
    expect(await sql(`SELECT 1 FROM "ContactClick" WHERE "userId" = $1`, [userId])).toHaveLength(0);
    // The safety tip is shown once: the next tap goes straight to WhatsApp.
    const second = page.waitForEvent("popup");
    await whatsapp.click();
    await (await second).close();
    await expect(tip).toBeHidden();
    await expect.poll(async () => (await sql(`SELECT "safetyTipSeenAt" FROM "User" WHERE id = $1`, [userId]))[0]?.safetyTipSeenAt ?? null).not.toBeNull();
    expect(consoleErrors).toEqual([]);
  });
});
