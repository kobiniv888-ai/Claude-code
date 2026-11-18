import { createHmac } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { expect, openAsTestUser, settle, test } from "./fixtures";
import { createTestUser, sql } from "./helpers/db";
import { openAddress, openPin } from "./helpers/field-crypto";
import { acceptTermsBox } from "./helpers/terms";

/**
 * The trip page (round 3, brief 7.1) in Hebrew: a fresh test guest books a Thursday→Saturday stay
 * (so it includes a Friday night) at Yossi's demo short stay #89 in Tbilisi, whose host keeps
 * Shabbat → the trip page shows the itemized total, the exact address, "פתיחה ב-Google Maps" /
 * "פתיחה ב-Waze" with the coordinates, the candle-lighting and Havdalah times and "המארח לא עונה
 * בשבת", the safety note and the emergency numbers link → "הוספה ליומן" downloads an .ics with
 * the stay (UTC times, CRLF), the address and the booking number → in production (service worker)
 * "שמירה לשימוש בלי אינטרנט" keeps the page and it opens offline → another account gets "not
 * found" (404) for the page and the file → the guest cancels with the cancel button (and the
 * saved copy goes). A second test: a copy saved on a device goes when the session ends or another
 * account signs in there (the guard on every page, phase-5 hardening privacy-1).
 *
 * The booking's message to the host starts with "E2E ", so the global teardown removes it even
 * after a crash. #89 is used by no other spec.
 */

const PUBLIC_ID = 89;
const MESSAGE = "E2E trip page test, please ignore";
// The founder's exact warning (SECURITY_REPORT 14.2.b).
const SAFETY = "בית לא גובה תשלום. לעולם אל תשלמו מראש בקישור או בהעברה. משלמים למארח כשמגיעים.";

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
    const [row] = await sql<{ id: string; addressEnc: string | null; pinEnc: string | null }>(
      `SELECT id, "addressEnc", "pinEnc" FROM "Listing" WHERE "publicId" = $1 AND "bookingMode" = 'INSTANT' AND status = 'LIVE'`,
      [PUBLIC_ID],
    );
    expect(row, `demo listing #${PUBLIC_ID} must be LIVE and INSTANT (npm run db:seed)`).toBeTruthy();
    // The exact address and pin are stored encrypted (SECURITY_REPORT 12.3.c): opened with the test keys.
    const pin = openPin(row.pinEnc)!;
    const listing = { id: row.id, address: openAddress(row.addressEnc)!, lat: pin.lat, lng: pin.lng };
    const { checkIn, checkOut } = await freeFridayStay(listing.id);

    // A fresh test guest (at most 2 upcoming bookings per verified phone, founder's decision 8).
    const guest = await openAsTestUser(browser, await createTestUser({ name: "E2E Guest Noa" }));
    const page = guest.page;
    try {
      // ── 1. Book the stay ("אישור הזמנה") ──
      await page.goto(`/he/listing/${PUBLIC_ID}/book?checkIn=${checkIn}&checkOut=${checkOut}&adults=2`);
      await settle(page);
      await page.getByLabel("הודעה למארח (לא חובה)").fill(MESSAGE);
      await page.getByRole("checkbox", { name: /קראתי ואני מסכים/ }).check();
      await acceptTermsBox(page); // the "18 or older + Terms" box (SECURITY_REPORT 15.11.b/c)
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
      // (Inside the page: the footer has its own "מספרי חירום" link.)
      await expect(main.getByRole("link", { name: "מספרי חירום" })).toHaveAttribute("href", /\/safety#emergency$/);
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
      // Founder's answer (10), 9 Nov 2026: the exact address and pin stay OUT of the calendar file
      // (LOCATION is the city; no GEO line), and out of the Google Calendar link.
      const unfolded = body.replace(/\r\n /g, "").replace(/\\([,;\\])/g, "$1");
      const street = listing.address.split(",")[0].trim();
      expect(unfolded).not.toContain(listing.address);
      expect(unfolded).not.toContain(street);
      expect(unfolded).not.toMatch(/^GEO:/m);
      expect(unfolded).not.toContain(listing.lat.toFixed(4));
      expect(unfolded).not.toContain(listing.lng.toFixed(4));
      const googleHref = decodeURIComponent((await page.getByRole("link", { name: "Google Calendar" }).getAttribute("href")) ?? "").replace(/\+/g, " ");
      expect(googleHref).not.toContain(street);
      expect(googleHref).not.toContain(listing.lat.toFixed(4));
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
        // The network answers nothing while the device says it is online (a hotel Wi-Fi without
        // internet): the copy opens and says it is the saved copy, with "load the latest".
        // The service worker asks for the page through navigation preload, which the browser sends
        // itself and Playwright cannot route: switched off here, so the worker's own fetch() is
        // the request that fails (the worker uses either, public/sw.js).
        const preload = (on: boolean) =>
          page.evaluate(async (enable) => {
            const registration = await navigator.serviceWorker.ready;
            if (!registration.navigationPreload) return;
            if (enable) await registration.navigationPreload.enable();
            else await registration.navigationPreload.disable();
          }, on);
        const abort = (route: { abort: (code: string) => Promise<void> }) => route.abort("internetdisconnected");
        await preload(false);
        await guest.context.route(`**${tripUrl}`, abort);
        try {
          await page.reload();
          await expect(page.getByText("זה העותק ששמרתם", { exact: false }).first()).toBeVisible();
          await expect(page.getByRole("button", { name: "טעינת העמוד העדכני" })).toBeVisible();
        } finally {
          await guest.context.unroute(`**${tripUrl}`, abort);
          await preload(true);
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
        // The page's HTML itself (what the service worker reads) carries the "gone" mark, so a copy
        // saved by another account on this device is deleted (a streamed notFound() would not).
        expect(await (await stranger.context.request.get(tripUrl)).text()).toContain('data-offline-trip-gone="1"');
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
      // A cancelled trip can't be kept offline: the copy saved above is gone, and nothing offers it.
      await expect(page.getByRole("button", { name: "שמירה לשימוש בלי אינטרנט" })).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => caches.has("bayit-trips"))).toBe(false);
      expect(guest.consoleErrors).toEqual([]);
    } finally {
      await guest.context.close();
    }
  });

  // privacy-1: a copy belongs to the account that saved it.
  test("a copy saved on this device goes when the session ends or another account signs in", async ({ browser }) => {
    const salt = process.env.HASH_SALT;
    test.skip(!salt, "HASH_SALT is not set (.env): the owner key can't be computed here");
    const user = await createTestUser();
    const ownerOf = (id: string) => createHmac("sha256", salt ?? "").update(`offline-trips:${id}`, "utf8").digest("hex").slice(0, 24);
    const signedIn = await openAsTestUser(browser, user);
    const page = signedIn.page;
    /** Puts a copy into the cache the way the trip page saves it (the page's own address pattern). */
    const seed = (p: Page, entries: { path: string; owner: string }[]) =>
      p.evaluate(async (list) => {
        const cache = await caches.open("bayit-trips");
        for (const e of list) await cache.put(e.path, new Response("<div>EXACT ADDRESS + HOST PHONE</div>", { headers: { "Content-Type": "text/html" } }));
        const trips = list.map((e) => ({ ...e, code: e.path.slice(-8), title: "x", checkIn: "2099-01-01", checkOut: "2099-01-03", status: "CONFIRMED", savedAt: new Date().toISOString(), keepUntil: "2099-01-10", version: "x" }));
        await cache.put("/offline-trips.json", new Response(JSON.stringify({ trips }), { headers: { "Content-Type": "application/json" } }));
      }, entries);
    const paths = (p: Page) =>
      p.evaluate(async () => {
        if (!(await caches.has("bayit-trips"))) return null;
        const index = await (await caches.open("bayit-trips")).match("/offline-trips.json");
        return index ? ((await index.json()) as { trips: { path: string }[] }).trips.map((t) => t.path) : [];
      });
    try {
      await page.goto("/he");
      await settle(page);
      // Another account's copy (it saved on this device, then this account signed in) and this account's own.
      const mine = "/he/account/trips/BT-22222";
      const theirs = "/he/account/trips/BT-33333";
      await seed(page, [
        { path: theirs, owner: "ffffffffffffffffffffffff" },
        { path: mine, owner: ownerOf(user.id) },
      ]);
      await page.reload();
      await settle(page);
      await expect.poll(() => paths(page)).toEqual([mine]);
      // The session ends somewhere else (expired, "log out of all devices", a suspension, the
      // account deleted from another device): the next page load online deletes the whole cache.
      await sql(`DELETE FROM "Session" WHERE "userId" = $1`, [user.id]);
      await page.reload();
      await settle(page);
      await expect.poll(() => paths(page)).toBeNull();
    } finally {
      await signedIn.context.close();
    }
    // Logging out on the device itself ("התנתקות" on the account page) deletes this account's copy
    // too, before the home page opens (gate, phase-5 hardening).
    const again = await openAsTestUser(browser, user);
    try {
      await again.page.goto("/he/account");
      await settle(again.page);
      await seed(again.page, [{ path: "/he/account/trips/BT-44444", owner: ownerOf(user.id) }]);
      expect(await paths(again.page)).toEqual(["/he/account/trips/BT-44444"]);
      await again.page.getByRole("button", { name: "התנתקות", exact: true }).click();
      await again.page.waitForURL(/\/he\/?$/);
      await expect(again.page.getByText("התנתקתם")).toBeVisible();
      expect(await paths(again.page)).toBeNull();
    } finally {
      await again.context.close();
    }
  });
});
