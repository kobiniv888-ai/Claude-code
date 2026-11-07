import type { Locator } from "@playwright/test";
import { expect, openAs, openAsTestUser, settle, test } from "./fixtures";
import { DEMO } from "./helpers/auth";
import { createTestUser, sql } from "./helpers/db";

/**
 * The trip page (round 3, brief 7.1) in Hebrew: the demo guest Noa books a Thursday→Saturday stay
 * (so it includes a Friday night) at Yossi's demo short stay #89 in Tbilisi, whose host keeps
 * Shabbat → the trip page shows the itemized total, the exact address, "פתיחה ב-Google Maps" /
 * "פתיחה ב-Waze" with the coordinates, the candle-lighting and Havdalah times and "המארח לא עונה
 * בשבת", the safety note and the emergency numbers link → "הוספה ליומן" downloads an .ics with
 * the stay (UTC times, CRLF), the address and the booking number → in production (service worker)
 * "שמירה לשימוש בלי אינטרנט" keeps the page and it opens offline → another account gets "not
 * found" (404) for the page and the file → the guest cancels with the cancel button.
 *
 * The booking's message to the host starts with "E2E ", so the global teardown removes it even
 * after a crash. #89 is used by no other spec.
 */

const PUBLIC_ID = 89;
const MESSAGE = "E2E trip page test, please ignore";
const SAFETY = "בית לא גובה תשלום. לעולם אל תשלמו מראש בקישור ששלחו לכם.";

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * A Thursday → Saturday stay (Thursday and Friday nights) 3–11 weeks ahead, clear of every block
 * and of the listing's holiday prices (their minimum stay could refuse two nights).
 */
async function freeFridayStay(listingId: string): Promise<{ checkIn: string; checkOut: string }> {
  const busy = await sql<{ start: string; end: string }>(
    `SELECT to_char("startDate", 'YYYY-MM-DD') AS start, to_char("endDate", 'YYYY-MM-DD') AS "end" FROM "AvailabilityBlock" WHERE "listingId" = $1
     UNION ALL
     SELECT to_char("startDate", 'YYYY-MM-DD'), to_char("endDate", 'YYYY-MM-DD') FROM "DatePrice" WHERE "listingId" = $1`,
    [listingId],
  );
  const today = new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10);
  for (let offset = 20; offset <= 80; offset++) {
    const checkIn = addDays(today, offset);
    if (new Date(`${checkIn}T00:00:00Z`).getUTCDay() !== 4) continue;
    const checkOut = addDays(checkIn, 2);
    if (busy.every((b) => b.end <= checkIn || b.start >= checkOut)) return { checkIn, checkOut };
  }
  throw new Error(`No free Thursday–Saturday stay on demo listing #${PUBLIC_ID}: re-seed the demo data.`);
}

/** Visible text without the bidi isolates (U+2066–U+2069) around amounts and times. */
async function plainText(locator: Locator): Promise<string> {
  return (await locator.innerText()).replace(/[⁦-⁩]/g, "");
}

test.describe("trip page", () => {
  test("Friday-night stay: total, address, Maps/Waze, candle lighting, safety note, .ics, offline, not found for others, cancel", async ({ browser }) => {
    test.slow();
    const [listing] = await sql<{ id: string; address: string; lat: number; lng: number }>(
      `SELECT id, address, lat, lng FROM "Listing" WHERE "publicId" = $1 AND "bookingMode" = 'INSTANT' AND status = 'LIVE'`,
      [PUBLIC_ID],
    );
    expect(listing, `demo listing #${PUBLIC_ID} must be LIVE and INSTANT (npm run db:seed)`).toBeTruthy();
    const { checkIn, checkOut } = await freeFridayStay(listing.id);

    const guest = await openAs(browser, DEMO.guest);
    const page = guest.page;
    try {
      // ── 1. Book the stay ("אישור הזמנה") ──
      await page.goto(`/he/listing/${PUBLIC_ID}/book?checkIn=${checkIn}&checkOut=${checkOut}&adults=2`);
      await settle(page);
      await page.getByLabel("הודעה למארח (לא חובה)").fill(MESSAGE);
      await page.getByRole("checkbox", { name: /קראתי ואני מסכים/ }).check();
      await page.getByRole("button", { name: "אישור הזמנה" }).filter({ visible: true }).first().click();
      await expect(page).toHaveURL(/\/he\/account\/trips\/BT-[A-Z0-9]{5}\?booked=1/, { timeout: 60_000 });
      const code = decodeURIComponent(new URL(page.url()).pathname.split("/").pop() ?? "");
      const tripUrl = `/he/account/trips/${code}`;
      const [booking] = await sql<{ status: string; total: string; nights: number }>(`SELECT status, total::text, nights FROM "Booking" WHERE code = $1`, [code]);
      expect(booking).toMatchObject({ status: "CONFIRMED", nights: 2 });

      // ── 2. The trip page ──
      await page.goto(tripUrl);
      await settle(page);
      const main = page.locator("main");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("פרטי ההזמנה");
      const text = await plainText(main);
      // The itemized total (Booking.priceLines): the nights ("$85 × לילה אחד", the Friday night at the weekend price) and the total.
      expect(text).toMatch(/× (לילה אחד|שני לילות)/);
      expect(text).toContain(String(Math.round(Number(booking.total))));
      await expect(main).toContainText(listing.address);
      const point = `${listing.lat.toFixed(6)},${listing.lng.toFixed(6)}`;
      await expect(page.getByRole("link", { name: "פתיחה ב-Google Maps" })).toHaveAttribute("href", new RegExp(`destination=${point}`));
      await expect(page.getByRole("link", { name: "פתיחה ב-Waze" })).toHaveAttribute("href", new RegExp(`ll=${point}&navigate=yes`));
      // Friday night → Shabbat: candle lighting and Havdalah for Tbilisi, and the host's Shabbat note.
      const shabbat = page.getByRole("region", { name: "שבת בזמן השהייה" });
      await expect(shabbat).toBeVisible();
      await expect(shabbat).toContainText("הדלקת נרות");
      await expect(shabbat).toContainText("הבדלה");
      await expect(shabbat).toContainText(/\d{1,2}:\d{2}/);
      await expect(shabbat).toContainText("המארח לא עונה בשבת");
      // The safety note, word for word, and the emergency numbers.
      await expect(page.getByText(SAFETY, { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "מספרי חירום" })).toHaveAttribute("href", /\/safety#emergency$/);
      // The host's contact buttons.
      await expect(page.getByRole("link", { name: /וואטסאפ|התקשרות/ }).first()).toBeVisible();

      // ── 3. "הוספה ליומן": the .ics and the Google Calendar link ──
      const icsHref = await page.getByRole("link", { name: "הוספה ליומן" }).getAttribute("href");
      const ics = await guest.context.request.get(icsHref ?? "");
      expect(ics.status()).toBe(200);
      expect(ics.headers()["content-type"]).toContain("text/calendar");
      const body = await ics.text();
      expect(body).toMatch(new RegExp(`DTSTART:${checkIn.replace(/-/g, "")}T\\d{6}Z\\r\\n`));
      expect(body).toContain(`UID:booking-${code}@`);
      expect(body).toContain("LOCATION:");
      expect(body.replace(/\r\n /g, "")).toContain(code);
      expect(body.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/); // CRLF only
      await expect(page.getByRole("link", { name: "Google Calendar" })).toHaveAttribute("href", /^https:\/\/calendar\.google\.com\/calendar\/render\?/);

      // ── 4. "שמירה לשימוש בלי אינטרנט" (only with the service worker, i.e. production) ──
      const save = page.getByRole("button", { name: "שמירה לשימוש בלי אינטרנט" });
      const unsupported = page.getByText("הדפדפן הזה לא שומר עמודים לשימוש בלי אינטרנט", { exact: false });
      await expect
        .poll(async () => ((await unsupported.isVisible()) ? "unsupported" : (await save.isEnabled().catch(() => false)) ? "ready" : "waiting"), { timeout: 20_000 })
        .not.toBe("waiting");
      if (await save.isEnabled().catch(() => false)) {
        await save.click();
        await expect(page.getByText("העמוד שמור במכשיר הזה", { exact: false })).toBeVisible();
        const saved = await page.evaluate(async (path) => {
          const cache = await caches.open("bayit-trips");
          return !!(await cache.match(path));
        }, tripUrl);
        expect(saved).toBe(true);
        // Offline: the saved copy opens (the service worker serves it when the network fails).
        // Errors while offline (prefetches that cannot reach the server) are not the page's.
        const errorsBefore = guest.consoleErrors.length;
        await guest.context.setOffline(true);
        try {
          await page.reload();
          await expect(page.locator("main")).toContainText(code);
          await expect(page.getByText(SAFETY, { exact: true })).toBeVisible();
          await expect(page.getByText("אין חיבור לאינטרנט", { exact: false }).first()).toBeVisible();
        } finally {
          await guest.context.setOffline(false);
        }
        await page.goto(tripUrl);
        await settle(page);
        guest.consoleErrors.splice(errorsBefore);
      }

      // ── 5. Another account: "not found" for the page and the calendar file ──
      const stranger = await openAsTestUser(browser, await createTestUser());
      try {
        // (Account pages stream, so the status is 200 with a "noindex" not-found page.)
        await stranger.page.goto(tripUrl);
        await expect(stranger.page.locator("main").getByText("לא מצאנו את ההזמנה")).toBeVisible();
        await expect(stranger.page.locator("main")).not.toContainText(listing.address);
        await expect(stranger.page.locator(`[data-offline-trip="${code}"]`)).toHaveCount(0);
        expect((await stranger.context.request.get(icsHref ?? "")).status()).toBe(404);
      } finally {
        await stranger.context.close();
      }

      // ── 6. The guest cancels ──
      await page.getByRole("button", { name: "ביטול ההזמנה" }).click();
      const sheet = page.getByRole("dialog", { name: "לבטל את ההזמנה?" });
      await expect(sheet).toBeVisible();
      await sheet.getByRole("radio", { name: "שינוי בתוכניות" }).check();
      await sheet.getByRole("button", { name: "ביטול ההזמנה" }).click();
      await expect(page.getByText("ההזמנה בוטלה. המארח קיבל הודעה.")).toBeVisible();
      await expect
        .poll(async () => (await sql<{ status: string }>(`SELECT status FROM "Booking" WHERE code = $1`, [code]))[0]?.status)
        .toBe("CANCELLED_BY_GUEST");
      await page.goto(tripUrl);
      await expect(page.getByRole("region", { name: "שבת בזמן השהייה" })).toHaveCount(0);
      expect((await guest.context.request.get(icsHref ?? "")).status()).toBe(404);
      expect(guest.consoleErrors).toEqual([]);
    } finally {
      await guest.context.close();
    }
  });
});
