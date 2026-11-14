import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { expect, openAs, settle, test } from "./fixtures";
import { loginByEmail } from "./helpers/auth";
import { BASE_URL } from "./helpers/env";
import { createTestListing, createTestUser, newId, sql, TEST_EMAIL_DOMAIN } from "./helpers/db";

/**
 * Round 3, phase 2 together, in Hebrew (the main language): the lighter home page (brief 4), the
 * menu, the footer and the check-in pickers (brief 3). Test users and listings are removed by the
 * global teardown (their "Recently viewed" and saved rows go with the user).
 *
 * Sign-ins use email codes (the way people log in on the real site): phone codes are limited to 20
 * an hour per address, and the rest of the suite already uses most of them.
 */

/** A test user's email address (helpers/db.ts createTestUser). */
const emailOf = (user: { phone: string }) => `${user.phone.slice(1)}@${TEST_EMAIL_DOMAIN}`;

/** One host for the footer and picker tests (same worker: the second test reuses the session). */
type TestUser = Awaited<ReturnType<typeof createTestUser>>;
type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;
let hostSession: Promise<{ user: TestUser; state: StorageState }> | null = null;
async function openAsHost(browser: Browser) {
  hostSession ??= (async () => {
    const user = await createTestUser({ name: "E2E Phase2 Host" });
    const { context, page } = await openAs(browser, null);
    await loginByEmail(page, emailOf(user));
    const state = await context.storageState();
    await context.close();
    return { user, state };
  })();
  const { user, state } = await hostSession;
  return { user, ...(await openAs(browser, null, state)) };
}

/** The visitor allowed "preferences" cookies (the fixtures answer "necessary only"). */
async function allowPreferences(page: Page) {
  await page.context().addCookies([
    {
      name: "bayit_consent",
      value: encodeURIComponent(JSON.stringify({ necessary: true, preferences: true, analytics: false, v: 1 })),
      url: BASE_URL,
    },
  ]);
}

const continueBlock = (page: Page) => page.getByRole("region", { name: "המשך מאיפה שעצרתם" });
const recommended = (page: Page) => page.getByRole("region", { name: "מקומות מומלצים" });
const searchCard = (page: Page) => page.getByRole("search", { name: "חיפוש מקומות" });
const footer = (page: Page) => page.locator("[data-site-footer]");

/** Every locator is on the page, each one after the one before it in the document. */
async function expectInOrder(locators: Locator[]) {
  for (const locator of locators) await expect(locator).toHaveCount(1);
  for (let i = 1; i < locators.length; i += 1) {
    const before = await locators[i - 1].elementHandle();
    const after = await locators[i].elementHandle();
    const follows = await before!.evaluate((a, b) => !!(a.compareDocumentPosition(b as Node) & Node.DOCUMENT_POSITION_FOLLOWING), after);
    expect(follows, `item ${i} comes after item ${i - 1}`).toBe(true);
  }
}

/** Waits until this user's account list of recently viewed places is `publicIds`, newest first. */
async function expectAccountViews(userId: string, publicIds: number[]) {
  await expect
    .poll(
      async () =>
        (
          await sql<{ publicId: number }>(
            `SELECT l."publicId" FROM "RecentlyViewed" r JOIN "Listing" l ON l.id = r."listingId" WHERE r."userId" = $1 ORDER BY r."viewedAt" DESC`,
            [userId],
          )
        ).map((row) => row.publicId),
      { timeout: 20_000 },
    )
    .toEqual(publicIds);
}

/** "12:00" … "22:00" every 30 minutes (and the check-out range), as "HH:MM". */
function times(from: string, to: string): string[] {
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const out: string[] = [];
  for (let m = minutes(from); m <= minutes(to); m += 30) out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  return out;
}

/** "07:30" → "7:30": Hebrew's 24-hour form (the locale writes the hour without a leading zero). */
function clock24(time: string): string {
  return time.replace(/^0/, "");
}

/** 750 → "12:30 PM" (minutes since midnight, English 12-hour form). */
function clock12(time: string): string {
  const h = Number(time.slice(0, 2));
  return `${h % 12 === 0 ? 12 : h % 12}:${time.slice(3)} ${h < 12 ? "AM" : "PM"}`;
}

test.describe("home page (brief 4)", () => {
  test("a first visit: hero and search card, promise line, chips, recommended, cities, how it works, host card, footer — and no Jewish life card", async ({
    page,
    consoleErrors,
  }) => {
    await page.goto("/he");
    await settle(page);
    const main = page.locator("main");
    await expectInOrder([
      page.locator("#home-hero-title"),
      searchCard(page),
      main.getByText("כאן אף אחד לא ידחה אתכם בגלל מי שאתם", { exact: true }),
      page.locator('[data-home-section="categories"]'),
      page.locator('[data-home-section="featured"]'),
      page.locator('[data-home-section="cities"]'),
      page.locator('[data-home-section="howItWorks"]'),
      page.locator('[data-home-section="listCta"]'),
      footer(page),
    ]);
    // The sections are the ones the brief names, with their titles.
    await expect(page.locator('[data-home-section="featured"]').getByRole("heading", { name: "מקומות מומלצים" })).toBeVisible();
    await expect(page.locator('[data-home-section="cities"]').getByRole("heading", { name: "לאן נוסעים?" })).toBeVisible();
    await expect(page.locator('[data-home-section="howItWorks"]').getByRole("heading", { name: "איך זה עובד" })).toBeVisible();
    await expect(page.locator('[data-home-section="listCta"]').getByRole("heading", { name: "יש לכם מקום בגאורגיה? פרסמו בחינם" })).toBeVisible();
    // A first visit has no history: no "המשך מאיפה שעצרתם", nothing reserved for it.
    await expect(continueBlock(page)).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveAttribute("data-home-history", /./);
    // No Jewish life card on the home page; the "כשר ושבת" chip stays.
    await expect(main.locator('a[href^="/he/jewish-life"]')).toHaveCount(0);
    await expect(page.locator('[data-home-section="categories"]').getByRole("link", { name: "כשר ושבת" })).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("the recommended row shows only the selected tab's type, with the type label on every card but short stays", async ({ page, consoleErrors }) => {
    await page.goto("/he");
    await settle(page);
    const row = recommended(page);
    const cards = row.locator("article:visible");
    const labels = ["למכירה", "חודשי", "מלון"];
    const tabs = [
      { tab: "לטווח קצר", deal: "short-stay", label: null },
      { tab: "חודשי", deal: "monthly", label: "חודשי" },
      { tab: "קנייה", deal: "buy", label: "למכירה" },
      { tab: "מלונות", deal: "hotels", label: "מלון" },
      { tab: "לטווח קצר", deal: "short-stay", label: null },
    ];
    for (const [index, { tab, deal, label }] of tabs.entries()) {
      // The page opens on "לטווח קצר" (rendered by the server); then each tab in turn, and back.
      if (index > 0) await searchCard(page).getByRole("radio", { name: tab }).click();
      await expect(searchCard(page).getByRole("radio", { name: tab })).toBeChecked();
      await expect(row.getByRole("link", { name: /^הכל/ })).toHaveAttribute("href", `/he/search?deal=${deal}`);
      await expect(cards.first()).toBeVisible();
      const count = await cards.count();
      expect(count).toBeLessThanOrEqual(6);
      for (const card of await cards.all()) {
        for (const other of labels) {
          // Short stays carry no type label; every other card carries its own and no other.
          await expect(card.getByText(other, { exact: true })).toHaveCount(other === label ? 1 : 0);
        }
      }
    }
    expect(consoleErrors).toEqual([]);
  });

  test("a returning visitor: the last search and recently viewed, “ניקוי”, and on a fresh device after signing in the list comes from the account", async ({
    browser,
  }) => {
    test.slow();
    const user = await createTestUser({ name: "E2E History Guest" });
    const [saved] = await sql<{ id: string }>(`SELECT id FROM "Listing" WHERE "publicId" = 100`);
    await sql(`INSERT INTO "Favorite" (id, "userId", "listingId") VALUES ($1, $2, $3)`, [newId(), user.id, saved.id]);

    // ── Device A, signed out, with "preferences" cookies ──
    const a = await openAs(browser, null);
    await allowPreferences(a.page);
    await a.page.goto("/he/search?deal=short-stay&city=batumi&checkIn=2099-12-12&checkOut=2099-12-15&guests=2");
    await settle(a.page);
    await a.page.goto("/he/listing/104");
    await settle(a.page);
    await expect.poll(() => a.page.evaluate(() => localStorage.getItem("bayit:recently-viewed") ?? "")).toContain("104");

    await a.page.goto("/he");
    await settle(a.page);
    let block = continueBlock(a.page);
    await expect(block).toBeVisible();
    await expect(block.getByRole("link", { name: /^החיפוש האחרון: בטומי/ })).toHaveAttribute("href", /city=batumi/);
    await expect(block.getByRole("heading", { name: "נצפו לאחרונה" })).toBeVisible();
    await expect(block.locator("article")).toHaveCount(1);
    // "ניקוי" empties the list on this device; the last search stays.
    await block.getByRole("button", { name: "ניקוי הרשימה „נצפו לאחרונה”" }).click();
    await expect(block.locator("article")).toHaveCount(0);
    await expect(block.getByRole("heading", { name: "נצפו לאחרונה" })).toHaveCount(0);
    await expect.poll(() => a.page.evaluate(() => localStorage.getItem("bayit:recently-viewed"))).toBeNull();
    await a.page.reload();
    await settle(a.page);
    await expect(block.getByRole("link", { name: /^החיפוש האחרון: בטומי/ })).toBeVisible();
    await expect(block.locator("article")).toHaveCount(0);

    // A place seen before signing in goes into the account once the visitor signs in on this device.
    await a.page.goto("/he/listing/104");
    await settle(a.page);
    await expect.poll(() => a.page.evaluate(() => localStorage.getItem("bayit:recently-viewed") ?? "")).toContain("104");
    await loginByEmail(a.page, emailOf(user));
    await a.page.goto("/he");
    await settle(a.page);
    await expectAccountViews(user.id, [104]);
    // A view while signed in is written to the account at once.
    await a.page.goto("/he/listing/107");
    await settle(a.page);
    await expectAccountViews(user.id, [107, 104]);
    await a.context.close();

    // ── Device B: a fresh browser ("necessary only" cookies), signed in as the same person ──
    const b = await openAs(browser, null);
    await loginByEmail(b.page, emailOf(user));
    await b.page.goto("/he");
    await settle(b.page);
    block = continueBlock(b.page);
    await expect(block).toBeVisible();
    await expect(block.getByRole("heading", { name: "נצפו לאחרונה" })).toBeVisible();
    // Each card's title link (the photo links lead to the same place).
    const links = block.locator("article h3 a");
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveAttribute("href", /^\/he\/listing\/107(-|$)/);
    await expect(links.nth(1)).toHaveAttribute("href", /^\/he\/listing\/104(-|$)/);
    // The saved places, and no last search (it lives on device A).
    await expect(block.getByRole("link", { name: "שמורים · מקום אחד" })).toHaveAttribute("href", "/he/account/favorites");
    await expect(block.getByRole("link", { name: /^החיפוש האחרון/ })).toHaveCount(0);
    // Nothing was stored on this device ("necessary only").
    expect(await b.page.evaluate(() => localStorage.getItem("bayit:recently-viewed"))).toBeNull();

    // "ניקוי" while signed in clears the account's list too.
    await block.getByRole("button", { name: "ניקוי הרשימה „נצפו לאחרונה”" }).click();
    await expect(block.locator("article")).toHaveCount(0);
    await expectAccountViews(user.id, []);
    await b.page.reload();
    await settle(b.page);
    await expect(block.getByRole("link", { name: "שמורים · מקום אחד" })).toBeVisible();
    await expect(block.getByRole("heading", { name: "נצפו לאחרונה" })).toHaveCount(0);
    expect(b.consoleErrors).toEqual([]);
    await b.context.close();
  });
});

test.describe("menu and footer (brief 3)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the side menu: the 4 tab names, one Jewish life link, emergency numbers under help & safety", async ({ page, consoleErrors }) => {
    await page.goto("/he");
    await settle(page);
    await page.getByRole("button", { name: "פתיחת התפריט" }).click();
    const menu = page.getByRole("dialog", { name: "תפריט" });
    await expect(menu).toBeVisible();

    const search = menu.getByRole("region", { name: "חיפוש" });
    const names = (await search.getByRole("link").allTextContents()).map((text) => text.trim());
    expect(names.slice(0, 4)).toEqual(["לטווח קצר", "חודשי", "קנייה", "מלונות"]);
    await expect(search.getByRole("link", { name: "לטווח קצר" })).toHaveAttribute("href", "/he/search?deal=short-stay");
    await expect(menu.getByRole("link", { name: /השכרה/ })).toHaveCount(0);

    // One Jewish life row (it was five).
    await expect(menu.locator('a[href^="/he/jewish-life"]')).toHaveCount(1);
    await expect(menu.getByRole("link", { name: "חיים יהודיים בגאורגיה" })).toHaveAttribute("href", "/he/jewish-life");

    const help = menu.getByRole("region", { name: "עזרה ובטיחות" });
    const emergency = help.getByRole("link", { name: "מספרי חירום" });
    await expect(emergency).toHaveAttribute("href", "/he/safety#emergency");
    await emergency.click();
    await expect(page).toHaveURL(/\/he\/safety#emergency$/);
    await expect(page.locator("#emergency").getByRole("heading", { name: "מספרי חירום ושגרירות" })).toBeVisible();
    await expect(page.locator("#emergency").locator('a[href^="tel:"]').first()).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("the footer: the new tagline and bottom line; hidden in the post form, the edit form and the booking flow, kept on /post", async ({
    browser,
  }) => {
    test.slow();
    const { user: host, context, page, consoleErrors } = await openAsHost(browser);
    const draft = await createTestListing({ ownerId: host.id, title: `E2E Footer draft ${Date.now().toString(36)}`, status: "DRAFT", photos: 6 });
    const live = await createTestListing({ ownerId: host.id, title: `E2E Footer live ${Date.now().toString(36)}` });

    await page.goto("/he");
    await settle(page);
    await expect(footer(page)).toBeVisible();
    await expect(footer(page)).toContainText("בתים בגאורגיה, אצל מארחים שהתחייבו לקבל ישראלים בברכה. מזמינים באתר ומשלמים כשמגיעים.");
    await expect(footer(page)).toContainText("נבנה על ידי משפחה ישראלית");
    await expect(footer(page)).not.toContainText("נבנה עבור הקהילה היהודית");
    await expect(footer(page).getByRole("link", { name: "מספרי חירום" })).toHaveAttribute("href", "/he/safety#emergency");

    // The Post page itself keeps the footer, with the pledge wording.
    await page.goto("/he/post");
    await settle(page);
    await expect(footer(page)).toBeVisible();
    await expect(page.locator("main")).toContainText("כל המארחים כאן מתחייבים לקבל אורחים ישראלים ויהודים בברכה. תאשרו את זה לפני הפרסום.");
    await expect(page.locator("main")).toContainText("נבדקת על ידי אדם — בדרך כלל תוך יום");

    // Inside the post form: no footer.
    await page.goto(`/he/post/${draft.id}?step=2`);
    await settle(page);
    await expect(page).toHaveURL(/[?&]step=2/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(footer(page)).toBeHidden();

    // The edit form of a published listing: no footer.
    await page.goto(`/he/account/listings/${live.id}/edit?step=2`);
    await settle(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(footer(page)).toBeHidden();

    // The booking review ("אישור הזמנה"): no footer.
    const month = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 7);
    await page.goto(`/he/listing/91/book?checkIn=${month}-10&checkOut=${month}-12&adults=2`);
    await settle(page);
    await expect(page.getByRole("heading", { level: 1, name: "אישור הזמנה" })).toBeVisible();
    await expect(footer(page)).toBeHidden();

    // Back on a normal page the footer is there again (client-side state does not stick).
    await page.goto("/he/help");
    await settle(page);
    await expect(footer(page)).toBeVisible();
    expect(consoleErrors).toEqual([]);
    await context.close();
  });
});

test("check-in options are 12:00–22:00 every 30 minutes plus “גמיש” (Hebrew 24-hour, English 12-hour); check-out 07:00–14:00", async ({ browser }) => {
  const { user: host, context, page, consoleErrors } = await openAsHost(browser);
  const draft = await createTestListing({ ownerId: host.id, title: `E2E Picker draft ${Date.now().toString(36)}`, status: "DRAFT", photos: 6 });
  await sql(`UPDATE "Listing" SET "checkInFrom" = NULL, "checkOutUntil" = NULL, "checkInFlexible" = false, "checkOutFlexible" = false WHERE id = $1`, [
    draft.id,
  ]);

  await page.goto(`/he/post/${draft.id}?step=11`);
  await settle(page);
  const heIn = page.getByRole("combobox", { name: /^שעת צ׳ק-אין/ });
  const heOut = page.getByRole("combobox", { name: /^שעת צ׳ק-אאוט/ });
  await expect(heIn).toHaveValue("");
  expect(await heIn.locator("option").allTextContents()).toEqual(["לא נקבע", "גמיש", ...times("12:00", "22:00").map(clock24)]);
  expect(await heOut.locator("option").allTextContents()).toEqual(["לא נקבע", "גמיש", ...times("07:00", "14:00").map(clock24)]);
  expect(times("12:00", "22:00")).toHaveLength(21);

  await page.goto(`/en/post/${draft.id}?step=11`);
  await settle(page);
  const enIn = page.getByRole("combobox", { name: /^Check-in time/ });
  expect(await enIn.locator("option").allTextContents()).toEqual(["Not set", "Flexible", ...times("12:00", "22:00").map(clock12)]);
  expect(consoleErrors).toEqual([]);
  await context.close();
});

test.describe("search map start view (brief 3)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("Tbilisi's results are all on the first screen, padded; an empty search says so", async ({ page, consoleErrors }) => {
    await page.goto("/en/search?city=tbilisi&view=map");
    await settle(page);
    const pins = page.locator(".leaflet-marker-icon");
    await expect(pins.first()).toBeVisible();
    const boxes = await pins.evaluateAll((els) => {
      const map = els[0].closest(".leaflet-container")!.getBoundingClientRect();
      return {
        map: { left: map.left, right: map.right, top: map.top },
        bottom: window.innerHeight,
        pins: els.map((el) => el.getBoundingClientRect()).map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })),
      };
    });
    // The computer layout's map reaches below the fold: every result is fitted into the visible part.
    for (const pin of boxes.pins) {
      expect(pin.bottom).toBeLessThanOrEqual(boxes.bottom);
      expect(pin.top).toBeGreaterThanOrEqual(boxes.map.top);
      expect(pin.left).toBeGreaterThanOrEqual(boxes.map.left);
      expect(pin.right).toBeLessThanOrEqual(boxes.map.right);
    }

    await page.goto("/en/search?view=map&deal=buy&priceMax=1");
    await settle(page);
    await expect(page.getByText("No homes in this area")).toBeVisible();
    await expect(page.locator(".leaflet-marker-icon")).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});
