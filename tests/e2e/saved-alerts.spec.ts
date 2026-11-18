import { expect, openAsTestUser, test } from "./fixtures";
import { createTestListing, createTestUser, sql } from "./helpers/db";

/**
 * Saved searches and price alerts (round 3, brief 7.4): a signed-in guest saves a search from the
 * results page ("Save search", a name sheet); a matching test listing goes live and the daily
 * cron route (CRON_SECRET) puts ONE email in the outbox; a saved place lowers its price and the
 * price-drop email lands; pausing the search on /account/alerts stops its emails.
 *
 * The server must have CRON_SECRET set (the same value as this test's environment) and run in
 * development or test mode (AUTH_TEST_MODE on localhost): the cron route takes `?at=` and `?user=`
 * only there, so the run is for this test's guest only, at a morning that is not Shabbat or Yom
 * Tov. The test listings are in Mestia (no demo listings there). Everything is removed at the end.
 */

const DAY_MS = 86_400_000;

type CronResult = {
  ok?: boolean;
  savedSearches?: { status: string; sent?: number; users?: number };
  priceDrops?: { status: string; sent?: number };
};

test.describe("saved searches and price alerts", () => {
  const created = { guest: "", host: "", email: "", listings: [] as string[] };

  test.afterAll(async () => {
    if (created.email) await sql(`DELETE FROM "EmailOutbox" WHERE "to" = $1`, [created.email]);
    for (const id of [created.guest, created.host].filter(Boolean)) {
      await sql(`DELETE FROM "RateLimit" WHERE key LIKE $1`, [`%${id}%`]);
    }
    if (created.listings.length) await sql(`DELETE FROM "Listing" WHERE id = ANY($1)`, [created.listings]);
    for (const id of [created.guest, created.host].filter(Boolean)) {
      await sql(`DELETE FROM "Session" WHERE "userId" = $1`, [id]);
      await sql(`DELETE FROM "User" WHERE id = $1`, [id]);
    }
  });

  test("save a search, get one email for a new place and one for a price drop; pausing stops them", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const cronSecret = process.env.CRON_SECRET?.trim();
    expect(cronSecret, "run the server and the tests with CRON_SECRET (e.g. in .env)").toBeTruthy();

    const guest = await createTestUser({ name: "E2E Alerts Guest" });
    created.guest = guest.id;
    created.email = `alerts-${Date.now()}@example.com`;
    await sql(`UPDATE "User" SET "contactEmail" = $1, "firstName" = 'Alerts' WHERE id = $2`, [created.email, guest.id]);
    const host = await createTestUser({ name: "E2E Alerts Host" });
    created.host = host.id;

    // The cron runs "as if" on a coming morning (09:30 Israel time); a Shabbat or Yom Tov morning
    // answers "rest_day" and the next day is tried.
    let day = Math.floor(Date.now() / DAY_MS) * DAY_MS + DAY_MS;
    const runCron = async (): Promise<CronResult> => {
      for (let tries = 0; tries < 5; tries++, day += DAY_MS) {
        const at = new Date(day + 6.5 * 3600_000).toISOString();
        const response = await page.request.get(`/api/cron/saved-alerts?at=${encodeURIComponent(at)}&user=${guest.id}`, {
          headers: { authorization: `Bearer ${cronSecret}` },
        });
        expect(response.status(), await response.text()).toBe(200);
        const result = (await response.json()) as CronResult;
        if (result.savedSearches?.status === "ran") {
          day += DAY_MS;
          return result;
        }
      }
      throw new Error("no morning without Shabbat or Yom Tov in five days");
    };
    const emails = (template: string) =>
      sql<{ subject: string; text: string }>(`SELECT subject, text FROM "EmailOutbox" WHERE "to" = $1 AND template = $2 ORDER BY "createdAt"`, [created.email, template]);

    // Without the secret the route refuses.
    expect((await page.request.get("/api/cron/saved-alerts")).status()).toBe(401);

    // 1. Save the search from the results page (signed in): the name sheet, prefilled.
    const signedIn = await openAsTestUser(browser, guest);
    const results = signedIn.page;
    await results.goto("/en/search?deal=short-stay&city=mestia");
    await results.waitForLoadState("networkidle");
    const save = results.locator("[data-save-search]:visible");
    await expect(save).toHaveText("Save search");
    await save.click();
    const sheet = results.getByRole("dialog", { name: "Save this search" });
    await expect(sheet.getByLabel("Search name")).toHaveValue(/Mestia/);
    await sheet.getByLabel("Search name").fill("E2E Mestia stays");
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(results.getByText("Search saved: ")).toBeVisible();
    await expect(results.locator("[data-save-search]:visible")).toHaveText("Search saved");
    const [saved] = await sql<{ id: string; name: string; active: boolean; filters: { query: string } }>(
      `SELECT id, name, active, filters FROM "SavedSearch" WHERE "userId" = $1`,
      [guest.id],
    );
    expect(saved).toMatchObject({ name: "E2E Mestia stays", active: true });
    expect(saved.filters.query).toBe("deal=short-stay&city=mestia");

    // 2. A matching test listing goes live → the cron puts ONE email in the outbox, in English.
    const first = await createTestListing({ ownerId: host.id, title: "E2E alerts chalet in Mestia" });
    created.listings.push(first.id);
    const run1 = await runCron();
    expect(run1.savedSearches).toMatchObject({ status: "ran", sent: 1 });
    const matches = await emails("saved_search_matches");
    expect(matches).toHaveLength(1);
    expect(matches[0].subject).toMatch(/new place/);
    expect(matches[0].text).toContain("E2E alerts chalet in Mestia");
    expect(matches[0].text).toContain("E2E Mestia stays");
    expect(matches[0].text).toMatch(/\/en\/unsubscribe\?t=/);
    // The same place is never sent twice for this search.
    await runCron();
    expect(await emails("saved_search_matches")).toHaveLength(1);

    // 3. A saved place lowers its price by 20% → the price-drop email.
    await sql(
      `INSERT INTO "Favorite" (id, "userId", "listingId", "alertPrice", "alertCurrency")
       SELECT 'e2e-fav-' || substr(md5(random()::text), 1, 12), $1, id, price, currency FROM "Listing" WHERE id = $2`,
      [guest.id, first.id],
    );
    await sql(`UPDATE "Listing" SET price = round(price * 0.8), "priceUsd" = round("priceUsd" * 0.8), "contentUpdatedAt" = now() WHERE id = $1`, [first.id]);
    const run2 = await runCron();
    expect(run2.priceDrops).toMatchObject({ status: "ran", sent: 1 });
    const drops = await emails("price_drop");
    expect(drops).toHaveLength(1);
    expect(drops[0].subject).toContain("Price down 20%");
    expect(drops[0].subject).toContain("E2E alerts chalet in Mestia");

    // 4. Pause the search on the alerts page → a new matching place sends nothing.
    await results.goto("/en/account/alerts");
    await expect(results.getByRole("heading", { level: 1, name: "Alerts and saved searches" })).toBeVisible();
    const row = results.locator(`[data-saved-search="${saved.id}"]`);
    await expect(row).toContainText("E2E Mestia stays");
    await row.getByRole("switch", { name: "Emails for E2E Mestia stays" }).click();
    await expect(results.getByText("Search paused. No emails about it.")).toBeVisible();
    await expect.poll(async () => (await sql<{ active: boolean }>(`SELECT active FROM "SavedSearch" WHERE id = $1`, [saved.id]))[0].active).toBe(false);
    const second = await createTestListing({ ownerId: host.id, title: "E2E alerts cabin in Mestia" });
    created.listings.push(second.id);
    const run3 = await runCron();
    expect(run3.savedSearches).toMatchObject({ status: "ran", users: 0, sent: 0 });
    expect(await emails("saved_search_matches")).toHaveLength(1);

    // Development server only (React does not log it in production): a sheet opened before the
    // deferred search-bar island has hydrated finds Radix's aria-hidden on its server HTML. The
    // filters and sort sheets do the same; it is not about this feature.
    expect(signedIn.consoleErrors.filter((error) => !/A tree hydrated but some attributes/.test(error))).toEqual([]);
    await signedIn.context.close();
  });
});
