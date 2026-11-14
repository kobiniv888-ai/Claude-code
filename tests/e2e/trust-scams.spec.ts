import { expect, openAs, openAsTestUser, settle, test } from "./fixtures";
import { TEST_EMAIL_DOMAIN, createTestListing, createTestUser, sql } from "./helpers/db";

/**
 * Trust and scams (SECURITY_REPORT 14.2.a/b/c, 14.4.b/c, 19.b, 19.j), on the running server:
 * - the listing page shows the founder's exact pay warning next to contact/booking, with the
 *   one-tap "דיווח על הונאה" that opens /help/report-scam with the listing filled in;
 * - a visitor reports a fake Bayit site (name + email, the site's address) → an URGENT
 *   SCAM_REPORT ticket; the page shows the reply-time promise;
 * - a signed-in guest reports the listing (no name or email asked) → an URGENT Report with the
 *   reason "asked for money up front", and a second report of the same listing is refused;
 * - the post form refuses a payment link in the description (friendly message, nothing saved);
 * - the safety page has "our promises" and the security page names our only domain.
 * Test listings and users are the e2e helpers' (removed by the global teardown, reports with them).
 */

const PAY_WARNING = "לעולם אל תשלמו מראש בקישור או בהעברה. משלמים למארח כשמגיעים.";

test("he: the listing page shows the exact pay warning and the one-tap scam report", async ({ browser }) => {
  const owner = await createTestUser({ name: "E2E Scam Owner" });
  const listing = await createTestListing({ ownerId: owner.id, title: `E2E Pay warning ${Date.now().toString(36)}` });
  const { context, page, consoleErrors } = await openAs(browser, null);
  await page.goto(`/he/listing/${listing.publicId}`);
  await settle(page);
  // The warning sits next to contact/booking: in the side box on wide screens and under the price
  // on phones (one of the two is hidden at a time).
  const warning = page.getByTestId("pay-warning").filter({ visible: true }).first();
  await expect(warning).toContainText(PAY_WARNING);
  const button = warning.getByTestId("scam-report-button");
  await expect(button).toHaveText(/דיווח על הונאה/);
  await button.click();
  await expect(page).toHaveURL(new RegExp(`/he/help/report-scam\\?listing=${listing.publicId}`));
  await expect(page.getByRole("heading", { level: 1, name: "דיווח על הונאה" })).toBeVisible();
  // "Scam" is chosen already; visitors give a name and an email.
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(1);
  await expect(page.getByRole("textbox", { name: "שם" })).toBeVisible();
  // The support promise (19.b), from the editable setting or the default text.
  await expect(page.getByText("עונים תוך יום עסקים אחד", { exact: false })).toBeVisible();
  expect(consoleErrors).toEqual([]);
  await context.close();
});

test("en: a visitor reports a fake Bayit site → an urgent scam ticket", async ({ browser }) => {
  const { context, page, consoleErrors } = await openAs(browser, null);
  await page.goto("/en/help/report-scam");
  await settle(page);
  await page.getByRole("radio", { name: /A site or email pretending to be Bayit/ }).check();
  await page.getByRole("textbox", { name: "The fake site's address" }).fill("bayit-bookings.example");
  await page.getByRole("textbox", { name: "What happened, in a few words" }).fill("E2E: an email with a Bayit logo asked me to confirm my card on this site.");
  const email = `scam-${Date.now().toString(36)}@${TEST_EMAIL_DOMAIN}`;
  await page.getByRole("textbox", { name: "Name" }).fill("E2E Visitor");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Send the report" }).click();
  await expect(page.getByRole("heading", { name: "We got your report" })).toBeVisible();
  await expect
    .poll(async () => (await sql<{ category: string; priority: string }>(`SELECT category, priority FROM "Ticket" WHERE "guestEmail" = $1`, [email]))[0])
    .toMatchObject({ category: "SCAM_REPORT", priority: "URGENT" });
  expect(consoleErrors).toEqual([]);
  await context.close();
});

test("en: a signed-in guest reports the listing → an urgent report, once", async ({ browser }) => {
  const owner = await createTestUser({ name: "E2E Scam Owner" });
  const listing = await createTestListing({ ownerId: owner.id, title: `E2E Scam target ${Date.now().toString(36)}` });
  const guest = await createTestUser({ name: "E2E Scam Guest" });
  const { context, page, consoleErrors } = await openAsTestUser(browser, guest);
  for (const attempt of [1, 2]) {
    await page.goto(`/en/help/report-scam?listing=${listing.publicId}`);
    await settle(page);
    // Signed in: answered in the account, no name or email asked.
    await expect(page.getByRole("textbox", { name: "Email" })).toHaveCount(0);
    await page.getByRole("textbox", { name: "What happened, in a few words" }).fill("E2E: the host sent a payment link for the deposit before the stay.");
    await page.getByRole("button", { name: "Send the report" }).click();
    if (attempt === 1) await expect(page.getByRole("heading", { name: "We got your report" })).toBeVisible();
    // (Next's own route announcer is an empty role="alert" too: match the form's message.)
    else await expect(page.getByRole("alert").filter({ hasText: "You already reported this" })).toBeVisible();
  }
  const reports = await sql<{ reason: string; priority: string }>(`SELECT reason, priority FROM "Report" WHERE "listingId" = $1 AND "reporterId" = $2`, [listing.id, guest.id]);
  expect(reports).toEqual([{ reason: "ASKED_MONEY_UPFRONT", priority: "URGENT" }]);
  expect(consoleErrors).toEqual([]);
  await context.close();
});

test("en: the post form refuses a payment link in the description", async ({ browser }) => {
  const owner = await createTestUser({ name: "E2E Pay Link Owner" });
  const draft = await createTestListing({ ownerId: owner.id, title: `E2E Pay link ${Date.now().toString(36)}`, status: "DRAFT" });
  const { context, page } = await openAsTestUser(browser, owner);
  await page.goto(`/en/post/${draft.id}?step=text`);
  await settle(page);
  const description = page.getByRole("textbox", { name: /^Description/ }).first();
  await description.fill("A quiet studio with a mountain view. Pay the deposit at paypal.me/e2e-host to hold the dates.");
  await description.blur();
  await expect(page.getByText(/Please leave out payment details/).first()).toBeVisible();
  const [row] = await sql<{ description: string | null }>(`SELECT description FROM "Listing" WHERE id = $1`, [draft.id]);
  expect(row.description ?? "").not.toContain("paypal");
  // The account is flagged for staff (an automatic report, no reporter).
  await expect
    .poll(async () => (await sql(`SELECT 1 FROM "Report" WHERE "listingId" = $1 AND "reporterId" IS NULL AND reason = 'ASKED_MONEY_UPFRONT'`, [draft.id])).length)
    .toBe(1);
  await context.close();
});

test("en: the safety page has our promises and the security page names our only domain", async ({ browser }) => {
  const { context, page, consoleErrors } = await openAs(browser, null);
  await page.goto("/en/safety");
  await settle(page);
  await expect(page.getByRole("heading", { level: 2, name: "Our promises" })).toBeVisible();
  await page.goto("/en/security");
  await settle(page);
  const domain = new URL(page.url()).host;
  await expect(page.getByRole("heading", { level: 2, name: "Our only website" })).toBeVisible();
  await expect(page.locator("main")).toContainText(domain);
  await expect(page.locator(`main a[href="/en/help/report-scam"]`)).toBeAttached();
  expect(consoleErrors).toEqual([]);
  await context.close();
});
