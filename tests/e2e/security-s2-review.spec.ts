import { expect, openAsTestUser, test } from "./fixtures";
import { createTestUser, sql } from "./helpers/db";
import { answerTermsStep } from "./helpers/terms";
import { TERMS_VERSION } from "../../src/lib/legal/terms";

/**
 * Fixes from the review of security round S2 that only the real pages can prove:
 * - LP-1/LP-2 (15.11.b/c): a signed-in account whose Terms acceptance is for an OLDER version is
 *   sent to the login's Terms step before its dashboard, and the dashboard opens once it accepts the
 *   version in force (the acceptance is stored with that version and 18+);
 * - 15.5: choosing in the cookie banner stores the site's own record of the choice (an AuditLog row
 *   "consent.cookies" with the method and the consent version, no personal data).
 * Fake data only: a test user (@e2e.bayit.invalid, removed by the global clean-up); the visitor's
 * consent row is removed here.
 */

test("an account that accepted an older Terms version is asked again before its dashboard (LP-1/LP-2)", async ({ browser }) => {
  const user = await createTestUser({ name: "E2E Terms Again" });
  await sql(`UPDATE "TermsAcceptance" SET version = '2000-01-01' WHERE "userId" = $1`, [user.id]);
  const { page, context } = await openAsTestUser(browser, user);
  try {
    await page.goto("/he/account");
    await expect(page).toHaveURL(/\/he\/login\?next=%2Faccount|\/he\/login\?next=\/account/);
    await answerTermsStep(page);
    await expect(page).toHaveURL(/\/he\/account(?:$|[?#])/, { timeout: 30_000 });
    const rows = await sql<{ version: string; ageConfirmed: boolean }>(
      `SELECT version, "ageConfirmed" FROM "TermsAcceptance" WHERE "userId" = $1 AND version = $2`,
      [user.id, TERMS_VERSION],
    );
    expect(rows).toEqual([{ version: TERMS_VERSION, ageConfirmed: true }]);
    // Accepted: the dashboard stays open on the next visit.
    await page.goto("/he/account");
    await expect(page).toHaveURL(/\/he\/account(?:$|[?#])/);
  } finally {
    await context.close();
  }
});

test("a cookie choice in the banner is recorded by the site (15.5)", async ({ browser }) => {
  const use = test.info().project.use;
  const context = await browser.newContext({ baseURL: use.baseURL, userAgent: use.userAgent, viewport: use.viewport, locale: use.locale });
  const page = await context.newPage();
  const startedAt = new Date(Date.now() - 1_000);
  let ids: string[] = [];
  try {
    await page.goto("/he");
    const banner = page.locator("[data-cookie-banner]");
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "אישור הכל" }).click();
    await expect(banner).toBeHidden();
    await expect
      .poll(async () => {
        const rows = await sql<{ id: string; details: Record<string, unknown>; actorId: string | null }>(
          `SELECT id, details, "actorId" FROM "AuditLog" WHERE action = 'consent.cookies' AND "createdAt" >= $1`,
          [startedAt],
        );
        ids = rows.map((r) => r.id);
        return rows.map((r) => ({ method: r.details.method, preferences: r.details.preferences, actorId: r.actorId }));
      })
      .toContainEqual({ method: "accept_all", preferences: true, actorId: null });
  } finally {
    if (ids.length > 0) await sql(`DELETE FROM "AuditLog" WHERE id = ANY($1)`, [ids]);
    await context.close();
  }
});
