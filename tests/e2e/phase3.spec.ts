import { randomInt } from "node:crypto";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect, openAs, settle, test } from "./fixtures";
import { loginByEmail } from "./helpers/auth";
import { createReport, createTestListing, createTestUser, listingByPublicId, newId, sql, TEST_EMAIL_DOMAIN } from "./helpers/db";
import { makePhotos } from "./helpers/photos";
import { TEST_ADMIN_PHONE } from "./helpers/staff";

/**
 * Round 3, phase 3 together, in production mode: the admin panel (brief 9), turned-away reports
 * (brief 8.2) and the "ביקרנו במקום" badge (brief 8.3).
 *
 * - 13.4: a host's FIRST listing waits for review; the admin sees "Check before publishing", approves
 *   it, and the host's email is in the outbox.
 * - Asking for changes: the host's fix comes back to review (never straight to the site).
 * - 13.3 (from a cancelled booking; reports.spec.ts covers the listing's "…" menu): the guest's
 *   report, with a screenshot, waits in the admin panel as urgent, with the guest's choice, date and
 *   booking. Only staff can open the screenshot.
 * - Admin home "דורש טיפול": the counts are the real ones, and the rows lead to their queues.
 * - The badge set by the admin shows on the listing page and as the first card tag, the filter finds
 *   it, and its internal note never reaches the public HTML.
 * - Every new admin page answers 404 to a signed-in user who is not staff.
 *
 * Test users sign in with email codes (phone codes are limited to 20 an hour per address, and the
 * rest of the suite uses most of them); the test admin uses its shared 2-step session. Everything is
 * removed by the global teardown (test users, their listings, bookings, reports, uploads and emails).
 */

type TestUser = Awaited<ReturnType<typeof createTestUser>>;
type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

const emailOf = (user: { phone: string }) => `${user.phone.slice(1)}@${TEST_EMAIL_DOMAIN}`;
const stamp = () => Date.now().toString(36);

/** A host who accepted the current pledge (publishing needs it), like the demo hosts. */
async function createHost(name: string): Promise<TestUser> {
  const host = await createTestUser({ name });
  await sql(
    `UPDATE "User" SET "firstName" = $2, "welcomePledgeVersion" = (SELECT max("welcomePledgeVersion") FROM "User" WHERE "isDemo"), "welcomePledgeAcceptedAt" = now() WHERE id = $1`,
    [host.id, name.split(" ").pop()],
  );
  return host;
}

/** Sessions of test users signed in with an email code, kept for the worker. */
const sessions = new Map<string, StorageState>();
async function openAsUser(browser: Browser, user: TestUser) {
  let state = sessions.get(user.id);
  if (!state) {
    const { context, page } = await openAs(browser, null);
    await loginByEmail(page, emailOf(user));
    state = await context.storageState();
    sessions.set(user.id, state);
    await context.close();
  }
  return openAs(browser, null, state);
}

/** The template names of the emails in the outbox for `to`. */
async function outboxTemplates(to: string): Promise<string[]> {
  const rows = await sql<{ template: string }>(`SELECT template FROM "EmailOutbox" WHERE "to" = $1 ORDER BY "createdAt"`, [to]);
  return rows.map((r) => r.template);
}

test.describe("listing review (brief 9, test 13.4)", () => {
  test("a host's first listing waits for review; the admin approves it and the host's email is in the outbox", async ({ browser }) => {
    test.slow();
    const host = await createHost("E2E Phase3 Dana");
    const title = `E2E First listing ${stamp()}`;
    const draft = await createTestListing({ ownerId: host.id, title, status: "DRAFT", photos: 6 });

    // The host publishes the draft (step 14): the first listing of an account always waits.
    const owner = await openAsUser(browser, host);
    await owner.page.goto(`/en/post/${draft.id}?step=14`);
    await settle(owner.page);
    await expect(owner.page.getByRole("heading", { level: 1, name: "Preview and publish" })).toBeVisible();
    await expect(owner.page.getByRole("region", { name: "Before you can publish" })).toHaveCount(0);
    await owner.page.getByRole("checkbox", { name: /I accept the listing rules/ }).check();
    await owner.page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(owner.page.getByRole("heading", { name: "We're checking your listing" })).toBeVisible({ timeout: 60_000 });
    const waiting = await listingByPublicId(draft.publicId);
    expect(waiting.status).toBe("IN_REVIEW");
    expect(waiting.riskReasons?.map((r) => r.code)).toContain("first_listing");
    expect(owner.consoleErrors).toEqual([]);
    await owner.context.close();

    // The admin: the review page says why it waits and shows the "Check before publishing" slot.
    const admin = await openAs(browser, TEST_ADMIN_PHONE);
    await admin.page.goto("/en/admin/moderation");
    await admin.page.getByRole("link", { name: title }).click();
    await expect(admin.page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(admin.page.getByText("The host's first listing: always checked before it goes live")).toBeVisible();
    const precheck = admin.page.locator("#precheck");
    await expect(precheck).toContainText("Check before publishing");
    // A check that found something names what it found (here: why it waits, not a problem).
    await expect(precheck.getByRole("listitem").filter({ hasText: "Host's first listing" })).toContainText("First listing of the account");
    await expect(precheck.getByRole("listitem").filter({ hasText: "Verified phone" })).toContainText("OK");
    await settle(admin.page);
    await admin.page.getByRole("button", { name: "Approve", exact: true }).click();
    const dialog = admin.page.getByRole("alertdialog").or(admin.page.getByRole("dialog"));
    await expect(dialog).toContainText("Approve this listing?");
    await dialog.getByRole("button", { name: "Approve and publish" }).click();
    await expect(admin.page.getByText("Approved. The listing is live.")).toBeVisible();
    await expect.poll(async () => (await listingByPublicId(draft.publicId)).status).toBe("LIVE");

    // The host's "approved" email is in the outbox (no email service on this machine): in the
    // database and on the admin's outbox page.
    await expect.poll(() => outboxTemplates(emailOf(host))).toContain("listing_approved");
    await admin.page.goto(`/en/admin/outbox?to=${encodeURIComponent(emailOf(host))}`);
    const row = admin.page.getByRole("listitem").filter({ hasText: "listing_approved" });
    await expect(row).toBeVisible();
    await expect(row).toContainText(emailOf(host));
    expect(admin.consoleErrors).toEqual([]);
    await admin.context.close();
  });

  test("asking for changes: the host's fix goes back to review, not straight to the site", async ({ browser }) => {
    test.slow();
    const host = await createHost("E2E Phase3 Avi");
    // Not the host's first listing: they already have one on the site.
    await createTestListing({ ownerId: host.id, title: `E2E Avi live ${stamp()}` });
    const title = `E2E Avi second ${stamp()}`;
    const second = await createTestListing({ ownerId: host.id, title, status: "IN_REVIEW", photos: 6 });

    const admin = await openAs(browser, TEST_ADMIN_PHONE);
    await admin.page.goto(`/en/admin/moderation/${second.id}`);
    await expect(admin.page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await settle(admin.page);
    await admin.page.getByRole("button", { name: "Ask for changes" }).click();
    const dialog = admin.page.getByRole("dialog", { name: "Ask the owner for changes" });
    await dialog.getByRole("combobox", { name: "Reason" }).click();
    await admin.page.getByRole("option", { name: "Photos are low quality" }).click();
    await dialog.getByRole("textbox", { name: "Note to the owner" }).fill("Please describe the kitchen.");
    await dialog.getByRole("button", { name: "Send to the owner" }).click();
    await expect(admin.page.getByText("Sent back to the owner.")).toBeVisible();
    await expect.poll(async () => (await listingByPublicId(second.publicId)).status).toBe("NEEDS_CHANGES");
    await expect.poll(() => outboxTemplates(emailOf(host))).toContain("listing_needs_changes");

    // The host fixes the text in the edit form and saves.
    const owner = await openAsUser(browser, host);
    await owner.page.goto(`/en/account/listings/${second.id}/edit?step=7`);
    await settle(owner.page);
    await expect(owner.page.getByRole("heading", { level: 1, name: "Title and description" })).toBeVisible();
    await owner.page
      .getByRole("textbox", { name: "Description" })
      .fill("E2E fixed: a bright studio with a new kitchen (oven, fridge, kettle), a balcony with a mountain view and fast Wi-Fi.");
    await owner.page.getByRole("button", { name: "Save changes" }).click();
    await expect(owner.page.getByRole("heading", { name: "We're checking your listing" })).toBeVisible({ timeout: 60_000 });
    expect(owner.consoleErrors).toEqual([]);
    await owner.context.close();

    const fixed = await listingByPublicId(second.publicId);
    expect(fixed.status, "only a person lets a listing go live after changes were asked").toBe("IN_REVIEW");
    // It waits in the review queue again.
    await admin.page.goto("/en/admin/moderation");
    await expect(admin.page.getByRole("link", { name: title })).toBeVisible();
    expect(admin.consoleErrors).toEqual([]);
    await admin.context.close();
  });
});

const BOOKING_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** A booking the host cancelled two days ago (as if from the site), for `guest` at `listingId`. */
async function createCancelledBooking(opts: { listingId: string; guest: TestUser; hostId: string }) {
  let code = "";
  do code = `BT-${Array.from({ length: 5 }, () => BOOKING_CODE_ALPHABET[randomInt(BOOKING_CODE_ALPHABET.length)]).join("")}`;
  while ((await sql(`SELECT 1 FROM "Booking" WHERE code = $1`, [code])).length > 0);
  const id = newId();
  await sql(
    `INSERT INTO "Booking" (id, code, "listingId", "guestUserId", "hostUserId", "checkIn", "checkOut", nights, adults, "nightlyPrice", subtotal, total,
       currency, "cancellationPolicy", status, "cancelledAt", "cancelledById", "guestName", "guestPhone", locale, "rulesAcceptedAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, current_date + 30, current_date + 33, 3, 2, 60, 180, 180,
       'USD', 'MODERATE', 'CANCELLED_BY_HOST', now() - interval '2 days', $5, $6, $7, 'he', now() - interval '3 days', now() - interval '3 days', now())`,
    [id, code, opts.listingId, opts.guest.id, opts.hostId, opts.guest.name, opts.guest.phone],
  );
  // The day the host cancelled, in Tbilisi (the form's default date).
  const [{ day }] = await sql<{ day: string }>(`SELECT to_char(("cancelledAt" AT TIME ZONE 'UTC') + interval '4 hours', 'YYYY-MM-DD') AS day FROM "Booking" WHERE id = $1`, [id]);
  return { id, code, cancelledDay: day };
}

const dayBefore = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const longDate = (day: string) =>
  new Intl.DateTimeFormat("en-u-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

test.describe("turned-away report from a cancelled booking (brief 8.2, test 13.3)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "he-IL" });

  test("the guest reports with a screenshot from “הנסיעות שלי”; the admin sees it urgent, with the guest's choice, date and booking", async ({ page, browser, consoleErrors }) => {
    test.slow();
    const host = await createHost("E2E Phase3 Host");
    const listing = await createTestListing({ ownerId: host.id, title: `E2E Cancelled stay ${stamp()}` });
    const guest = await createTestUser({ name: "E2E Noa Guest" });
    const booking = await createCancelledBooking({ listingId: listing.id, guest, hostId: host.id });
    const details = `E2E turned away ${stamp()}: the host cancelled after seeing my Israeli number.`;
    const happened = dayBefore(booking.cancelledDay);

    await loginByEmail(page, emailOf(guest));
    // "הנסיעות שלי": the cancelled trip has "המארח ביטל? ספרו לנו", which opens the form on the trip page.
    await page.goto("/he/account/trips");
    await settle(page);
    await page.getByRole("link", { name: "המארח ביטל? ספרו לנו" }).click();
    await page.waitForURL(new RegExp(`/he/account/trips/${booking.code}\\?report=1`));
    const sheet = page.getByRole("dialog", { name: "דיווח על המארח" });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(booking.code);
    // The date starts on the day the host cancelled; the guest picks the day it really happened.
    const when = sheet.getByLabel("מתי זה קרה?");
    await expect(when).toHaveValue(booking.cancelledDay);
    await sheet.getByRole("radio", { name: "המארח ביטל בגלל מי שאני" }).click();
    await when.fill(happened);
    await sheet.getByRole("textbox", { name: /במילים שלכם/ }).fill(details);
    const [shot] = await makePhotos(1);
    await sheet.locator('input[type="file"]').setInputFiles({ name: "chat.jpg", mimeType: shot.mimeType, buffer: shot.buffer });
    await expect(sheet.getByRole("img", { name: "צילום מסך 1" })).toBeVisible({ timeout: 30_000 });
    await expect(sheet.getByText("מעלים…")).toHaveCount(0, { timeout: 30_000 });
    await sheet.getByRole("button", { name: "שליחת הדיווח" }).click();
    const thanks = page.getByRole("dialog", { name: "תודה שסיפרתם לנו" });
    await expect(thanks).toBeVisible();
    await expect(thanks).toContainText("המארח לא יודע שדיווחתם.");
    await thanks.getByRole("button", { name: "סגירה" }).first().click();
    await expect(page.getByRole("status").filter({ hasText: "דיווחתם על ההזמנה הזו" })).toBeVisible();
    expect(consoleErrors).toEqual([]);

    const [report] = await sql<{ id: string; kind: string; priority: string; status: string; reason: string; bookingId: string; targetUserId: string; happenedOn: string; files: number }>(
      `SELECT id, kind, priority, status, reason, "bookingId", "targetUserId", to_char("happenedOn", 'YYYY-MM-DD') AS "happenedOn", jsonb_array_length(attachments::jsonb) AS files
         FROM "Report" WHERE "reporterId" = $1`,
      [guest.id],
    );
    expect(report).toMatchObject({
      kind: "TURNED_AWAY",
      priority: "URGENT",
      status: "OPEN",
      reason: "CANCELLED_FOR_IDENTITY",
      bookingId: booking.id,
      targetUserId: host.id,
      happenedOn: happened,
      files: 1,
    });
    // The guest's confirmation, and the founder's email that links to the report.
    await expect.poll(() => outboxTemplates(emailOf(guest))).toContain("report_received");
    await expect
      .poll(async () => (await sql(`SELECT 1 FROM "EmailOutbox" WHERE template = 'report_admin' AND html LIKE $1`, [`%/admin/reports/${report.id}%`])).length)
      .toBeGreaterThan(0);

    // The screenshot is staff-only: the guest who sent it can't open it from the admin route.
    expect((await page.request.get(`/api/admin/reports/${report.id}/0`)).status()).toBe(404);

    // The admin: urgent in the turned-away tab, with the guest's choice, date, booking and screenshot.
    const admin = await openAs(browser, TEST_ADMIN_PHONE);
    await admin.page.goto("/en/admin/reports?tab=turnedAway");
    const row = admin.page.getByRole("listitem").filter({ hasText: details });
    await expect(row).toBeVisible();
    await expect(row.getByText("Urgent")).toBeVisible();
    await row.getByRole("link", { name: "Host cancelled because of who the guest is" }).click();
    await expect(admin.page.getByRole("heading", { level: 1, name: "Host cancelled because of who the guest is" })).toBeVisible();
    const main = admin.page.getByRole("main");
    await expect(main.getByText("Urgent").first()).toBeVisible();
    await expect(main.getByText(details)).toBeVisible();
    const fact = (label: string) => main.locator("dl > div").filter({ has: admin.page.locator("dt", { hasText: label }) }).locator("dd");
    await expect(fact("When it happened")).toHaveText(longDate(happened));
    await expect(fact("Booking number")).toHaveText(booking.code);
    await settle(admin.page);
    await main.getByRole("button", { name: "Show the screenshot" }).click();
    const image = main.getByRole("img", { name: "Screenshot 1 of 1" });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
    const file = await admin.page.request.get(`/api/admin/reports/${report.id}/0`);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-type"]).toMatch(/^image\/(jpeg|webp)/);
    expect(file.headers()["cache-control"]).toContain("no-store");
    await expect
      .poll(async () => (await sql(`SELECT 1 FROM "AuditLog" WHERE action = 'report.attachment_view' AND "targetId" = $1`, [report.id])).length)
      .toBeGreaterThan(0);
    expect(admin.consoleErrors).toEqual([]);
    await admin.context.close();

    // Back on "הנסיעות שלי", the trip says it was reported (no second report).
    await page.goto("/he/account/trips");
    await expect(page.getByText("דיווחתם על הביטול. הצוות שלנו בודק.")).toBeVisible();
    await expect(page.getByRole("link", { name: "המארח ביטל? ספרו לנו" })).toHaveCount(0);
  });
});

test.describe("admin home “דורש טיפול” (brief 9)", () => {
  /** What waits, counted straight from the database (the same rules as src/lib/admin/server/attention.ts). */
  async function waitingInDatabase() {
    const [row] = await sql<{ inReview: number; turnedAway: number; other: number }>(
      `SELECT (SELECT count(*) FROM "Listing" WHERE status = 'IN_REVIEW')::int AS "inReview",
              (SELECT count(*) FROM "Report" WHERE status = 'OPEN' AND kind = 'TURNED_AWAY')::int AS "turnedAway",
              (SELECT count(*) FROM "Report" WHERE status = 'OPEN' AND kind <> 'TURNED_AWAY')::int AS other`,
    );
    return row;
  }

  /** The number at the start of the block's row that links to `href` (0 when the row is not shown). */
  async function shownCount(page: Page, href: string) {
    const link = page.locator("section[aria-labelledby='attention-title']").locator(`a[href="${href}"]`);
    if ((await link.count()) === 0) return 0;
    const text = (await link.locator("span.font-medium").first().textContent()) ?? "";
    return Number(/\d+/.exec(text)?.[0] ?? Number.NaN);
  }

  test("the counts are the real ones, urgent first, and each row opens its queue", async ({ browser }) => {
    // At least one of each: a listing waiting for review, a turned-away report, a listing report.
    const host = await createHost("E2E Phase3 Lea");
    const waiting = await createTestListing({ ownerId: host.id, title: `E2E Attention waiting ${stamp()}`, status: "IN_REVIEW" });
    const live = await createTestListing({ ownerId: host.id, title: `E2E Attention live ${stamp()}` });
    const reporter = await createTestUser({ name: "E2E Reporter" });
    await createReport({ listingId: live.id, reporterId: reporter.id, reason: "WRONG_PRICE", details: "E2E attention: wrong price" });
    const turnedAway = `E2E attention turned away ${stamp()}`;
    await sql(
      `INSERT INTO "Report" (id, kind, "targetType", "listingId", "targetUserId", "reporterId", reason, details, priority, "happenedOn")
       VALUES ($1, 'TURNED_AWAY', 'USER', $2, $3, $4, 'REFUSED_OR_IGNORED', $5, 'URGENT', current_date)`,
      [newId(), live.id, host.id, reporter.id, turnedAway],
    );

    const { context, page, consoleErrors } = await openAs(browser, TEST_ADMIN_PHONE);
    // Other tests may add or close items meanwhile: compare page and database until they agree.
    await expect
      .poll(
        async () => {
          await page.goto("/en/admin");
          const shown = {
            inReview: await shownCount(page, "/en/admin/moderation"),
            turnedAway: await shownCount(page, "/en/admin/reports?tab=turnedAway"),
            other: await shownCount(page, "/en/admin/reports"),
          };
          const expected = await waitingInDatabase();
          return JSON.stringify(shown) === JSON.stringify(expected) ? "match" : `page ${JSON.stringify(shown)} · database ${JSON.stringify(expected)}`;
        },
        { timeout: 90_000, intervals: [500, 2_000, 5_000] },
      )
      .toBe("match");

    const block = page.locator("section[aria-labelledby='attention-title']");
    await expect(block.getByRole("heading", { name: "Needs attention" })).toBeVisible();
    // Urgent first: the turned-away row leads, with its "Urgent" tag.
    const first = block.getByRole("listitem").first();
    await expect(first).toContainText("turned-away report");
    await expect(first).toContainText("Urgent");
    await first.getByRole("link").click();
    await page.waitForURL(/\/en\/admin\/reports\?tab=turnedAway/);
    await expect(page.getByRole("listitem").filter({ hasText: turnedAway })).toBeVisible();
    await page.goto("/en/admin");
    await block.locator('a[href="/en/admin/moderation"]').click();
    await page.waitForURL(/\/en\/admin\/moderation$/);
    await expect(page.getByRole("link", { name: /^E2E Attention waiting/ })).toBeVisible();
    expect(await listingByPublicId(waiting.publicId)).toMatchObject({ status: "IN_REVIEW" });

    // The founder's language: the same block in Hebrew.
    await page.goto("/he/admin");
    await expect(page.locator("section[aria-labelledby='attention-title']").getByRole("heading", { name: "דורש טיפול" })).toBeVisible();
    expect(consoleErrors).toEqual([]);
    await context.close();
  });
});

test.describe("“ביקרנו במקום” badge (brief 8.3)", () => {
  test("set by the admin: on the listing page with the month, the first card tag and the filter; the internal note stays out of the public HTML", async ({ browser }) => {
    test.slow();
    const host = await createHost("E2E Phase3 Gil");
    const title = `E2E Visited flat ${stamp()}`;
    // In Mestia (no demo listings there), with kosher and Shabbat tags of its own (copied from a demo stay).
    const listing = await createTestListing({ ownerId: host.id, title });
    const note = `E2E internal note ${stamp()}: Dana visited with the host`;

    const admin = await openAs(browser, TEST_ADMIN_PHONE);
    await admin.page.goto(`/en/admin/badges?q=${listing.publicId}`);
    const row = admin.page.locator(`#found [data-badge-row="${listing.publicId}"]`);
    await expect(row).toContainText("No badge.");
    await settle(admin.page);
    await row.getByRole("button", { name: "Add a visit" }).click();
    const dialog = admin.page.getByRole("dialog", { name: "We visited" });
    await expect(dialog.getByLabel("Visit date")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
    // The note is required.
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Who visited? (internal note)").fill(note);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(admin.page.getByText("Badge added")).toBeVisible();
    await expect(dialog).toBeHidden();
    const [saved] = await sql<{ visitedAt: string | null; visitedNote: string | null }>(
      `SELECT to_char("visitedAt", 'YYYY-MM-DD') AS "visitedAt", "visitedNote" FROM "Listing" WHERE id = $1`,
      [listing.id],
    );
    expect(saved.visitedNote).toBe(note);
    expect(saved.visitedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await admin.page.goto("/en/admin/badges");
    await expect(admin.page.locator(`#visited [data-badge-row="${listing.publicId}"]`)).toContainText(note);
    expect(admin.consoleErrors).toEqual([]);

    // The public site, in Hebrew, for a visitor.
    const month = new Intl.DateTimeFormat("he-u-nu-latn", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${saved.visitedAt}T00:00:00Z`));
    const visitor = await openAs(browser, null);
    const page = visitor.page;
    await page.goto(`/he/listing/${listing.publicId}`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    const line = page.locator("[data-visited-badge]");
    await expect(line).toBeVisible();
    await expect(line).toContainText("ביקרנו במקום");
    await expect(line).toContainText(month);

    // The card: "ביקרנו במקום" is the first tag, and the 2-tag limit still holds.
    await page.goto("/he/search?city=mestia");
    const card = page.getByRole("article", { name: title });
    await expect(card).toBeVisible();
    const tag = card.getByRole("listitem").filter({ hasText: "ביקרנו במקום" });
    await expect(tag).toHaveCount(1);
    const tags = await tag.evaluate((li) => ({ first: li.parentElement?.firstElementChild === li, count: li.parentElement?.children.length ?? 0 }));
    expect(tags.first, "the visited tag comes first").toBe(true);
    expect(tags.count, "at most 2 tags").toBeLessThanOrEqual(2);

    // The filter: only visited places, ours among them.
    await page.goto("/he/search?visited=1");
    await expect(page.getByRole("article", { name: title })).toBeVisible();
    for (const result of await page.getByRole("article").all()) await expect(result).toContainText("ביקרנו במקום");

    // The internal note (and who entered it) never reaches the public HTML or its page data.
    for (const path of [`/he/listing/${listing.publicId}`, "/he/search?city=mestia", "/he/search?visited=1", `/en/listing/${listing.publicId}`]) {
      const html = await (await page.request.get(path)).text();
      expect(html, path).toContain(title);
      expect(html, path).not.toContain(note);
      expect(html, path).not.toContain("visitedNote");
      expect(html, path).not.toContain("visitedById");
    }
    expect(visitor.consoleErrors).toEqual([]);

    // The admin removes it (with a reason): it leaves the site at once.
    await admin.page.goto(`/en/admin/badges?q=${listing.publicId}`);
    await settle(admin.page);
    await admin.page.locator(`#found [data-badge-row="${listing.publicId}"]`).getByRole("button", { name: "Remove badge" }).click();
    const clear = admin.page.getByRole("alertdialog").or(admin.page.getByRole("dialog"));
    await clear.getByRole("textbox").fill("E2E: test over");
    await clear.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(admin.page.getByText("Badge removed")).toBeVisible();
    await page.goto(`/he/listing/${listing.publicId}`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.locator("[data-visited-badge]")).toHaveCount(0);
    expect(admin.consoleErrors).toEqual([]);
    await admin.context.close();
    await visitor.context.close();
  });
});

test("every new admin page and file route answers 404 to a signed-in user who is not staff", async ({ page }) => {
  const user = await createTestUser({ name: "E2E Not Staff" });
  const [booking] = await sql<{ id: string }>(`SELECT id FROM "Booking" ORDER BY "createdAt" LIMIT 1`);
  const [report] = await sql<{ id: string }>(`SELECT id FROM "Report" ORDER BY "createdAt" LIMIT 1`);
  const [listing] = await sql<{ id: string }>(`SELECT id FROM "Listing" WHERE "isDemo" LIMIT 1`);
  await loginByEmail(page, emailOf(user));

  const pages = [
    "/he/admin",
    "/en/admin",
    "/en/admin/badges",
    "/en/admin/flags",
    "/en/admin/flags?view=hosts",
    "/en/admin/bookings",
    "/en/admin/reference-prices",
    "/en/admin/reference-prices/new",
    "/en/admin/reports?tab=turnedAway",
    "/en/admin/outbox",
    `/en/admin/users/${user.id}`,
    `/en/admin/moderation/${listing.id}`,
    ...(booking ? [`/en/admin/bookings/${booking.id}`] : []),
    ...(report ? [`/en/admin/reports/${report.id}`] : []),
  ];
  for (const path of pages) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { level: 1 }), path).toBeVisible();
    await expect(page.locator("section[aria-labelledby='attention-title']"), path).toHaveCount(0);
  }
  // The staff-only file routes: report screenshots and (old) verification documents.
  for (const path of [`/api/admin/reports/${report?.id ?? "none"}/0`, "/api/admin/documents/none/0"]) {
    expect((await page.request.get(path)).status(), path).toBe(404);
  }
});
