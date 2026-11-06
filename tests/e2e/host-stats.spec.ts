import { expect, openAsTestUser, test } from "./fixtures";
import { createTestListing, createTestUser, sql } from "./helpers/db";
import type { Page } from "@playwright/test";

/**
 * Host stats (round 3, brief 6.2): a visitor's views count once a day, the host's own view never
 * counts, the numbers show on the card in "הנכסים שלי" and on the stats page (only for the
 * host), and the weekly email lands in the outbox when the cron route is called with CRON_SECRET,
 * with a one-tap unsubscribe link that works without logging in.
 *
 * The server must have CRON_SECRET set (the same value as this test's environment or .env) and
 * run in development or test mode (AUTH_TEST_MODE on localhost): the cron route takes `?at=` and
 * `?host=` only there, so the test sends one email to its own host for next Sunday's week.
 * Everything the test creates is removed at the end.
 */

const tbilisiToday = () => new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10);

/** The ViewTracker's server action for this listing (its answer means the view was handled). */
function viewHandled(page: Page, listingId: string) {
  return page.waitForResponse(
    (r) => r.request().method() === "POST" && !!r.request().headers()["next-action"] && (r.request().postData() ?? "").includes(listingId),
    { timeout: 60_000 },
  );
}

async function openAndCount(page: Page, path: string, listingId: string) {
  const handled = viewHandled(page, listingId);
  await page.goto(path);
  await handled;
}

async function viewsToday(listingId: string): Promise<number> {
  const [row] = await sql<{ views: number }>(`SELECT views FROM "ListingStatDaily" WHERE "listingId" = $1 AND date = $2::date`, [listingId, tbilisiToday()]);
  return row?.views ?? 0;
}

test.describe("host stats", () => {
  const created = { userId: "", listingId: "", email: "" };

  test.afterAll(async () => {
    if (created.email) await sql(`DELETE FROM "EmailOutbox" WHERE "to" = $1`, [created.email]);
    if (created.listingId) {
      await sql(`DELETE FROM "RateLimit" WHERE key LIKE $1`, [`stats:%:${created.listingId}%`]);
      await sql(`DELETE FROM "Listing" WHERE id = $1`, [created.listingId]);
    }
    if (created.userId) {
      await sql(`DELETE FROM "RateLimit" WHERE key LIKE $1`, [`weekly-host-stats:%:${created.userId}`]);
      await sql(`DELETE FROM "Session" WHERE "userId" = $1`, [created.userId]);
      await sql(`DELETE FROM "User" WHERE id = $1`, [created.userId]);
    }
  });

  test("views count once a day, never the host's; the card, the stats page and the weekly email show them", async ({ page, browser }) => {
    const cronSecret = process.env.CRON_SECRET?.trim();
    expect(cronSecret, "run the server and the tests with CRON_SECRET (e.g. in .env)").toBeTruthy();

    const host = await createTestUser({ name: "E2E Stats Host" });
    created.userId = host.id;
    created.email = `stats-${Date.now()}@example.com`;
    await sql(`UPDATE "User" SET "contactEmail" = $1, "firstName" = 'Stats' WHERE id = $2`, [created.email, host.id]);
    const listing = await createTestListing({ ownerId: host.id, title: "E2E stats studio in Mestia" });
    created.listingId = listing.id;
    const path = `/en/listing/${listing.publicId}`;

    // 1. The host's own view never counts (signed in, on their own listing).
    const owner = await openAsTestUser(browser, host);
    await openAndCount(owner.page, path, listing.id);
    expect(await viewsToday(listing.id)).toBe(0);

    // 2. A visitor's two views on the same day count once.
    await openAndCount(page, path, listing.id);
    expect(await viewsToday(listing.id)).toBe(1);
    const again = viewHandled(page, listing.id);
    await page.reload();
    await again;
    expect(await viewsToday(listing.id)).toBe(1);

    // 3. The host sees it on the card in "My places"…
    await owner.page.goto("/en/account/listings");
    const card = owner.page.getByRole("article").filter({ hasText: "E2E stats studio in Mestia" });
    await expect(card).toContainText("Last 30 days:");
    await expect(card.locator('[data-stat="views"]')).toHaveText(/^\s*Views\s*1\s*$/);
    await expect(card.locator('[data-stat="bookings"]')).toHaveText(/0/);

    // …and on the stats page, for the last 7 and 30 days.
    await owner.page.goto(`/en/account/listings/${listing.id}/stats`);
    await expect(owner.page.getByRole("heading", { level: 1, name: "Statistics" })).toBeVisible();
    await expect(owner.page.getByRole("figure", { name: "Views" })).toContainText("1");
    await expect(owner.page.getByRole("heading", { name: "Bookings and occupancy" })).toBeVisible();
    await owner.page.getByRole("link", { name: "Last 7 days" }).click();
    await expect(owner.page).toHaveURL(/days=7/);
    await expect(owner.page.getByRole("figure", { name: "Views" })).toContainText("1");
    expect(owner.consoleErrors).toEqual([]);

    // 4. Guests never see it: signed out, the stats page asks to log in.
    await page.goto(`/en/account/listings/${listing.id}/stats`);
    await expect(page).toHaveURL(/\/login/);

    // 5. The weekly email: next Sunday at 09:30 Israel time it covers this week (a Yom Tov Sunday
    //    moves it to Monday or Tuesday). The cron route needs CRON_SECRET.
    const today = new Date(`${tbilisiToday()}T00:00:00Z`);
    const sunday = new Date(today.getTime() + (7 - today.getUTCDay()) * 86_400_000);
    const unauthorized = await page.request.get("/api/cron/weekly-host-stats");
    expect(unauthorized.status()).toBe(401);
    let result: { ok?: boolean; status?: string; sent?: number } = {};
    for (let i = 0; i < 3 && result.status !== "ran"; i++) {
      const at = new Date(sunday.getTime() + i * 86_400_000 + 7.5 * 3600_000).toISOString();
      const response = await page.request.get(`/api/cron/weekly-host-stats?at=${encodeURIComponent(at)}&host=${host.id}`, {
        headers: { authorization: `Bearer ${cronSecret}` },
      });
      expect(response.status(), await response.text()).toBe(200);
      result = await response.json();
    }
    expect(result).toMatchObject({ ok: true, status: "ran", sent: 1 });
    const [email] = await sql<{ subject: string; text: string; status: string }>(
      `SELECT subject, text, status FROM "EmailOutbox" WHERE "to" = $1 AND template = 'weekly_host_stats' ORDER BY "createdAt" DESC LIMIT 1`,
      [created.email],
    );
    expect(email, "the weekly email is in the outbox").toBeTruthy();
    expect(email.subject).toBe("This week: 1 view, 0 saves, 0 bookings");
    expect(email.text).toContain("E2E stats studio in Mestia");
    expect(email.text).toContain(`/en/account/listings/${listing.id}/stats?days=7`);

    // 6. One tap on the unsubscribe link (no login) turns the weekly email off.
    const link = /https?:\/\/\S+\/en\/unsubscribe\?t=\S+/.exec(email.text)?.[0];
    expect(link, "the email has an unsubscribe link").toBeTruthy();
    const target = new URL(link!);
    await page.goto(`${target.pathname}${target.search}`);
    await expect(page.getByRole("heading", { level: 1, name: "Stop the weekly summary?" })).toBeVisible();
    await page.getByRole("button", { name: "Stop the weekly summary" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "The weekly summary is off" })).toBeVisible();
    const [prefs] = await sql<{ notificationPrefs: { email?: { weeklyStats?: boolean } } | null }>(
      `SELECT "notificationPrefs" FROM "User" WHERE id = $1`,
      [host.id],
    );
    expect(prefs.notificationPrefs?.email?.weeklyStats).toBe(false);
    // The host can turn it back on from the same page.
    await page.getByRole("button", { name: "Turn the weekly summary back on" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "The weekly summary is back on" })).toBeVisible();

    await owner.context.close();
  });
});
