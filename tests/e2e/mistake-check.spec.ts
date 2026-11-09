import type { Browser } from "@playwright/test";
import { expect, openAs, openAsTestUser, settle, test } from "./fixtures";
import { createTestListing, createTestUser, listingByPublicId, sql } from "./helpers/db";
import { sealAddress } from "./helpers/field-crypto";
import { TEST_ADMIN_PHONE } from "./helpers/staff";

/** The exact address as the site stores it: encrypted (SECURITY_REPORT 12.3.c). */
const E2E_ADDRESS = "E2E Street 7, apartment 5";

/**
 * Round 3, brief 6.1: "בדיקה לפני פרסום" (the host's mistake check), in production mode.
 *
 * - A test listing with the founder's listing 44's problems (never listing 44 itself): the
 *   description says check-in 13:00 / check-out 10:00 while the settings say 10:00 / 13:00, max
 *   guests 1 with a double bed and a sofa bed, 0 bathrooms, a "200 שקל" fine in a lari listing.
 *   The preview step shows exactly those warnings ("כדאי לבדוק"), no errors, and "לתיקון" opens
 *   the step that fixes one.
 * - An ERROR (no exact address) stops "פרסום" on the server: the address is removed after the
 *   panel loaded clean, the server refuses, the panel shows "יש לתקן לפני פרסום", and the listing
 *   stays a draft. With the address back it publishes (a first listing waits for review).
 * - Photo room labels: chosen under a photo in the edit form (saved), and the public "All photos"
 *   groups by room once two rooms are labelled.
 * - The admin review page's "בדיקה לפני פרסום" box lists the host's issues too.
 * - An error also blocks the other ways back onto the site (phase-4 hardening): a paused listing
 *   without its address can't be switched back on, and the admin's "Approve" is off.
 *
 * Test users get sessions without login codes (fixtures.ts); the global teardown removes them and their listings.
 */

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

const stamp = () => Date.now().toString(36);
/** Digits only, for Hebrew titles (Latin letters would make the title look English to the check). */
const digits = () => String(Date.now()).slice(-6);

/** Short stays: step 14 is "תצוגה מקדימה ופרסום", 10 the photos, 4 "גודל וחדרים". */
const PUBLISH_STEP = 14;

const LISTING_44_DESCRIPTION =
  "דירה נעימה עם מיטה זוגית וספה נפתחת, מטבח מאובזר ומרפסת עם נוף להרים. צ'ק אין בשעה 13:00, צ'ק אאוט עד 10:00. על יציאה מאוחרת יש קנס של 200 שקל.";

const LISTING_44_WARNINGS = ["no_bathrooms", "description_currency", "guests_below_beds", "checkin_time_mismatch", "checkout_time_mismatch"];

async function createHost(name: string): Promise<TestUser> {
  const host = await createTestUser({ name });
  await sql(
    `UPDATE "User" SET "firstName" = $2, "welcomePledgeVersion" = (SELECT max("welcomePledgeVersion") FROM "User" WHERE "isDemo"), "welcomePledgeAcceptedAt" = now() WHERE id = $1`,
    [host.id, name.split(" ").pop()],
  );
  return host;
}

/** A session without a login code (fixtures.ts): the site checks at most 30 codes an hour per address. */
const openAsUser = (browser: Browser, user: TestUser) => openAsTestUser(browser, user);

/** The test listing gets listing 44's problems (a copy of a demo short stay in Mestia, priced in lari). */
async function mirrorListing44(listingId: string, title: string) {
  await sql(
    `UPDATE "Listing" SET "originalLocale" = 'he', title = $2, description = $3, currency = 'GEL', "checkInFrom" = '10:00',
       "checkOutUntil" = '13:00', "checkInFlexible" = false, "checkOutFlexible" = false, "maxGuests" = 1, "bedsSingle" = NULL,
       "bedsDouble" = 1, "bedsSofa" = 1, bathrooms = 0, "addressEnc" = $4, "contentUpdatedAt" = now()
     WHERE id = $1`,
    [listingId, title, LISTING_44_DESCRIPTION, sealAddress(E2E_ADDRESS)],
  );
  // Bedroom, kitchen and bathroom photos, so only listing 44's own problems show.
  await sql(
    `UPDATE "ListingPhoto" p SET room = (ARRAY['BEDROOM','KITCHEN','BATHROOM'])[x.n]::"PhotoRoom"
       FROM (SELECT id, row_number() OVER (ORDER BY "sortOrder") AS n FROM "ListingPhoto" WHERE "listingId" = $1) x
     WHERE p.id = x.id AND x.n <= 3`,
    [listingId],
  );
}

test.describe("mistake check before publishing (brief 6.1)", () => {
  test("listing 44's problems are warnings; 'לתיקון' opens the step", async ({ browser }) => {
    test.slow();
    const host = await createHost("E2E Mistake Noa");
    const title = `E2E דירה במסטיה ${digits()}`;
    const draft = await createTestListing({ ownerId: host.id, title, status: "DRAFT", photos: 6 });
    await mirrorListing44(draft.id, title);

    const owner = await openAsUser(browser, host);
    await owner.page.goto(`/he/post/${draft.id}?step=${PUBLISH_STEP}`);
    await settle(owner.page);
    const panel = owner.page.getByTestId("mistake-check");
    await expect(panel.getByRole("heading", { name: "בדיקה לפני פרסום" })).toBeVisible();
    await expect(panel.getByRole("heading", { name: "כדאי לבדוק" })).toBeVisible();
    await expect(panel.getByRole("heading", { name: "יש לתקן לפני פרסום" })).toHaveCount(0);
    const codes = await panel.locator("[data-mistake]").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-mistake")));
    // The price guide may say anything about the price of a test copy: only the brief's problems count here.
    expect(codes.filter((c) => !c?.startsWith("price_"))).toEqual(LISTING_44_WARNINGS);
    await expect(panel.locator('[data-mistake="checkin_time_mismatch"]')).toContainText("13:00");
    await expect(panel.locator('[data-mistake="description_currency"]')).toContainText("200 שקל");
    await expect(panel.locator('[data-mistake="guests_below_beds"]')).toContainText("4");

    // "לתיקון" on "0 bathrooms" opens "גודל וחדרים".
    await panel.locator('[data-mistake="no_bathrooms"]').getByRole("button").click();
    await expect(owner.page.getByRole("heading", { level: 1, name: "גודל וחדרים" })).toBeVisible();
    await expect(owner.page).toHaveURL(/[?&]step=4(&|$)/);
    expect(owner.consoleErrors).toEqual([]);
    await owner.context.close();
  });

  test("an error stops publishing on the server; fixed, it publishes", async ({ browser }) => {
    test.slow();
    const host = await createHost("E2E Mistake Lior");
    const title = `E2E דירה עם שגיאה ${digits()}`;
    const draft = await createTestListing({ ownerId: host.id, title, status: "DRAFT", photos: 6 });
    await mirrorListing44(draft.id, title);

    const owner = await openAsUser(browser, host);
    await owner.page.goto(`/he/post/${draft.id}?step=${PUBLISH_STEP}`);
    await settle(owner.page);
    const panel = owner.page.getByTestId("mistake-check");
    await expect(panel.getByRole("heading", { name: "כדאי לבדוק" })).toBeVisible();
    await expect(panel.getByRole("heading", { name: "יש לתקן לפני פרסום" })).toHaveCount(0);

    // The exact address disappears after the panel was loaded: only the server can notice.
    await sql(`UPDATE "Listing" SET "addressEnc" = NULL WHERE id = $1`, [draft.id]);
    await owner.page.locator("#rules-checkbox").check();
    await owner.page.getByRole("button", { name: "פרסום", exact: true }).click();
    await expect(panel.getByRole("heading", { name: "יש לתקן לפני פרסום" })).toBeVisible({ timeout: 30_000 });
    await expect(panel.locator('[data-mistake="address_missing"]')).toBeVisible();
    expect((await listingByPublicId(draft.publicId)).status).toBe("DRAFT");

    // "פרסום" again (once the message over the bottom bar is gone): the panel's error stops it at once.
    await expect(owner.page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 });
    await owner.page.getByRole("button", { name: "פרסום", exact: true }).click();
    await expect(panel.getByRole("heading", { name: "בדיקה לפני פרסום" })).toBeFocused();
    expect((await listingByPublicId(draft.publicId)).status).toBe("DRAFT");

    // Fixed: check again, publish. A host's first listing waits for review.
    await sql(`UPDATE "Listing" SET "addressEnc" = $2 WHERE id = $1`, [draft.id, sealAddress(E2E_ADDRESS)]);
    await panel.getByRole("button", { name: "לבדוק שוב" }).click();
    await expect(panel.getByRole("heading", { name: "יש לתקן לפני פרסום" })).toHaveCount(0);
    await expect(owner.page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 });
    await owner.page.getByRole("button", { name: "פרסום", exact: true }).click();
    await expect.poll(async () => (await listingByPublicId(draft.publicId)).status, { timeout: 60_000 }).toBe("IN_REVIEW");
    await owner.context.close();
  });

  test("photo room labels are saved, and 'All photos' groups by room", async ({ browser }) => {
    test.slow();
    const host = await createHost("E2E Mistake Tamar");
    const title = `E2E Labelled flat ${stamp()}`;
    const live = await createTestListing({ ownerId: host.id, title, status: "LIVE", photos: 6 });
    const owner = await openAsUser(browser, host);

    // The edit form's photos step: a room under each photo.
    await owner.page.goto(`/he/account/listings/${live.id}/edit?step=10`);
    await settle(owner.page);
    await expect(owner.page.getByRole("heading", { level: 1, name: "הוספת תמונות" })).toBeVisible();
    const selects = owner.page.locator("select[data-photo-room]");
    await expect(selects).toHaveCount(6);
    await selects.nth(1).selectOption("BEDROOM");
    await selects.nth(2).selectOption("KITCHEN");
    await expect
      .poll(async () => (await sql<{ room: string | null }>(`SELECT room FROM "ListingPhoto" WHERE "listingId" = $1 ORDER BY "sortOrder"`, [live.id])).map((r) => r.room))
      .toEqual([null, "BEDROOM", "KITCHEN", null, null, null]);
    // Editing a published listing: the check's short line is at the top of the form.
    await expect(owner.page.getByTestId("mistake-check-summary")).toContainText("בדיקה לפני פרסום");
    await owner.context.close();

    // A guest's "All photos": one section per room, the unlabelled photos last.
    const guest = await openAs(browser, null);
    await guest.page.goto(`/he/listing/${live.publicId}`);
    await settle(guest.page);
    await guest.page.getByRole("button", { name: /כל 6 התמונות|כל התמונות/ }).click();
    const sheet = guest.page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { name: /^חדר שינה/ })).toBeVisible();
    await expect(sheet.getByRole("heading", { name: /^מטבח/ })).toBeVisible();
    await expect(sheet.getByRole("heading", { name: /^עוד תמונות/ })).toBeVisible();
    await guest.context.close();
  });

  // Phase-4 hardening (mistake-3, mistake-4): an error blocks every way back onto the site, not
  // only "פרסום". A paused short stay whose exact address was removed can't be switched back on
  // from "הנכסים שלי"; the admin can't approve a listing with an error (the button is off).
  test("a paused listing with an error can't come back on; the admin can't approve one", async ({ browser }) => {
    test.slow();
    const host = await createHost("E2E Mistake Gal");
    const title = `E2E דירה מושהית ${digits()}`;
    const paused = await createTestListing({ ownerId: host.id, title, status: "LIVE", photos: 6 });
    await sql(`UPDATE "Listing" SET status = 'PAUSED', "addressEnc" = NULL, "reviewedAt" = now() WHERE id = $1`, [paused.id]);

    const owner = await openAsUser(browser, host);
    await owner.page.goto("/he/account/listings");
    await settle(owner.page);
    const card = owner.page.getByRole("article", { name: title });
    await card.getByRole("button", { name: "הפעלה מחדש" }).click();
    const toast = owner.page.locator("[data-sonner-toast]").filter({ hasText: "קודם צריך לתקן כמה דברים במודעה" });
    await expect(toast).toBeVisible({ timeout: 30_000 });
    expect((await listingByPublicId(paused.publicId)).status).toBe("PAUSED");
    // "לתיקון" opens the edit form's last step, where the check lists the missing address.
    await toast.getByRole("button", { name: "לתיקון" }).click();
    await expect(owner.page).toHaveURL(new RegExp(`/he/account/listings/${paused.id}/edit\\?step=publish`));
    await settle(owner.page);
    await expect(owner.page.getByTestId("mistake-check").locator('[data-mistake="address_missing"]')).toBeVisible();
    // Fixed, it comes back on.
    await sql(`UPDATE "Listing" SET "addressEnc" = $2 WHERE id = $1`, [paused.id, sealAddress(E2E_ADDRESS)]);
    await owner.page.goto("/he/account/listings");
    await settle(owner.page);
    await owner.page.getByRole("article", { name: title }).getByRole("button", { name: "הפעלה מחדש" }).click();
    await expect.poll(async () => (await listingByPublicId(paused.publicId)).status, { timeout: 30_000 }).not.toBe("PAUSED");
    expect(["LIVE", "IN_REVIEW"]).toContain((await listingByPublicId(paused.publicId)).status);
    expect(owner.consoleErrors).toEqual([]);
    await owner.context.close();

    // The admin's review page: approve is off while the host's check has an error.
    const waiting = await createTestListing({ ownerId: host.id, title: `E2E דירה ממתינה ${digits()}`, status: "IN_REVIEW", photos: 6 });
    await sql(`UPDATE "Listing" SET "addressEnc" = NULL WHERE id = $1`, [waiting.id]);
    const admin = await openAs(browser, TEST_ADMIN_PHONE);
    await admin.page.goto(`/en/admin/moderation/${waiting.id}`);
    await settle(admin.page);
    await expect(admin.page.getByTestId("admin-mistake-check").locator('[data-mistake="address_missing"]')).toBeVisible();
    await expect(admin.page.getByTestId("moderation-blocked-by-mistakes")).toBeVisible();
    await expect(admin.page.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
    expect((await listingByPublicId(waiting.publicId)).status).toBe("IN_REVIEW");
    await admin.context.close();
  });

  test("the admin review page shows the host's mistake check", async ({ browser }) => {
    test.slow();
    const host = await createHost("E2E Mistake Yael");
    const title = `E2E דירה לבדיקה ${digits()}`;
    const listing = await createTestListing({ ownerId: host.id, title, status: "IN_REVIEW", photos: 6 });
    await mirrorListing44(listing.id, title);

    const admin = await openAs(browser, TEST_ADMIN_PHONE);
    await admin.page.goto(`/en/admin/moderation/${listing.id}`);
    const box = admin.page.getByTestId("admin-mistake-check");
    await expect(box).toContainText("Host's mistake check");
    for (const code of LISTING_44_WARNINGS) await expect(box.locator(`[data-mistake="${code}"]`)).toBeVisible();
    await expect(box.locator('[data-mistake="checkin_time_mismatch"]')).toContainText("Worth checking");
    await admin.context.close();
  });
});
