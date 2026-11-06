import { expect, openAs, openAsTestUser, test } from "./fixtures";
import { createTestListing, createTestUser, newId, sql } from "./helpers/db";

/**
 * Price guide for hosts (round 3, brief 5; section 13.7).
 *
 * 1. With the real listings (the database only has demo listings, which never count), the guide
 *    says "Not enough similar places yet": on the "Price guide" page for one of the host's places,
 *    for a city question, and in the post form's "Bookings and price" step.
 * 2. With TEST-ONLY places (an inactive city that is never listed on the site, five live places of
 *    five fake owners, plus a demo place and the host's own live place that must not count), it
 *    shows the middle price and the usual range, and where the host's price sits. Another host
 *    can't open it for that listing, and a signed-in guest gets no guide at all.
 *
 * Everything the test creates is removed at the end; nothing is seeded into the real data.
 */

const PAGE = "/en/account/listings/price-guide";

test.describe("price guide", () => {
  const created = { users: [] as string[], cityId: "" };

  test.afterAll(async () => {
    for (const id of created.users) {
      await sql(`DELETE FROM "RateLimit" WHERE key = $1`, [`price-guide:${id}`]);
      await sql(`DELETE FROM "Session" WHERE "userId" = $1`, [id]);
      // Their listings (and photos) go with them (onDelete: Cascade).
      await sql(`DELETE FROM "User" WHERE id = $1`, [id]);
    }
    if (created.cityId) await sql(`DELETE FROM "City" WHERE id = $1`, [created.cityId]);
  });

  async function host(name: string) {
    const user = await createTestUser({ name });
    created.users.push(user.id);
    await sql(`UPDATE "User" SET "firstName" = $1 WHERE id = $2`, [name.split(" ").pop(), user.id]);
    return user;
  }

  test("with the real listings it says there aren't enough similar places", async ({ browser }) => {
    const owner = await host("E2E Guide Real");
    // A draft: never public, and the host's own place never counts anyway.
    const listing = await createTestListing({ ownerId: owner.id, title: "E2E price guide draft in Batumi", status: "DRAFT", citySlug: "batumi" });
    await sql(`UPDATE "Listing" SET price = 55, currency = 'GEL', "pricePeriod" = 'NIGHT' WHERE id = $1`, [listing.id]);
    const { page, context } = await openAsTestUser(browser, owner);

    await page.goto(`${PAGE}?listing=${listing.id}`);
    const answer = page.getByTestId("price-guide-answer");
    await expect(answer.getByTestId("guide-not-enough")).toHaveText("Not enough similar places yet");
    await expect(answer.getByTestId("guide-scope")).toContainText("Batumi");

    await page.goto(`${PAGE}?mode=custom&city=batumi&deal=SHORT_STAY&type=APARTMENT&size=any`);
    await expect(page.getByTestId("price-guide-answer").getByTestId("guide-not-enough")).toBeVisible();

    // The post form's price step shows the same answer.
    await page.goto(`/en/post/${listing.id}?step=booking`);
    const panel = page.getByTestId("price-guide-panel");
    await expect(panel.getByTestId("guide-not-enough")).toBeVisible({ timeout: 60_000 });
    await context.close();
  });

  test("with test-only places it shows a range and where the host's price sits, only to the host", async ({ browser }) => {
    const slug = `e2e-guide-${newId().slice(0, 8).toLowerCase()}`;
    created.cityId = newId();
    const names = { he: "עיר מבחן", en: "Testville", ru: "Тестовый город", ar: "مدينة الاختبار", ka: "სატესტო ქალაქი" };
    // Inactive: never listed anywhere on the site while the test runs.
    await sql(
      `INSERT INTO "City" (id, slug, names, "searchText", lat, lng, active, "updatedAt") VALUES ($1, $2, $3, 'testville', 41.6, 41.6, false, now())`,
      [created.cityId, slug, JSON.stringify(names)],
    );

    const place = async (ownerId: string, price: number, extra = "") => {
      const row = await createTestListing({ ownerId, title: `E2E guide place ${price}`, citySlug: slug, photos: 1 });
      await sql(
        `UPDATE "Listing" SET price = $1, currency = 'GEL', "pricePeriod" = 'NIGHT', "dealType" = 'SHORT_STAY', "propertyType" = 'APARTMENT', bedrooms = 1 ${extra} WHERE id = $2`,
        [price, row.id],
      );
      return row;
    };

    // Five similar live places of five other hosts: the middle half is ₾50–₾70, the middle ₾60.
    for (const price of [40, 50, 60, 70, 80]) {
      const other = await host(`E2E Guide Owner${price}`);
      await place(other.id, price);
    }
    // These must not count: a demo place, and the host's own live place.
    const demoOwner = await host("E2E Guide Demo");
    await place(demoOwner.id, 5000, `, "isDemo" = true`);
    const me = await host("E2E Guide Host");
    await place(me.id, 1000);
    const mine = await createTestListing({ ownerId: me.id, title: "E2E guide host draft", status: "DRAFT", citySlug: slug, photos: 1 });
    await sql(`UPDATE "Listing" SET price = 45, currency = 'GEL', "pricePeriod" = 'NIGHT', bedrooms = 1 WHERE id = $1`, [mine.id]);

    const owner = await openAsTestUser(browser, me);
    await owner.page.goto(`${PAGE}?listing=${mine.id}`);
    const answer = owner.page.getByTestId("price-guide-answer");
    await expect(answer).toContainText("Middle price");
    await expect(answer).toContainText("₾60");
    await expect(answer).toContainText("₾50–₾70");
    await expect(answer).toContainText("Compared with 5 similar places:");
    await expect(answer.locator("[data-position]")).toHaveAttribute("data-position", "below");
    // (The place name is isolated from the sentence with invisible direction marks.)
    await expect(answer.locator("[data-position]")).toContainText(/Your price, ₾45, is lower than most similar places in \W?Testville\W?\./);
    // Fewer than 10 places: no lowest or highest price; no names or links of other places.
    await expect(answer).not.toContainText("Lowest");
    await expect(answer).not.toContainText("E2E guide place");
    await expect(answer.locator('a[href*="/listing/"]')).toHaveCount(0);

    // The same answer in the post form's price step, following the price the host types.
    await owner.page.goto(`/en/post/${mine.id}?step=booking`);
    const panel = owner.page.getByTestId("price-guide-panel");
    await expect(panel).toContainText("₾50–₾70", { timeout: 60_000 });
    await expect(panel.locator("[data-position]")).toHaveAttribute("data-position", "below");
    await owner.page.getByLabel("Price per night").fill("65");
    await expect(panel.locator("[data-position]")).toHaveAttribute("data-position", "typical");
    await owner.context.close();

    // Another host can't open it for this listing.
    const otherHost = await host("E2E Guide Other");
    await createTestListing({ ownerId: otherHost.id, title: "E2E guide other draft", status: "DRAFT", photos: 1 });
    const other = await openAsTestUser(browser, otherHost);
    await other.page.goto(`${PAGE}?listing=${mine.id}`);
    await expect(other.page.getByText("We couldn't find this place among yours.")).toBeVisible();
    await expect(other.page.getByTestId("price-guide-answer")).toHaveCount(0);
    await other.context.close();

    // A signed-in guest (no listings) gets no guide at all.
    const guestUser = await host("E2E Guide Guest");
    const guest = await openAsTestUser(browser, guestUser);
    await guest.page.goto(`${PAGE}?listing=${mine.id}`);
    await expect(guest.page.getByText("The price guide is for hosts")).toBeVisible();
    await expect(guest.page.getByTestId("price-guide-answer")).toHaveCount(0);
    await guest.context.close();

    // Signed out: the login page.
    const anon = await openAs(browser, null);
    await anon.page.goto(`${PAGE}?listing=${mine.id}`);
    await expect(anon.page).toHaveURL(/\/login/);
    await anon.context.close();
  });
});
