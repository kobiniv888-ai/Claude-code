import type { BrowserContext, Page } from "@playwright/test";
import { expect, openAs, settle, test } from "./fixtures";
import { DEMO, loginThroughForm } from "./helpers/auth";
import { createTestListing, freshPhone, listingByPublicId, sql, userIdByPhone } from "./helpers/db";
import { makePhotos } from "./helpers/photos";

/**
 * Definition of done:
 * - A new user can sign up, verify their phone, post a listing with photos, and see it go live
 *   or into review (the first listing of an account is always reviewed by a person).
 * - An admin can approve or reject listings.
 */

test.describe.configure({ mode: "serial" });

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

let ownerPhone = "";
let ownerState: StorageState;
let posted: { publicId: number; title: string };

async function next(page: Page) {
  await page.getByRole("button", { name: "Next", exact: true }).click();
}

/** Radio and checkbox cards hide the native input under a styled label. */
async function choose(input: ReturnType<Page["getByRole"]>) {
  await input.locator("xpath=ancestor::label[1]").click();
  await expect(input).toBeChecked();
}

async function expectStep(page: Page, step: number, heading: string) {
  await expect(page).toHaveURL(new RegExp(`[?&]step=${step}(&|$)`));
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
}

test("a new user signs up, posts a listing with photos and it goes into review", async ({ page, context, consoleErrors }) => {
  // The longest flow: sign-up, 11 wizard steps (incl. the pledge), 6 uploads, publish.
  test.slow();
  // Sign up with a fresh phone number.
  ownerPhone = await freshPhone();
  await page.goto("/en/login");
  await settle(page);
  await loginThroughForm(page, ownerPhone);
  // Without ?next= the login page continues to the account (the first visit may compile it).
  await expect(page).toHaveURL(/\/en\/account$/, { timeout: 90_000 });
  await expect(page.getByRole("banner").getByRole("link", { name: "Log in" })).toBeHidden({ timeout: 30_000 });
  const [user] = await sql<{ phoneNumberVerified: boolean }>(`SELECT "phoneNumberVerified" FROM "User" WHERE "phoneNumber" = $1`, [ownerPhone]);
  expect(user?.phoneNumberVerified).toBe(true);

  // Post a listing.
  await page.getByRole("banner").getByRole("link", { name: "Post a listing" }).click();
  await expect(page).toHaveURL(/\/en\/post$/);
  await page.getByRole("button", { name: "Start a new listing" }).first().click();
  await expect(page).toHaveURL(/\/en\/post\/[^/?]+\?step=1/);
  await settle(page);

  // 1 Deal type
  await choose(page.getByRole("radio", { name: /^Short stay/ }));
  await next(page);
  // 2 Property type
  await expectStep(page, 2, "What kind of place is it?");
  await choose(page.getByRole("radio", { name: /^Apartment/ }));
  await next(page);
  // 3 Location: city + a pin on the map
  await expectStep(page, 3, "Where is it?");
  await page.getByRole("combobox", { name: "City" }).click();
  await page.getByRole("option", { name: "Mestia" }).click();
  const map = page.getByRole("region", { name: "Map for choosing the exact location" });
  await expect(map).toBeVisible();
  await settle(page);
  await map.click({ position: { x: 200, y: 150 } });
  await expect(page.getByText("Pin set at")).toBeVisible();
  await next(page);
  // 4 Details
  await expectStep(page, 4, "Tell guests about the place");
  await page.getByRole("button", { name: "More: Maximum guests" }).click();
  await page.getByRole("button", { name: "More: Maximum guests" }).click();
  const title = `E2E Mountain flat in Mestia ${Date.now().toString(36)}`;
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await page
    .getByRole("textbox", { name: "Description" })
    .fill("A warm wooden flat with a view of the Svaneti mountains, a full kitchen, fast Wi-Fi and a balcony. Ten minutes on foot to the center.");
  await next(page);
  // 5 Amenities
  await expectStep(page, 5, "What does the place offer?");
  await choose(page.getByRole("checkbox", { name: "Wi-Fi" }));
  await next(page);
  // 6 Jewish-friendly
  await expectStep(page, 6, "Jewish-friendly details");
  await next(page);
  // 7 Photos: 6 generated JPEGs
  await expectStep(page, 7, "Add photos");
  await page.locator('input[type="file"]').setInputFiles(await makePhotos(6));
  await expect(page.getByText("Enough photos to publish")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/^6 photos/)).toBeVisible();
  await next(page);
  // 8 Price
  await expectStep(page, 8, "Price and availability");
  await page.getByRole("textbox", { name: "Price", exact: true }).fill("95");
  await next(page);
  // 9 Contact: the verified phone is already filled in for WhatsApp
  await expectStep(page, 9, "How should guests contact you?");
  await expect(page.getByRole("textbox", { name: "WhatsApp number" })).not.toHaveValue("");
  await next(page);
  // 10 The Bayit pledge (required; saved on the account)
  await expectStep(page, 10, "The Bayit pledge");
  await page.getByRole("checkbox", { name: "I have read this and I commit to it" }).check();
  await page.getByRole("button", { name: "Accept the pledge" }).click();
  await expect(page.getByText("You accepted the Bayit pledge")).toBeVisible();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  // 11 Preview and publish
  await expectStep(page, 11, "Preview and publish");
  await expect(page.getByRole("region", { name: "Before you can publish" })).toHaveCount(0);
  await page.getByRole("checkbox", { name: /I accept the listing rules/ }).check();
  await page.getByRole("button", { name: "Publish listing" }).click();
  await expect(page.getByRole("heading", { name: "We're checking your listing" })).toBeVisible({ timeout: 60_000 });

  const [row] = await sql<{ publicId: number; status: string; riskReasons: { code: string }[] }>(
    `SELECT "publicId", status, "riskReasons" FROM "Listing" WHERE title = $1`,
    [title],
  );
  expect(row.status).toBe("IN_REVIEW");
  expect(row.riskReasons.map((r) => r.code)).toContain("first_listing");
  const [photos] = await sql<{ count: string }>(`SELECT count(*)::text AS count FROM "ListingPhoto" p JOIN "Listing" l ON l.id = p."listingId" WHERE l.title = $1`, [title]);
  expect(Number(photos.count)).toBe(6);
  posted = { publicId: row.publicId, title };

  // The owner sees it under My listings as "In review".
  await page.goto("/en/account/listings");
  const card = page.getByRole("article", { name: title });
  await expect(card).toBeVisible();
  await expect(card).toContainText("In review");
  // Not public yet.
  const anonymous = await openAs(page.context().browser()!, null);
  await anonymous.page.goto(`/en/listing/${posted.publicId}`);
  await expect(anonymous.page.getByRole("heading", { level: 1, name: "This listing is not available" })).toBeVisible();
  await expect(anonymous.page.getByText(title)).toHaveCount(0);
  await anonymous.context.close();

  ownerState = await context.storageState();
  expect(consoleErrors).toEqual([]);
});

test("an admin approves the listing and it becomes public", async ({ browser }) => {
  test.skip(!posted, "needs the listing from the previous test");
  const admin = await openAs(browser, DEMO.admin);
  const page = admin.page;
  await page.goto("/en/admin/moderation");
  await page.getByRole("link", { name: posted.title }).click();
  await expect(page.getByRole("heading", { level: 1, name: posted.title })).toBeVisible();
  await settle(page);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await expect(dialog).toContainText("Approve this listing?");
  await dialog.getByRole("button", { name: "Approve and publish" }).click();
  await expect(page.getByText("Approved. The listing is live.")).toBeVisible();
  await expect.poll(async () => (await listingByPublicId(posted.publicId)).status).toBe("LIVE");
  expect(admin.consoleErrors).toEqual([]);
  await admin.context.close();

  // Public now, for everyone.
  const visitor = await openAs(browser, null);
  await visitor.page.goto(`/en/listing/${posted.publicId}`);
  await expect(visitor.page.getByRole("heading", { level: 1, name: posted.title })).toBeVisible();
  await expect(visitor.page).toHaveURL(new RegExp(`/en/listing/${posted.publicId}-e2e-mountain-flat-in-mestia`));
  // The owner accepted the Bayit pledge while posting: the listing shows the green badge.
  await expect(visitor.page.getByText("Welcomes Israelis", { exact: true }).first()).toBeVisible();
  expect(visitor.consoleErrors).toEqual([]);
  await visitor.context.close();
});

test("an admin asks for changes and the owner sees the reason", async ({ browser }) => {
  test.skip(!ownerState, "needs the owner from the first test");
  const ownerId = await userIdByPhone(ownerPhone);
  const second = await createTestListing({ ownerId, title: `E2E Second flat ${Date.now().toString(36)}`, status: "IN_REVIEW" });
  const [{ title }] = await sql<{ title: string }>(`SELECT title FROM "Listing" WHERE id = $1`, [second.id]);

  const admin = await openAs(browser, DEMO.admin);
  await admin.page.goto(`/en/admin/moderation/${second.id}`);
  await expect(admin.page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await settle(admin.page);
  await admin.page.getByRole("button", { name: "Ask for changes" }).click();
  const dialog = admin.page.getByRole("dialog", { name: "Ask the owner for changes" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name: "Reason" }).click();
  await admin.page.getByRole("option", { name: "Photos are low quality" }).click();
  const note = "Please add a bright photo of the kitchen.";
  await dialog.getByRole("textbox", { name: "Note to the owner" }).fill(note);
  await dialog.getByRole("button", { name: "Send to the owner" }).click();
  await expect(admin.page.getByText("Sent back to the owner.")).toBeVisible();
  expect(admin.consoleErrors).toEqual([]);
  await admin.context.close();

  const listing = await listingByPublicId(second.publicId);
  expect(listing.status).toBe("NEEDS_CHANGES");
  expect(listing.moderationReason).toBe("photos_low_quality");

  const owner = await openAs(browser, null, ownerState);
  await owner.page.goto("/en/account/listings?status=changes");
  const card = owner.page.getByRole("article", { name: title });
  await expect(card).toContainText("Needs changes");
  await expect(card).toContainText("Photos are low quality");
  await expect(card).toContainText(note);
  expect(owner.consoleErrors).toEqual([]);
  await owner.context.close();
});
