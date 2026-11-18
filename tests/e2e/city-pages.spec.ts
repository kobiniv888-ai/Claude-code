import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { createTestListing, createTestUser, sql } from "./helpers/db";

/**
 * City pages (round 3, brief 10): "/he/batumi/short-stays" = "דירות לטווח קצר בבטומי".
 *
 * 1. With the demo data, a page renders its title, the cards (with their demo label), the booking
 *    steps and the links (other types, the city's Shabbat times), its breadcrumb structured data,
 *    and loads the map only when it comes near the screen. Demo listings never count as real, so
 *    the page is noindex.
 * 2. A page without any listing shows "No places here yet · Post yours".
 * 3. An unknown city or type answers 404; the static pages next to [city] keep working.
 * 4. With TEST-ONLY real listings (3, created here in Kutaisi, where the demo data has no sale)
 *    the page and its city overview become indexable; with 2 they are noindex again. Everything
 *    the test creates is removed at the end.
 */

async function robots(page: Page): Promise<string> {
  return (await page.locator('meta[name="robots"]').getAttribute("content")) ?? "";
}

async function breadcrumbs(page: Page): Promise<{ name: string; item: string }[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const list = blocks.map((text) => JSON.parse(text) as Record<string, unknown>).find((data) => data["@type"] === "BreadcrumbList");
  return ((list?.itemListElement as { name: string; item: string }[] | undefined) ?? []).map(({ name, item }) => ({ name, item }));
}

test.describe("city pages", () => {
  const created = { users: [] as string[] };

  test.afterAll(async () => {
    for (const id of created.users) {
      await sql(`DELETE FROM "Session" WHERE "userId" = $1`, [id]);
      // Their listings (and photos) go with them (onDelete: Cascade).
      await sql(`DELETE FROM "User" WHERE id = $1`, [id]);
    }
  });

  test("a page with demo listings shows them, explains booking and links on, but is not indexed", async ({ page, consoleErrors }) => {
    const response = await page.goto("/he/batumi/short-stays");
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("דירות לטווח קצר בבטומי");
    await expect(page).toHaveTitle(/^דירות לטווח קצר בבטומי/);

    // The search's cards, with the demo label (demo data is shown, but never counts as real).
    const cards = page.locator("[data-listing-card]");
    await expect(cards.first()).toBeVisible();
    await expect(cards.first().getByText("דמו", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "לכל התוצאות והמסננים" })).toHaveAttribute("href", "/he/search?deal=short-stay&city=batumi");
    // Fewer than 3 real places: the cards stay, and a "פרסמו את שלכם" band follows them (no empty title).
    const invite = page.locator("[data-city-post]");
    await expect(invite.getByRole("link", { name: "פרסמו את שלכם" })).toHaveAttribute("href", "/he/post");
    await expect(page.locator("[data-city-empty]")).toHaveCount(0);

    // The four types of the city, this one marked as the current page.
    const types = page.getByRole("navigation", { name: "סוגי מקומות בבטומי" });
    await expect(types.getByRole("link")).toHaveCount(4);
    await expect(types.getByRole("link", { name: /דירות לטווח קצר/ })).toHaveAttribute("aria-current", "page");
    await expect(types.getByRole("link", { name: /השכרה חודשית/ })).toHaveAttribute("href", "/he/batumi/monthly");
    await expect(types.getByRole("link", { name: /נכסים למכירה/ })).toHaveAttribute("href", "/he/batumi/sale");
    await expect(types.getByRole("link", { name: /מלונות ובתי הארחה/ })).toHaveAttribute("href", "/he/batumi/hotels");

    // The area in a few paragraphs, how booking works, Shabbat times and the other types.
    await expect(page.getByRole("heading", { level: 2, name: "בטומי בקצרה" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "איך מזמינים" })).toBeVisible();
    await expect(page.getByText("משלמים בהגעה", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "להסבר המלא" })).toHaveAttribute("href", "/he/how-it-works");
    await expect(page.getByRole("link", { name: "זמני שבת ולוח השנה העברי בבטומי" })).toHaveAttribute(
      "href",
      "/he/jewish-life?city=batumi#shabbat-times",
    );
    const more = page.getByRole("region", { name: "עוד בבטומי" });
    await expect(more.getByRole("link", { name: /השכרה חודשית/ })).toHaveAttribute("href", "/he/batumi/monthly");
    await expect(more.getByRole("link", { name: "כל המקומות בבטומי" })).toHaveAttribute("href", "/he/batumi");

    // Breadcrumbs, on the page and as structured data.
    const trail = page.getByRole("navigation", { name: "נתיב ניווט" });
    await expect(trail.getByRole("link", { name: "בטומי" })).toHaveAttribute("href", "/he/batumi");
    const items = await breadcrumbs(page);
    expect(items.map((item) => item.name)).toEqual(["דף הבית", "בטומי", "דירות לטווח קצר"]);
    expect(items[2].item).toMatch(/\/he\/batumi\/short-stays$/);

    // Canonical and hreflang, and noindex: demo listings never count as real ones.
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/he\/batumi\/short-stays$/);
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", /\/en\/batumi\/short-stays$/);
    expect(await robots(page)).toContain("noindex");

    // The map loads only when it comes near the screen.
    await expect(page.locator(".leaflet-container")).toHaveCount(0);
    await page.getByRole("heading", { level: 2, name: "על המפה" }).scrollIntoViewIfNeeded();
    await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 60_000 });

    expect(consoleErrors).toEqual([]);
  });

  test("the city overview lists the four types with their counts", async ({ page, consoleErrors }) => {
    const response = await page.goto("/en/batumi");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Batumi: homes, hotels and places for sale");
    const types = page.getByRole("region", { name: "Types of places" });
    await expect(types.getByRole("link")).toHaveCount(4);
    await expect(types.getByRole("link", { name: /Short stays/ })).toHaveAttribute("href", "/en/batumi/short-stays");
    await expect(page.getByRole("heading", { level: 2, name: "Batumi at a glance" })).toBeVisible();
    expect(await robots(page)).toContain("noindex");
    expect(consoleErrors).toEqual([]);
  });

  test("a page without any listing shows the empty state and is not indexed", async ({ page, consoleErrors }) => {
    const response = await page.goto("/en/borjomi/hotels");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hotels and guesthouses in Borjomi");
    const empty = page.locator("[data-city-empty]");
    await expect(empty.getByRole("heading", { name: "No places here yet" })).toBeVisible();
    await expect(empty.getByRole("link", { name: "Post yours" })).toHaveAttribute("href", "/en/post");
    await expect(page.locator("[data-listing-card]")).toHaveCount(0);
    // No map without places; the booking steps and the Shabbat link are still there.
    await expect(page.getByRole("heading", { level: 2, name: "On the map" })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: "How booking works" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Shabbat times and the Jewish calendar in Borjomi" })).toBeVisible();
    expect(await robots(page)).toContain("noindex");
    expect(consoleErrors).toEqual([]);
  });

  test("unknown cities and types answer 404, and the static pages next to them still work", async ({ page }) => {
    for (const path of ["/he/no-such-city", "/he/no-such-city/short-stays", "/he/batumi/no-such-type", "/en/Batumi", "/en/batumi/short-stay"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
    }
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find this page");

    for (const path of ["/he/search", "/he/about", "/en/how-it-works", "/en/jewish-life", "/he/help"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      expect(new URL(page.url()).pathname).toBe(path);
    }
    // The old deal shortcuts still lead to the search.
    await page.goto("/en/hotels");
    expect(new URL(page.url()).pathname).toBe("/en/search");
  });

  test("with 3 real listings (test-only) the page and its overview are indexable, with 2 they are not", async ({ page }) => {
    const owner = await createTestUser({ name: "E2E City Owner" });
    created.users.push(owner.id);
    const ids: string[] = [];
    for (const n of [1, 2, 3]) {
      const listing = await createTestListing({ ownerId: owner.id, title: `E2E city page flat ${n} in Kutaisi`, citySlug: "kutaisi", photos: 1 });
      await sql(
        `UPDATE "Listing" SET "dealType" = 'SALE', "propertyType" = 'APARTMENT', "pricePeriod" = 'TOTAL', price = $1, currency = 'USD', "priceUsd" = $1, "bookingMode" = 'CONTACT' WHERE id = $2`,
        [80_000 + n * 1_000, listing.id],
      );
      ids.push(listing.id);
    }

    await page.goto("/en/kutaisi/sale");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Homes for sale in Kutaisi");
    await expect(page.getByRole("heading", { level: 2, name: "3 places" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "How to get in touch" })).toBeVisible();
    expect(await robots(page)).not.toContain("noindex");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/en\/kutaisi\/sale$/);

    // The overview is indexed when any of its types is.
    await page.goto("/en/kutaisi");
    expect(await robots(page)).not.toContain("noindex");

    // One fewer real listing: back to noindex.
    await sql(`UPDATE "Listing" SET status = 'PAUSED' WHERE id = $1`, [ids[0]]);
    await page.goto("/en/kutaisi/sale");
    await expect(page.getByRole("heading", { level: 2, name: "2 places" })).toBeVisible();
    expect(await robots(page)).toContain("noindex");
  });
});
