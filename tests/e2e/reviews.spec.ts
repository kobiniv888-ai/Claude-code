import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, openAs, openAsTestUser, settle, test } from "./fixtures";
import { createTestListing, createTestUser, newId, sql } from "./helpers/db";
import { TEST_ADMIN_PHONE, verifyTwoFactor } from "./helpers/staff";

/**
 * Real reviews (round 3, brief 8.1), in Hebrew on a phone, with test-only rows (a test host, a
 * test guest named Dana, a test listing in Mestia and stays that already ended):
 *
 * 1. The guest opens the trip page of a completed stay, taps 5 stars in "איך הייתה השהייה?", writes
 *    the review and confirms that it is final → it shows on the listing as "Dana · <this month>",
 *    with no average (fewer than 3 reviews).
 * 2. The host replies once on /account/reviews; a second reply (from a page opened before the
 *    first) is refused. The host reports the review.
 * 3. The admin (real 2-step login) opens the report in the "ביקורות" tab and hides the review with a
 *    reason and a note → it is gone from the listing, the counters drop, the report is closed.
 * 4. With 3 visible reviews (test rows), the listing page and the card show the average.
 *
 * Every row belongs to the test users (phones in the e2e range), so the global teardown removes
 * them even after a crash; this spec also removes them itself.
 */

/**
 * Who hides the review: the run's test admin (global setup). A check run on its own (without the
 * global setup) passes its own staff account with 2-step login on in E2E_REVIEWS_ADMIN_PHONE.
 */
const ADMIN_PHONE = process.env.E2E_REVIEWS_ADMIN_PHONE || TEST_ADMIN_PHONE;
const PREFIX = `E2E reviews ${randomBytes(3).toString("hex")}`;
const TEXT = "דירה נקייה ושקטה, המארח קיבל אותנו בחום והסביר הכל על השכונה. נחזור בשמחה!";
const REPLY = "תודה רבה דנה, שמחנו לארח אתכם!";

/** "YYYY-MM-DD" in Georgia, `days` from today. */
function georgiaDay(days: number): string {
  return new Date(Date.now() + 4 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);
}

/** A booking number no booking has ("BT-" and 5 characters of the site's alphabet). */
async function freeBookingCode(): Promise<string> {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  for (;;) {
    const code = `BT-${Array.from(randomBytes(5), (b) => alphabet[b % alphabet.length]).join("")}`;
    if ((await sql(`SELECT 1 FROM "Booking" WHERE code = $1`, [code])).length === 0) return code;
  }
}

/** A completed short stay of `guestId` at the listing that checked out `daysAgo` days ago. */
async function completedStay(listingId: string, guestId: string, hostId: string, daysAgo = 2): Promise<{ id: string; code: string }> {
  const id = newId();
  const code = await freeBookingCode();
  await sql(
    `INSERT INTO "Booking" (id, code, "listingId", "guestUserId", "hostUserId", "checkIn", "checkOut", nights, adults, "nightlyPrice", subtotal, total,
       currency, "cancellationPolicy", status, "guestName", "guestPhone", locale, "rulesAcceptedAt", "messageToHost", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, 3, 2, 55, 165, 165, 'GEL', 'MODERATE', 'COMPLETED', 'Dana', '+995555990999', 'he', now(), $8, now())`,
    [id, code, listingId, guestId, hostId, georgiaDay(-daysAgo - 3), georgiaDay(-daysAgo), `${PREFIX}: test stay`],
  );
  return { id, code };
}

async function counters(listingId: string) {
  const [row] = await sql<{ reviewCount: number; ratingSum: number }>(`SELECT "reviewCount", "ratingSum" FROM "Listing" WHERE id = $1`, [listingId]);
  return row;
}

/** "נובמבר 2026": the month in Georgia, as the site writes it. */
function thisMonth(): string {
  return new Intl.DateTimeFormat("he-u-nu-latn", { month: "long", year: "numeric", timeZone: "Asia/Tbilisi" }).format(new Date());
}

async function hideDevOverlay(page: Page) {
  await page.addInitScript(() => {
    const hide = () => document.head.appendChild(Object.assign(document.createElement("style"), { textContent: "nextjs-portal{display:none!important}" }));
    if (document.head) hide();
    else document.addEventListener("DOMContentLoaded", hide);
  });
}

test.describe("reviews", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "he-IL" });

  const ids: { host?: string; guest?: string; listing?: string } = {};

  test.afterAll(async () => {
    if (!ids.listing) return;
    const reviews = await sql<{ id: string }>(`SELECT id FROM "Review" WHERE "listingId" = $1`, [ids.listing]);
    const reviewIds = reviews.map((r) => r.id);
    const reports = await sql<{ id: string }>(`SELECT id FROM "Report" WHERE "reviewId" = ANY($1)`, [reviewIds]);
    await sql(`DELETE FROM "AuditLog" WHERE "targetId" = ANY($1)`, [[...reviewIds, ...reports.map((r) => r.id)]]);
    await sql(`DELETE FROM "Report" WHERE id = ANY($1)`, [reports.map((r) => r.id)]);
    await sql(`DELETE FROM "Booking" WHERE "listingId" = $1`, [ids.listing]);
    await sql(`DELETE FROM "Listing" WHERE id = $1`, [ids.listing]);
    const users = [ids.host, ids.guest].filter(Boolean);
    await sql(`DELETE FROM "EmailOutbox" WHERE "to" IN (SELECT email FROM "User" WHERE id = ANY($1))`, [users]);
    await sql(`DELETE FROM "RateLimit" WHERE EXISTS (SELECT 1 FROM unnest($1::text[]) u WHERE key LIKE '%' || u || '%')`, [users]);
    await sql(`DELETE FROM "Session" WHERE "userId" = ANY($1)`, [users]);
    await sql(`DELETE FROM "User" WHERE id = ANY($1)`, [users]);
  });

  test("a guest reviews a completed stay; the host replies once and reports it; the admin hides it; 3 reviews show the average", async ({ browser }) => {
    test.slow();
    const host = await createTestUser({ name: "Giorgi E2E" });
    const guest = await createTestUser({ name: "Dana E2E" });
    ids.host = host.id;
    ids.guest = guest.id;
    const listing = await createTestListing({ ownerId: host.id, title: `${PREFIX} flat` });
    ids.listing = listing.id;
    const stay = await completedStay(listing.id, guest.id, host.id);

    // ── 1. The guest writes the review from the trip page ──
    const guestSession = await openAsTestUser(browser, guest);
    const page = guestSession.page;
    await hideDevOverlay(page);
    try {
      await page.goto(`/he/account/trips/${stay.code}`);
      await settle(page);
      const prompt = page.getByRole("region", { name: "איך הייתה השהייה?" });
      await expect(prompt).toBeVisible();
      await prompt.getByRole("link", { name: "5 כוכבים" }).click();
      await expect(page).toHaveURL(new RegExp(`/he/account/reviews/write/${stay.code}\\?rating=5`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("ביקורת על השהייה");
      await expect(page.getByRole("radio", { name: "5 כוכבים: מצוין" })).toBeChecked();
      await page.getByLabel("מה כדאי לאורחים הבאים לדעת?").fill("קצר מדי");
      await page.getByRole("button", { name: "פרסום הביקורת" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "קצרה מדי" })).toBeVisible();
      // Contact details are refused.
      await page.getByLabel("מה כדאי לאורחים הבאים לדעת?").fill(`${TEXT} התקשרו אליי: 0541234567`);
      await page.getByLabel("הבנתי שאי אפשר לערוך או למחוק את הביקורת").check();
      await page.getByRole("button", { name: "פרסום הביקורת" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "בלי מספרי טלפון" })).toBeVisible();
      await page.getByLabel("מה כדאי לאורחים הבאים לדעת?").fill(TEXT);
      await page.getByRole("button", { name: "פרסום הביקורת" }).click();
      await expect(page.getByRole("heading", { name: "תודה! הביקורת פורסמה" })).toBeVisible();
      expect(await counters(listing.id)).toEqual({ reviewCount: 1, ratingSum: 5 });

      // Once per booking: the trip page no longer asks, the form says it is done.
      await page.goto(`/he/account/trips/${stay.code}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("region", { name: "איך הייתה השהייה?" })).toHaveCount(0);

      // On the listing: "Dana · <month>", the text, and no average yet.
      await page.goto(`/he/listing/${listing.publicId}`);
      const reviews = page.locator("section#reviews");
      await expect(reviews.getByText(TEXT)).toBeVisible();
      await expect(reviews.getByText("Dana", { exact: true })).toBeVisible();
      await expect(reviews.getByText(thisMonth(), { exact: true })).toBeVisible();
      await expect(reviews.getByText("הדירוג הממוצע יופיע אחרי 3 ביקורות.")).toBeVisible();
      await expect(reviews.getByText(/\d\.\d מתוך 5/)).toHaveCount(0);
    } finally {
      await guestSession.context.close();
    }

    // ── 2. The host replies once, and reports the review ──
    const hostSession = await openAsTestUser(browser, host);
    const stale = await hostSession.context.newPage();
    try {
      await hideDevOverlay(hostSession.page);
      await hideDevOverlay(stale);
      const hostPage = hostSession.page;
      await hostPage.goto("/he/account/reviews");
      await stale.goto("/he/account/reviews");
      await settle(hostPage);
      await settle(stale);
      // Keyboard (a11y-4): opening the reply moves the focus into its field, "ביטול" gives it back
      // to the button, and an empty reply puts the focus back in the field with the message.
      const replyButton = hostPage.getByRole("button", { name: "תגובה לביקורת" });
      await replyButton.focus();
      await hostPage.keyboard.press("Enter");
      await expect(hostPage.getByLabel("התגובה הפומבית שלך")).toBeFocused();
      await hostPage.locator("form").getByRole("button", { name: "ביטול" }).click();
      await expect(replyButton).toBeFocused();
      await hostPage.keyboard.press("Enter");
      await hostPage.getByRole("button", { name: "פרסום התגובה" }).click();
      await expect(hostPage.getByRole("alert").filter({ hasText: "קצרה מדי" })).toBeVisible();
      await expect(hostPage.getByLabel("התגובה הפומבית שלך")).toBeFocused();
      await hostPage.getByLabel("התגובה הפומבית שלך").fill(REPLY);
      await hostPage.getByLabel("הבנתי שאי אפשר לערוך או למחוק את התגובה").check();
      await hostPage.getByRole("button", { name: "פרסום התגובה" }).click();
      await expect(hostPage.getByText(REPLY)).toBeVisible();
      await expect(hostPage.getByRole("button", { name: "תגובה לביקורת" })).toHaveCount(0);

      // A second reply (from a page opened before the first) is refused: replies are final.
      await stale.getByRole("button", { name: "תגובה לביקורת" }).click();
      await stale.getByLabel("התגובה הפומבית שלך").fill("תגובה שנייה, שלא אמורה להתפרסם");
      await stale.getByLabel("הבנתי שאי אפשר לערוך או למחוק את התגובה").check();
      await stale.getByRole("button", { name: "פרסום התגובה" }).click();
      await expect(stale.getByRole("alert").filter({ hasText: "כבר הגבתם על הביקורת הזו" })).toBeVisible();
      const [stored] = await sql<{ hostReply: string }>(`SELECT "hostReply" FROM "Review" WHERE "listingId" = $1`, [listing.id]);
      expect(stored.hostReply).toBe(REPLY);

      await hostPage.getByRole("button", { name: "דיווח על הביקורת" }).click();
      const sheet = hostPage.getByRole("dialog", { name: "דיווח על ביקורת" });
      await expect(sheet).toBeVisible();
      await sheet.getByText("פוגענית, מעליבה או מפלה").click();
      await sheet.getByRole("button", { name: "שליחת הדיווח" }).click();
      await expect(hostPage.getByRole("dialog", { name: "הדיווח נשלח" }).getByText("תודה. נבדוק את הביקורת ונעדכן אותך במייל.")).toBeVisible();
    } finally {
      await hostSession.context.close();
    }
    const [report] = await sql<{ id: string; listingId: string | null; targetUserId: string | null; status: string }>(
      `SELECT r.id, r."listingId", r."targetUserId", r.status FROM "Report" r JOIN "Review" v ON v.id = r."reviewId" WHERE v."listingId" = $1 AND r."targetType" = 'REVIEW'`,
      [listing.id],
    );
    // About the review only: never counted against a listing or a host.
    expect(report).toMatchObject({ listingId: null, targetUserId: null, status: "OPEN" });

    // ── 3. The admin hides it with a reason and a note ──
    const admin = await openAs(browser, ADMIN_PHONE);
    try {
      if (ADMIN_PHONE !== TEST_ADMIN_PHONE) await verifyTwoFactor(admin.page, "/en/admin", ADMIN_PHONE);
      await admin.page.goto("/en/admin/reports?tab=reviews");
      await expect(admin.page.locator(`a[href$="/admin/reports/${report.id}"]`)).toBeVisible();
      await admin.page.goto(`/en/admin/reports/${report.id}`);
      await expect(admin.page.getByText(TEXT)).toBeVisible();
      await admin.page.getByLabel("Reason").selectOption("offensive");
      await admin.page.getByLabel("Internal note (required)").fill("E2E: hidden by the reviews test");
      await admin.page.getByRole("button", { name: "Hide the review" }).click();
      await expect(admin.page.getByText("The review is hidden")).toBeVisible();
    } finally {
      await admin.context.close();
    }
    const [hidden] = await sql<{ hidden: boolean; hiddenReason: string }>(`SELECT hidden, "hiddenReason" FROM "Review" WHERE "listingId" = $1`, [listing.id]);
    expect(hidden.hidden).toBe(true);
    expect(hidden.hiddenReason).toMatch(/^offensive\n/);
    expect(await counters(listing.id)).toEqual({ reviewCount: 0, ratingSum: 0 });
    const [closed] = await sql<{ status: string; actionTaken: string }>(`SELECT status, "actionTaken" FROM "Report" WHERE id = $1`, [report.id]);
    expect(closed).toEqual({ status: "RESOLVED", actionTaken: "review_hidden" });

    // ── 4. Three visible reviews (test rows): the average on the listing page and the card ──
    for (const rating of [5, 4, 5]) {
      const extra = await completedStay(listing.id, guest.id, host.id, 3);
      await sql(
        `INSERT INTO "Review" (id, "bookingId", "listingId", "guestUserId", "hostUserId", rating, text, language, "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'he', now())`,
        [newId(), extra.id, listing.id, guest.id, host.id, rating, `${PREFIX}: נקי, שקט ונוח, ממליצים בחום`],
      );
    }
    // The site keeps the counters in the review's own transaction; these test rows set them the same way.
    await sql(
      `UPDATE "Listing" SET "reviewCount" = (SELECT count(*) FROM "Review" WHERE "listingId" = $1 AND NOT hidden),
         "ratingSum" = (SELECT coalesce(sum(rating), 0) FROM "Review" WHERE "listingId" = $1 AND NOT hidden) WHERE id = $1`,
      [listing.id],
    );
    expect(await counters(listing.id)).toEqual({ reviewCount: 3, ratingSum: 14 });

    const visitor = await openAs(browser, null);
    try {
      await visitor.page.goto(`/he/listing/${listing.publicId}`);
      const reviews = visitor.page.locator("section#reviews");
      // The hidden review is gone; the three others show with their average.
      await expect(reviews.getByText(TEXT)).toHaveCount(0);
      await expect(reviews.getByText("4.7 מתוך 5")).toBeVisible();
      await expect(reviews.getByText("3 ביקורות").first()).toBeVisible();
      await expect(visitor.page.getByRole("link", { name: /דירוג 4\.7 מתוך 5/ })).toBeVisible();

      await visitor.page.goto("/he/search?city=mestia");
      const card = visitor.page.locator("article[data-listing-card]").filter({ hasText: `${PREFIX} flat` });
      await expect(card).toBeVisible();
      await expect(card.getByText("דירוג 4.7 מתוך 5, 3 ביקורות")).toBeAttached();
      await expect(card.getByText("4.7", { exact: true })).toBeVisible();
    } finally {
      await visitor.context.close();
    }
  });
});
