import type { Page } from "@playwright/test";
import { expect, openAs, settle, test } from "./fixtures";
import { createTestListing, createTestUser, newId, sql } from "./helpers/db";

/**
 * Round 3, phase 1: booking alerts and hotels (founder's answers 3 and 4).
 * - A hotel without an active room type stays contact-only: "שאלה למארח", never instant booking
 *   (round 3, phase 4: hotels are booked by room type, tests/e2e/hotel-booking.spec.ts).
 * - A host's alert settings show email, Telegram ("בקרוב" while the site has no bot) and browser
 *   notifications.
 * - Instant booking needs a channel that confirms delivery (email or Telegram). A host whose only
 *   channel left is browser notifications gets "שאלה למארח".
 * Every listing and host here is a test row (removed by the global teardown).
 */

const ASK = "שאלה למארח";
const CHOOSE_DATES = "בחירת תאריכים";

/** Two nights next month, as YYYY-MM-DD. */
function nextMonthStay(): { checkIn: string; checkOut: string } {
  const now = new Date();
  const checkIn = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 10));
  const checkOut = new Date(checkIn);
  checkOut.setUTCDate(checkOut.getUTCDate() + 2);
  return { checkIn: checkIn.toISOString().slice(0, 10), checkOut: checkOut.toISOString().slice(0, 10) };
}

/** A visitor (signed out) opens the listing page in Hebrew. */
async function openListing(page: Page, publicId: number) {
  await page.goto(`/he/listing/${publicId}`);
  await page.waitForURL(new RegExp(`/he/listing/${publicId}-`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("E2E");
  await settle(page);
}

async function expectInstant(page: Page) {
  await expect(page.getByRole("button", { name: CHOOSE_DATES }).filter({ visible: true }).first()).toBeVisible();
}

async function expectAskOnly(page: Page) {
  await expect(page.getByRole("button", { name: ASK }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: CHOOSE_DATES })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "הזמנה", exact: true })).toHaveCount(0);
}

test("a hotel without an active room type offers 'שאלה למארח', never instant booking, even when its owner's alerts work", async ({ browser }) => {
  const owner = await createTestUser({ name: "E2E Hotel Owner" });
  const stamp = Date.now().toString(36);
  // Control: the same owner's short stay takes instant bookings (their email alerts work).
  const shortStay = await createTestListing({ ownerId: owner.id, title: `E2E Owner short stay ${stamp}` });
  // A hotel saved with instant booking on, but with no room type (hotels are booked by room type).
  const hotel = await createTestListing({ ownerId: owner.id, title: `E2E Family hotel ${stamp}` });
  await sql(`UPDATE "Listing" SET "dealType" = 'HOTEL_ROOM', "propertyType" = 'HOTEL', "bookingMode" = 'INSTANT' WHERE id = $1`, [hotel.id]);

  const visitor = await openAs(browser, null);
  await openListing(visitor.page, shortStay.publicId);
  await expectInstant(visitor.page);

  await openListing(visitor.page, hotel.publicId);
  await expectAskOnly(visitor.page);

  // A direct link to the booking review can't book the hotel either.
  const { checkIn, checkOut } = nextMonthStay();
  await visitor.page.goto(`/he/listing/${hotel.publicId}/book?checkIn=${checkIn}&checkOut=${checkOut}&adults=2`);
  await expect(visitor.page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(visitor.page.getByRole("button", { name: "אישור הזמנה" })).toHaveCount(0);
  expect(visitor.consoleErrors).toEqual([]);
  await visitor.context.close();
});

test("alert settings show email, Telegram (soon) and browser notifications; push alone turns instant booking into 'שאלה למארח'", async ({ browser }) => {
  const host = await createTestUser({ name: "E2E Push Host" });
  await sql(`UPDATE "User" SET "firstName" = 'Dana', locale = 'he' WHERE id = $1`, [host.id]);
  const listing = await createTestListing({ ownerId: host.id, title: `E2E Push-only host flat ${Date.now().toString(36)}` });

  // Before: the host's email alerts work (the outbox counts in test mode), so guests book instantly.
  const visitor = await openAs(browser, null);
  await openListing(visitor.page, listing.publicId);
  await expectInstant(visitor.page);

  // The host's settings: the three channels.
  const { context, page, consoleErrors } = await openAs(browser, host.phone);
  await page.goto("/he/account/settings#booking-alerts");
  const section = page.locator("#booking-alerts");
  await expect(section.getByRole("heading", { name: "התראות על הזמנות" })).toBeVisible();
  await expect(section.getByRole("status")).toContainText("הזמנה מיידית פעילה");
  const row = (name: string) => section.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 3, name, exact: true }) });
  await expect(row("מייל")).toContainText("מאשר קבלה");
  await expect(row("מייל")).toContainText(`${host.phone.slice(1)}@e2e.bayit.invalid`);
  // No TELEGRAM_BOT_TOKEN on this server: Telegram says "soon".
  await expect(row("טלגרם")).toContainText("בקרוב");
  await expect(row("טלגרם")).toContainText("הבוט של בית בטלגרם עוד לא מוכן");
  await expect(row("התראות בדפדפן ובאפליקציה")).toContainText("לבד היא לא מספיקה להזמנה מיידית");
  await expect(section).toContainText("התראות ב־SMS ובוואטסאפ מתוכננות כאפשרות בתשלום.");

  // A phone with notifications on (what "הפעלה במכשיר הזה" saves; a test browser can't reach a real push service).
  await sql(
    `INSERT INTO "PushSubscription" (id, "userId", endpoint, p256dh, auth, "userAgent") VALUES ($1, $2, $3, $4, $5, 'E2E phone')`,
    [newId(), host.id, `https://fcm.googleapis.com/fcm/send/e2e-${newId()}`, "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U", "tBHItJI5svbpez7KI4CCXg"],
  );
  await page.reload();
  await settle(page);
  await expect(row("התראות בדפדפן ובאפליקציה")).toContainText("פעיל במכשיר אחד");

  // The host switches email off: browser notifications are the only channel left.
  await row("מייל").getByRole("switch", { name: "התראות במייל" }).click();
  await expect(section.getByRole("status")).toContainText("הזמנה מיידית כבויה כרגע");
  await expect(section.getByRole("status")).toContainText("התראות בדפדפן לבד לא מספיקות");
  await expect
    .poll(async () => {
      const [user] = await sql<{ prefs: { alerts?: { channels?: Record<string, boolean> } } | null }>(
        `SELECT "notificationPrefs" AS prefs FROM "User" WHERE id = $1`,
        [host.id],
      );
      return user?.prefs?.alerts?.channels?.email;
    })
    .toBe(false);
  expect(consoleErrors).toEqual([]);
  await context.close();

  // Guests now ask the host instead of booking.
  await openListing(visitor.page, listing.publicId);
  await expectAskOnly(visitor.page);
  expect(visitor.consoleErrors).toEqual([]);
  await visitor.context.close();
});
