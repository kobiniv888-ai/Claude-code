import type { Locator, Page } from "@playwright/test";
import { expect, openAsTestUser, settle, test } from "./fixtures";
import { createTestListing, createTestUser, newId, sql } from "./helpers/db";
import { acceptTermsBox, acceptTermsBoxIfShown } from "./helpers/terms";

/**
 * Hotel booking by room type (round 3, founder's answer 3), in Hebrew, on a TEST-ONLY hotel (an
 * "E2E …" listing of a test host in Mestia, with two test room types; the global teardown removes
 * it even after a crash, and this file deletes its rows at the end):
 * - a guest picks dates, sees the free room types with prices, picks "E2E Double" (3 rooms) and
 *   2 rooms for 4 adults, and books instantly → the trip page shows the room type and the rooms;
 * - the host's calendar for that room type shows 1 of 3 rooms free on those nights;
 * - a second tab that asked for 2 more rooms of the same type is refused ("נתפסו הרגע"): only one
 *   is left, and the picker says so;
 * - a dated search still finds the hotel with 2 of its rooms booked, but not once the whole hotel is
 *   closed on one of the nights (phase-4 hardening, search-1);
 * - the guest cancels → the 3 rooms are free again.
 */

/** A calendar day `days` after `day` (YYYY-MM-DD, UTC arithmetic). */
function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Two weekday nights next month (the listing calendar shows this month and the next one). */
function nextMonthNights(): { checkIn: string; checkOut: string } {
  const today = new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10);
  const [year, month] = today.split("-").map(Number);
  const nextMonth = `${month === 12 ? year + 1 : year}-${String((month % 12) + 1).padStart(2, "0")}`;
  for (let day = 5; day <= 25; day++) {
    const checkIn = `${nextMonth}-${String(day).padStart(2, "0")}`;
    const weekday = new Date(`${checkIn}T00:00:00Z`).getUTCDay();
    if (weekday >= 1 && weekday <= 3) return { checkIn, checkOut: addDays(checkIn, 2) };
  }
  throw new Error("no weekday nights next month");
}

const confirmButton = (page: Page) => page.getByRole("button", { name: "אישור הזמנה" }).filter({ visible: true }).first();

async function openDatesSheet(page: Page, publicId: number): Promise<Locator> {
  await page.goto(`/he/listing/${publicId}`);
  await settle(page);
  await page
    .getByRole("button", { name: /^(הגעה|בחירת תאריכים)/ })
    .filter({ visible: true })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: "תאריכים ואורחים" });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe("hotel booking by room type", () => {
  const ids = { host: "", guest: "", listing: "", double: "", suite: "" };
  let publicId = 0;

  test.beforeAll(async () => {
    const host = await createTestUser({ name: "E2E Hotel Host" });
    const guest = await createTestUser({ name: "E2E Hotel Guest" });
    ids.host = host.id;
    ids.guest = guest.id;
    await sql(`UPDATE "User" SET "firstName" = 'Dana' WHERE id = $1`, [guest.id]);
    const listing = await createTestListing({ ownerId: host.id, title: "E2E Test hotel by room type", status: "LIVE" });
    ids.listing = listing.id;
    publicId = listing.publicId;
    // A hotel booked by room type: no price of its own, instant booking, no cleaning fee.
    await sql(
      `UPDATE "Listing" SET "dealType" = 'HOTEL_ROOM', "propertyType" = 'HOTEL', "pricePeriod" = 'NIGHT', price = NULL, "priceUsd" = NULL,
         "cleaningFee" = NULL, "weekendPrice" = NULL, "minStayNights" = 1, "maxGuests" = NULL, "bookingMode" = 'INSTANT',
         "paymentMethodsAtCheckIn" = ARRAY['cash'], "weeklyDiscountPct" = NULL, "monthlyDiscountPct" = NULL, "isDemo" = false
       WHERE id = $1`,
      [listing.id],
    );
    const [{ currency }] = await sql<{ currency: string }>(`SELECT currency::text AS currency FROM "Listing" WHERE id = $1`, [listing.id]);
    ids.double = newId();
    ids.suite = newId();
    for (const room of [
      { id: ids.double, name: "E2E Double", price: 100, quantity: 3, maxGuests: 2, sort: 0 },
      { id: ids.suite, name: "E2E Suite", price: 250, quantity: 1, maxGuests: 4, sort: 1 },
    ]) {
      await sql(
        `INSERT INTO "RoomType" (id, "listingId", names, price, currency, "pricePeriod", "maxGuests", "bedsDouble", quantity, active, "sortOrder", "updatedAt")
         VALUES ($1, $2, $3::jsonb, $4, $5::"Currency", 'NIGHT', $6, 1, $7, true, $8, now())`,
        [room.id, listing.id, JSON.stringify({ he: room.name, en: room.name, ru: room.name, ar: room.name, ka: room.name }), room.price, currency, room.maxGuests, room.quantity, room.sort],
      );
    }
  });

  test.afterAll(async () => {
    const bookings = await sql<{ id: string }>(`SELECT id FROM "Booking" WHERE "listingId" = $1`, [ids.listing]);
    const bookingIds = bookings.map((b) => b.id);
    if (bookingIds.length) {
      await sql(`DELETE FROM "AuditLog" WHERE "targetId" = ANY($1)`, [bookingIds]);
      await sql(`DELETE FROM "AvailabilityBlock" WHERE "bookingId" = ANY($1)`, [bookingIds]);
      await sql(`DELETE FROM "Booking" WHERE id = ANY($1)`, [bookingIds]);
    }
    if (ids.listing) await sql(`DELETE FROM "Listing" WHERE id = $1`, [ids.listing]);
    const users = [ids.host, ids.guest].filter(Boolean);
    if (users.length) {
      await sql(`DELETE FROM "AuditLog" WHERE "actorId" = ANY($1)`, [users]);
      await sql(`DELETE FROM "Session" WHERE "userId" = ANY($1)`, [users]);
      await sql(`DELETE FROM "User" WHERE id = ANY($1)`, [users]);
    }
  });

  test("a guest books 2 rooms of one type; the calendar shows them; more than are left is refused; cancelling frees them", async ({ browser }) => {
    test.slow();
    const { checkIn, checkOut } = nextMonthNights();
    const guest = await openAsTestUser(browser, { id: ids.guest });
    const page = guest.page;

    // ── 1. Dates, 4 adults, and the free room types with their prices ──
    const sheet = await openDatesSheet(page, publicId);
    await sheet.locator(`[data-day="${checkIn}"]`).click();
    await sheet.locator(`[data-day="${checkOut}"]`).click();
    for (let i = 0; i < 3; i++) await sheet.getByRole("button", { name: "הוספה: מבוגרים" }).click();
    const double = sheet.getByRole("radio", { name: /E2E Double/ });
    await expect(sheet.getByText("נשארו 3 חדרים")).toBeVisible();
    // A hotel can't be booked before a room type is picked.
    await expect(sheet.getByText("כדי להמשיך, בחרו סוג חדר.")).toBeVisible();
    await double.check();
    // 4 adults don't fit one double: the picker asks for 2 rooms.
    await expect(sheet.getByText(/צריך לפחות שני חדרים/)).toBeVisible();
    await sheet.getByRole("button", { name: "הוספה: מספר חדרים" }).click();
    await expect(sheet.getByText("עד 4 אורחים בשני חדרים")).toBeVisible();
    const sheetPrice = sheet.getByRole("region", { name: "פירוט המחיר" });
    await expect(sheetPrice).toContainText("400"); // 2 nights × 100 × 2 rooms
    await sheet.getByRole("link", { name: "המשך להזמנה" }).click();

    // ── 2. The review page keeps the room type and the rooms ──
    await expect(page).toHaveURL(new RegExp(`/book\\?.*room=${ids.double}.*rooms=2`));
    await settle(page);
    await expect(page.getByRole("radio", { name: /E2E Double/ })).toBeChecked();
    await expect(page.locator("main")).toContainText("400");
    const reviewUrl = page.url();
    // A second tab on the same nights and rooms, opened before the booking (it will lose).
    const late = await guest.context.newPage();
    await late.goto(reviewUrl);
    await settle(late);

    await page.getByRole("checkbox", { name: /קראתי ואני מסכים/ }).check();
    await acceptTermsBox(page); // the "18 or older + Terms" box (SECURITY_REPORT 15.11.b/c)
    await confirmButton(page).click();

    // ── 3. The trip page shows the room type and the 2 rooms ──
    await expect(page).toHaveURL(/\/he\/account\/trips\/BT-[A-Z0-9]{5}\?booked=1/, { timeout: 60_000 });
    const code = decodeURIComponent(new URL(page.url()).pathname.split("/").pop() ?? "");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ההזמנה אושרה!");
    await expect(page.locator("main")).toContainText("E2E Double");
    await expect(page.locator("main")).toContainText("שני חדרים");
    const [booking] = await sql<{ id: string; rooms: number; roomTypeId: string; total: string; blockRooms: number; blockRoomType: string }>(
      `SELECT b.id, b.rooms, b."roomTypeId", b.total::text, a.rooms AS "blockRooms", a."roomTypeId" AS "blockRoomType"
         FROM "Booking" b JOIN "AvailabilityBlock" a ON a."bookingId" = b.id WHERE b.code = $1`,
      [code],
    );
    expect(booking).toMatchObject({ rooms: 2, roomTypeId: ids.double, total: "400.00", blockRooms: 2, blockRoomType: ids.double });

    // ── 4. More rooms than are left: the late tab is refused, and the picker shows 1 left ──
    await late.getByRole("checkbox", { name: /קראתי ואני מסכים/ }).check();
    await acceptTermsBoxIfShown(late); // the "18 or older + Terms" box (SECURITY_REPORT 15.11.b/c)
    await confirmButton(late).click();
    await expect(late.getByText("החדרים האלה נתפסו הרגע")).toBeVisible();
    await expect(late.getByText("נשאר חדר אחד").first()).toBeVisible();
    await late.close();
    const [{ count }] = await sql<{ count: string }>(`SELECT count(*)::text AS count FROM "Booking" WHERE "listingId" = $1 AND status = 'CONFIRMED'`, [ids.listing]);
    expect(count).toBe("1");

    // ── 4b. A dated search still finds the hotel: 2 rooms booked never hide it (search-1) ──
    await page.goto(`/he/search?city=mestia&deal=hotels&checkIn=${checkIn}&checkOut=${checkOut}&view=list`);
    await settle(page);
    const hotelCard = page.locator("main [data-listing-card]").filter({ hasText: "E2E Test hotel by room type" });
    await expect(hotelCard.first()).toBeVisible();
    // ...but closing the whole hotel on one of those nights does (a block without a room type).
    const closure = newId();
    await sql(
      `INSERT INTO "AvailabilityBlock" (id, "listingId", "startDate", "endDate", source, "createdAt") VALUES ($1, $2, $3::date, $4::date, 'OWNER', now())`,
      [closure, ids.listing, checkIn, addDays(checkIn, 1)],
    );
    await page.reload();
    await settle(page);
    await expect(hotelCard).toHaveCount(0);
    await sql(`DELETE FROM "AvailabilityBlock" WHERE id = $1`, [closure]);

    // ── 5. The host's calendar for the room type: 1 of 3 rooms free, 2 booked ──
    const host = await openAsTestUser(browser, { id: ids.host });
    await host.page.goto(`/he/account/listings/${ids.listing}/calendar`);
    await settle(host.page);
    // The scope switch is a group of native radios (a11y-hotel-chips-1).
    await expect(host.page.getByRole("radio", { name: /E2E Double/ })).toBeChecked();
    const night = host.page.locator(`[data-day="${checkIn}"]`);
    await expect(night).toHaveAttribute("aria-label", /1 מתוך 3 חדרים פנויים/);
    await expect(night).toHaveAttribute("aria-label", /2 חדרים מוזמנים/);
    // The suite is untouched: one booking never blocks the whole hotel.
    await host.page.getByRole("radio", { name: /E2E Suite/ }).locator("xpath=ancestor::label[1]").click();
    await expect(host.page.getByRole("radio", { name: /E2E Suite/ })).toBeChecked();
    // One room of this type: "החדר פנוי" (plural-correct, i18n-1), never "1 מתוך 1 חדרים".
    await expect(host.page.locator(`[data-day="${checkIn}"]`)).toHaveAttribute("aria-label", /החדר פנוי/);
    // The whole hotel: the rooms left that night and the rooms booked (ui-hotel-2), never just "פנוי".
    await host.page.getByRole("radio", { name: "כל המלון" }).locator("xpath=ancestor::label[1]").click();
    await expect(host.page.locator(`[data-day="${checkIn}"]`)).toHaveAttribute("aria-label", /2 מתוך 4 חדרים פנויים, 2 חדרים מוזמנים/);

    // ── 6. The guest cancels → the rooms are free again ──
    await page.goto(`/he/account/trips/${code}`);
    await page.getByRole("button", { name: "ביטול ההזמנה" }).click();
    const cancel = page.getByRole("dialog", { name: "לבטל את ההזמנה?" });
    await cancel.getByRole("radio", { name: "שינוי בתוכניות" }).check();
    await cancel.getByRole("button", { name: "ביטול ההזמנה" }).click();
    await expect(page.getByText("ההזמנה בוטלה. המארח קיבל הודעה.")).toBeVisible();
    await expect.poll(async () => (await sql<{ n: string }>(`SELECT count(*)::text AS n FROM "AvailabilityBlock" WHERE "bookingId" = $1`, [booking.id]))[0].n).toBe("0");
    await host.page.reload();
    await settle(host.page);
    await expect(host.page.locator(`[data-day="${checkIn}"]`)).toHaveAttribute("aria-label", /3 מתוך 3 חדרים פנויים/);

    expect(guest.consoleErrors).toEqual([]);
    expect(host.consoleErrors).toEqual([]);
    await host.context.close();
    await guest.context.close();
  });
});
