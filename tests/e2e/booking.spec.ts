import type { Locator, Page } from "@playwright/test";
import { expect, openAs, openAsTestUser, settle, test } from "./fixtures";
import { DEMO } from "./helpers/auth";
import { createTestUser, sql } from "./helpers/db";
import { openAddress } from "./helpers/field-crypto";

/**
 * Booking end to end (brief 5.5 and 5.6, docs/redesign-2/booking.md), in Hebrew (the main
 * language): a fresh test guest books two free nights at Yossi's demo short stay #91 ($70 a night,
 * $20 cleaning, at least 2 nights, no weekend price, flexible policy) → the confirmation shows the
 * code, the exact address and the host's contact → "הנסיעות שלי" lists it → Yossi sees it in
 * "הזמנות לנכסים שלי" and on the calendar → the same nights can't be booked again (a friendly
 * message, never an error page) → the private iCal export holds the nights → the guest cancels and
 * the nights are free again. The booking's message to the host starts with "E2E ", so the global
 * teardown (cleanupTestData) removes it with its block, audit rows and emails even after a crash.
 *
 * Round 3 (brief 6.3, section 13.2): the guest sees the itemized total ("$70 × שני לילות", "דמי
 * ניקיון") in the dates sheet, on the review page and on the trip page; a second test adds a
 * test-only holiday price and a weekly discount on another demo short stay (#104) and follows the
 * lines (date-price nights with their note, "הנחה לשבוע −10%") from the review page into the
 * booking, the trip page and the host's booking page, plus the holiday price's minimum stay.
 */

const PUBLIC_ID = 91;
const MESSAGE = "E2E booking test, please ignore";

/** A calendar day `days` after `day` (YYYY-MM-DD, UTC arithmetic: no time zone drift). */
function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Two free nights next month (the listing calendar shows this month and the next one), clear of
 * every host, iCal and booking block, starting on a weekday so the price has no weekend nights.
 */
async function freeNights(listingId: string): Promise<{ checkIn: string; checkOut: string }> {
  const blocks = await sql<{ start: string; end: string }>(
    `SELECT to_char("startDate", 'YYYY-MM-DD') AS start, to_char("endDate", 'YYYY-MM-DD') AS "end" FROM "AvailabilityBlock" WHERE "listingId" = $1`,
    [listingId],
  );
  // Today in Georgia (UTC+4 all year).
  const today = new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10);
  const [year, month] = today.split("-").map(Number);
  const nextMonth = `${month === 12 ? year + 1 : year}-${String((month % 12) + 1).padStart(2, "0")}`;
  for (let day = 5; day <= 25; day++) {
    const checkIn = `${nextMonth}-${String(day).padStart(2, "0")}`;
    const checkOut = addDays(checkIn, 2);
    const weekday = new Date(`${checkIn}T00:00:00Z`).getUTCDay();
    if (weekday === 4 || weekday === 5 || weekday === 6) continue; // no Friday/Saturday night
    if (blocks.every((b) => b.end <= checkIn || b.start >= checkOut)) return { checkIn, checkOut };
  }
  throw new Error("No two free weekday nights next month on the demo listing: re-seed the demo data.");
}

/** The visible text of an element without the bidi isolates (U+2066–U+2069) around amounts and notes. */
async function plainText(locator: Locator): Promise<string> {
  return (await locator.innerText()).replace(/[\u2066-\u2069]/g, "");
}

/** The visible one of the "אישור הזמנה" buttons (the review page has one in the column and one in the sticky bar). */
const confirmButton = (page: Page) => page.getByRole("button", { name: "אישור הזמנה" }).filter({ visible: true }).first();

/** Opens the listing's "dates and guests" sheet. */
async function openDatesSheet(page: Page): Promise<Locator> {
  await page.goto(`/he/listing/${PUBLIC_ID}`);
  await settle(page);
  // The desktop box's "הגעה" field (phones: the sticky bar's "בחירת תאריכים") opens the sheet.
  await page
    .getByRole("button", { name: /^(הגעה|בחירת תאריכים)/ })
    .filter({ visible: true })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: "תאריכים ואורחים" });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe("booking", () => {
  test("guest books free nights → confirmation, trips, host list and calendar, iCal → guest cancels", async ({ browser }) => {
    test.slow();
    const [seeded] = await sql<{ id: string; icalToken: string; addressEnc: string | null }>(
      `SELECT id, "icalToken", "addressEnc" FROM "Listing" WHERE "publicId" = $1 AND "bookingMode" = 'INSTANT' AND status = 'LIVE'`,
      [PUBLIC_ID],
    );
    expect(seeded, `demo listing #${PUBLIC_ID} must be LIVE and INSTANT (npm run db:seed)`).toBeTruthy();
    // The exact address is stored encrypted (SECURITY_REPORT 12.3.c): opened with the test keys.
    const listing = { id: seeded.id, icalToken: seeded.icalToken, address: openAddress(seeded.addressEnc)! };
    const { checkIn, checkOut } = await freeNights(listing.id);
    const icsDay = checkIn.replace(/-/g, "");

    // A fresh test guest per test (a test phone, removed by the clean-up): at most 2 upcoming
    // bookings per verified phone (founder's decision 8), so a shared account would make the
    // booking tests depend on each other and on the seeded demo trips.
    const guest = await openAsTestUser(browser, await createTestUser({ name: "E2E Guest Noa" }));
    const page = guest.page;

    // ── 1. Dates and guests: pick the two nights in the sheet, the total shows at once ──
    const sheet = await openDatesSheet(page);
    await sheet.locator(`[data-day="${checkIn}"]`).click();
    await sheet.locator(`[data-day="${checkOut}"]`).click();
    const sheetPrice = sheet.getByRole("region", { name: "פירוט המחיר" });
    await expect(sheetPrice).toContainText("160"); // 2 × $70 + $20 cleaning
    // The itemized lines (round 3, brief 6.3).
    expect(await plainText(sheetPrice)).toContain("$70 × שני לילות");
    expect(await plainText(sheetPrice)).toContain("דמי ניקיון");
    await sheet.getByRole("link", { name: "המשך להזמנה" }).click();

    // ── 2. Review page "אישור הזמנה" ──
    await expect(page).toHaveURL(new RegExp(`/he/listing/${PUBLIC_ID}(-[^/?]*)?/book\\?.*checkIn=${checkIn}.*checkOut=${checkOut}`));
    await settle(page);
    await expect(page.getByText("לא גובה תשלום", { exact: false }).first()).toBeVisible();
    await expect(page.locator("main")).toContainText("160");
    expect(await plainText(page.locator("main"))).toContain("$70 × שני לילות");
    const reviewUrl = page.url();

    // A second tab on the same nights, opened before the booking (it will lose the race).
    const late = await guest.context.newPage();
    await late.goto(reviewUrl);
    await settle(late);
    await expect(confirmButton(late)).toBeEnabled();

    // Confirm without accepting the house rules → a clear error, no booking.
    await confirmButton(page).click();
    await expect(page.getByRole("alert").filter({ hasText: "יש לאשר את כללי הבית." })).toBeVisible();

    // The host raises the price while the guest is on this page → no booking at a price the guest
    // never saw: a clear message and the new total (hardening B2), then back to $70.
    await page.getByRole("checkbox", { name: /קראתי ואני מסכים/ }).check();
    await sql(`UPDATE "Listing" SET price = 75 WHERE id = $1`, [listing.id]);
    try {
      await confirmButton(page).click();
      await expect(page.getByText(/המארח עדכן את המחיר/).first()).toBeVisible();
      await expect(page.locator("main")).toContainText("170"); // 2 × $75 + $20
      expect(await sql(`SELECT 1 FROM "Booking" WHERE "listingId" = $1 AND "messageToHost" IS NULL AND "createdAt" > now() - interval '5 minutes'`, [listing.id])).toHaveLength(0);
    } finally {
      await sql(`UPDATE "Listing" SET price = 70 WHERE id = $1`, [listing.id]);
    }
    await page.goto(reviewUrl);
    await settle(page);
    await expect(page.locator("main")).toContainText("160");

    await page.getByLabel("הודעה למארח (לא חובה)").fill(MESSAGE);
    await page.getByRole("checkbox", { name: /קראתי ואני מסכים/ }).check();
    await confirmButton(page).click();

    // ── 3. Confirmation = the trip page ──
    await expect(page).toHaveURL(/\/he\/account\/trips\/BT-[A-Z0-9]{5}\?booked=1/, { timeout: 60_000 });
    const code = decodeURIComponent(new URL(page.url()).pathname.split("/").pop() ?? "");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ההזמנה אושרה!");
    await expect(page.locator("main")).toContainText(code);
    await expect(page.locator("main")).toContainText(listing.address);
    await expect(page.getByRole("link", { name: /וואטסאפ|התקשרות/ }).first()).toBeVisible();
    // The trip page shows the lines the guest confirmed (Booking.priceLines).
    expect(await plainText(page.locator("main"))).toContain("$70 × שני לילות");
    const [booking] = await sql<{ id: string; status: string; total: string; nights: number; messageToHost: string }>(
      `SELECT id, status, total::text, nights, "messageToHost" FROM "Booking" WHERE code = $1`,
      [code],
    );
    expect(booking).toMatchObject({ status: "CONFIRMED", total: "160.00", nights: 2, messageToHost: MESSAGE });
    const [stored] = await sql<{ lines: { kind: string; nights?: number; price?: number; amount: number }[] }>(
      `SELECT "priceLines" AS lines FROM "Booking" WHERE id = $1`,
      [booking.id],
    );
    expect(stored.lines).toEqual([
      { kind: "weekday", nights: 2, price: 70, amount: 140 },
      { kind: "cleaning", price: 20, amount: 20 },
    ]);
    // The host was alerted on a channel that confirms delivery (round 3): email, accepted by the
    // outbox in test mode. A booking no confirming channel accepted would have been undone.
    const [alerted] = await sql<{ via: string | null; at: Date | null }>(`SELECT "hostNotifiedVia" AS via, "hostNotifiedAt" AS at FROM "Booking" WHERE id = $1`, [booking.id]);
    expect(alerted.via).toBe("email");
    expect(alerted.at).not.toBeNull();
    const [hostEmail] = await sql<{ count: string }>(
      `SELECT count(*)::text AS count FROM "EmailOutbox" WHERE template = 'booking_new_host' AND html LIKE '%' || $1 || '%'`,
      [code],
    );
    expect(Number(hostEmail.count)).toBeGreaterThanOrEqual(1);

    // "הוספה ליומן": the guest's own .ics with the stay.
    const addToCalendar = page.getByRole("link", { name: "הוספה ליומן" });
    const icsHref = await addToCalendar.getAttribute("href");
    const ics = await guest.context.request.get(icsHref ?? "");
    expect(ics.status()).toBe(200);
    // Round 3 (brief 7.1): a timed event from the check-in time (UTC), or all-day when "גמיש".
    expect(await ics.text()).toMatch(new RegExp(`DTSTART(;VALUE=DATE)?:${icsDay}`));

    // ── 4. "הנסיעות שלי" lists it ──
    await page.goto("/he/account/trips");
    await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(/הנסיעות שלי/);
    await expect(page.locator(`a[href$="/account/trips/${code}"]`).first()).toBeVisible();

    // ── 5. The same nights again: the late tab fails gracefully ("נתפסו הרגע"), no second booking ──
    await late.getByRole("checkbox", { name: /קראתי ואני מסכים/ }).check();
    await confirmButton(late).click();
    await expect(late.getByText("התאריכים האלה נתפסו הרגע")).toBeVisible();
    await expect(late).toHaveURL(/\/book\?/);
    await late.close();
    const [{ count }] = await sql<{ count: string }>(
      `SELECT count(*)::text AS count FROM "Booking" WHERE "listingId" = $1 AND status = 'CONFIRMED' AND "checkIn" < $3::date AND "checkOut" > $2::date`,
      [listing.id, checkIn, checkOut],
    );
    expect(count).toBe("1");
    // …and the listing calendar now shows the nights as taken.
    const after = await openDatesSheet(page);
    await expect(after.locator(`[data-day="${checkIn}"]`)).toHaveAttribute("aria-label", /תפוס/);
    await expect(after.locator(`[data-day="${checkIn}"]`)).toHaveAttribute("aria-disabled", "true");

    // ── 6. The host: "הזמנות לנכסים שלי", the booking details and the calendar ──
    const host = await openAs(browser, DEMO.ownerYossi);
    await host.page.goto("/he/account/host-bookings");
    const row = host.page.locator(`a[href$="/account/host-bookings/${code}"]`).first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(host.page).toHaveURL(new RegExp(`/he/account/host-bookings/${code}$`));
    await expect(host.page.locator("main")).toContainText(MESSAGE);
    await host.page.goto(`/he/account/listings/${listing.id}/calendar`);
    await expect(host.page.locator(`[data-day="${checkIn}"]`)).toHaveAttribute("aria-label", new RegExp(code));

    // ── 7. The private iCal export holds the reservation (dates only) ──
    const feed = await host.context.request.get(`/api/ical/${listing.icalToken}.ics`);
    expect(feed.status()).toBe(200);
    const feedText = await feed.text();
    expect(feedText).toMatch(new RegExp(`DTSTART;VALUE=DATE:${icsDay}[\\s\\S]*?SUMMARY:Reserved`));
    expect(feedText).not.toContain(MESSAGE);
    await host.context.close();

    // ── 8. The guest cancels → the nights are free again ──
    await page.goto(`/he/account/trips/${code}`);
    await page.getByRole("button", { name: "ביטול ההזמנה" }).click();
    const cancel = page.getByRole("dialog", { name: "לבטל את ההזמנה?" });
    await expect(cancel).toBeVisible();
    await cancel.getByRole("radio", { name: "שינוי בתוכניות" }).check();
    await cancel.getByRole("button", { name: "ביטול ההזמנה" }).click();
    await expect(page.getByText("ההזמנה בוטלה. המארח קיבל הודעה.")).toBeVisible();
    await expect
      .poll(async () => (await sql<{ status: string }>(`SELECT status FROM "Booking" WHERE code = $1`, [code]))[0]?.status)
      .toBe("CANCELLED_BY_GUEST");
    const [{ blocks }] = await sql<{ blocks: string }>(`SELECT count(*)::text AS blocks FROM "AvailabilityBlock" WHERE "bookingId" = $1`, [booking.id]);
    expect(blocks).toBe("0");
    const freed = await openDatesSheet(page);
    await expect(freed.locator(`[data-day="${checkIn}"]`)).not.toHaveAttribute("aria-disabled", "true");
    const feedAfter = await guest.context.request.get(`/api/ical/${listing.icalToken}.ics`);
    expect(await feedAfter.text()).not.toContain(`DTSTART;VALUE=DATE:${icsDay}`);

    expect(guest.consoleErrors).toEqual([]);
    await guest.context.close();
  });

  test("holiday price and weekly discount: the itemized lines from the review page to the booking (brief 6.3)", async ({ browser }) => {
    test.slow();
    // Demo short stay #104: $75 a night, $20 cleaning, at least 2 nights, no weekend price.
    const HOLIDAY_ID = 104;
    const [listing] = await sql<{ id: string; ownerId: string; weekly: number | null; monthly: number | null }>(
      `SELECT id, "ownerId", "weeklyDiscountPct" AS weekly, "monthlyDiscountPct" AS monthly FROM "Listing" WHERE "publicId" = $1 AND "bookingMode" = 'INSTANT' AND status = 'LIVE'`,
      [HOLIDAY_ID],
    );
    expect(listing, `demo listing #${HOLIDAY_ID} must be LIVE and INSTANT (npm run db:seed)`).toBeTruthy();

    // Seven free nights two months ahead, Sunday to Sunday (no clash with the first test's dates).
    const blocks = await sql<{ start: string; end: string }>(
      `SELECT to_char("startDate", 'YYYY-MM-DD') AS start, to_char("endDate", 'YYYY-MM-DD') AS "end" FROM "AvailabilityBlock" WHERE "listingId" = $1`,
      [listing.id],
    );
    const today = new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10);
    let checkIn = addDays(`${today.slice(0, 7)}-01`, 62);
    while (new Date(`${checkIn}T00:00:00Z`).getUTCDay() !== 0 || !blocks.every((b) => b.end <= checkIn || b.start >= addDays(checkIn, 7))) {
      checkIn = addDays(checkIn, 1);
    }
    const checkOut = addDays(checkIn, 7);
    // A test-only holiday price on Monday and Tuesday night, at least 3 nights, with a note.
    const datePriceId = `e2e-dp-${Date.now().toString(36)}`;
    await sql(
      `INSERT INTO "DatePrice" (id, "listingId", "startDate", "endDate", price, "minNights", label, "updatedAt")
       VALUES ($1, $2, $3::date, $4::date, 90, 3, '{"he": "E2E חג"}'::jsonb, now())`,
      [datePriceId, listing.id, addDays(checkIn, 1), addDays(checkIn, 3)],
    );
    await sql(`UPDATE "Listing" SET "weeklyDiscountPct" = 10, "monthlyDiscountPct" = NULL WHERE id = $1`, [listing.id]);
    // A fresh test guest per test (a test phone, removed by the clean-up): at most 2 upcoming
    // bookings per verified phone (founder's decision 8), so a shared account would make the
    // booking tests depend on each other and on the seeded demo trips.
    const guest = await openAsTestUser(browser, await createTestUser({ name: "E2E Guest Noa" }));
    const page = guest.page;
    try {
      // ── The holiday price's own minimum stay: 2 nights touching it are refused, with its dates and note ──
      await page.goto(`/he/listing/${HOLIDAY_ID}/book?checkIn=${addDays(checkIn, 2)}&checkOut=${addDays(checkIn, 4)}&adults=2`);
      await settle(page);
      await expect(page.locator("main")).toContainText("המארח מקבל הזמנות של 3 לילות לפחות");
      expect(await plainText(page.locator("main"))).toContain("(E2E חג)");

      // ── Seven nights: 5 at $75, 2 holiday nights at $90, 10% off the nights, cleaning ──
      await page.goto(`/he/listing/${HOLIDAY_ID}/book?checkIn=${checkIn}&checkOut=${checkOut}&adults=2`);
      await settle(page);
      const price = page.getByRole("region", { name: "פירוט המחיר" }).filter({ visible: true }).first();
      await expect(price).toContainText("519.50"); // 375 + 180 − 55.50 + 20
      const lines = await plainText(price);
      for (const text of ["$75 × 5 לילות", "$90 × שני לילות (E2E חג)", "הנחה לשבוע −10%", "−$55.50", "דמי ניקיון", "$519.50"]) {
        expect(lines, text).toContain(text);
      }

      await page.getByLabel("הודעה למארח (לא חובה)").fill("E2E holiday price booking test, please ignore");
      await page.getByRole("checkbox", { name: /קראתי ואני מסכים/ }).check();
      await confirmButton(page).click();
      await expect(page).toHaveURL(/\/he\/account\/trips\/BT-[A-Z0-9]{5}\?booked=1/, { timeout: 60_000 });
      const code = decodeURIComponent(new URL(page.url()).pathname.split("/").pop() ?? "");
      // (The account pages stream in after a short "טוען…": wait for the trip itself.)
      await expect(page.locator("main")).toContainText("519.50");
      const trip = await plainText(page.locator("main"));
      for (const text of ["$90 × שני לילות (E2E חג)", "הנחה לשבוע −10%", "$519.50"]) expect(trip, text).toContain(text);

      // The server priced it line by line and copied the lines and the discount into the booking.
      const [booking] = await sql<{ id: string; total: string; subtotal: string; discount: string; lines: { kind: string; amount: number }[] }>(
        `SELECT id, total::text, subtotal::text, discount::text, "priceLines" AS lines FROM "Booking" WHERE code = $1`,
        [code],
      );
      expect(booking).toMatchObject({ total: "519.50", subtotal: "555.00", discount: "55.50" });
      expect(booking.lines.map((l) => [l.kind, l.amount])).toEqual([
        ["weekday", 375],
        ["date_price", 180],
        ["discount", -55.5],
        ["cleaning", 20],
      ]);

      // The host sees the same lines on the booking's page.
      // (A session without a login code: the site checks at most 30 codes an hour per address.)
      const host = await openAsTestUser(browser, { id: listing.ownerId });
      await host.page.goto(`/he/account/host-bookings/${code}`);
      await expect(host.page.locator("main")).toContainText("519.50");
      const hostText = await plainText(host.page.locator("main"));
      for (const text of ["$90 × שני לילות (E2E חג)", "הנחה לשבוע −10%", "$519.50"]) expect(hostText, text).toContain(text);
      await host.context.close();

      // The guest cancels (the nights are free again for the other tests).
      await page.goto(`/he/account/trips/${code}`);
      await page.getByRole("button", { name: "ביטול ההזמנה" }).click();
      const cancel = page.getByRole("dialog", { name: "לבטל את ההזמנה?" });
      await cancel.getByRole("radio", { name: "שינוי בתוכניות" }).check();
      await cancel.getByRole("button", { name: "ביטול ההזמנה" }).click();
      await expect(page.getByText("ההזמנה בוטלה. המארח קיבל הודעה.")).toBeVisible();
      expect(guest.consoleErrors).toEqual([]);
    } finally {
      await sql(`DELETE FROM "DatePrice" WHERE id = $1`, [datePriceId]);
      await sql(`UPDATE "Listing" SET "weeklyDiscountPct" = $2, "monthlyDiscountPct" = $3 WHERE id = $1`, [listing.id, listing.weekly, listing.monthly]);
      await guest.context.close();
    }
  });
});
