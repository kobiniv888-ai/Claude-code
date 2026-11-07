import type { Page } from "@playwright/test";
import { expect, openAs, openAsTestUser, settle, test } from "./fixtures";
import { createTestUser, sql } from "./helpers/db";

/**
 * Saved lists (round 3, brief 7.2; section 13.6 "a shared list opens for someone who is logged
 * out"): a signed-in user makes a list, saves two places into it (a right click is the desktop's
 * long press) and shares it; a logged-out browser opens the link (view only, nothing about the
 * owner, never indexed) and its preview image answers; another user copies it; after "Stop
 * sharing" the link and its image are 404. Plus: signed-out hearts save on the device and are
 * merged into the account at sign-in.
 */

const VAKE = "Bright 2-bedroom flat in Vake – ready for Shabbat";
const SOLOLAKI = "Kosher apartment in a historic house in Sololaki, ready for Shabbat and Pesach";
const LIST = `E2E Batumi in August ${Date.now().toString(36)}`;

const card = (page: Page, title: string) => page.getByRole("list", { name: "Search results" }).getByRole("article", { name: title });

async function openSearch(page: Page) {
  await page.goto("/en/search?city=tbilisi&deal=short-stay");
  await expect(card(page, VAKE)).toBeVisible();
  await settle(page);
}

test("a shared list: share, open logged out, copy, stop sharing", async ({ browser }) => {
  const owner = await createTestUser({ name: "E2E Lists Owner" });
  const a = await openAsTestUser(browser, owner);
  await openSearch(a.page);

  // A long press (right click on a desktop) opens the sheet: a new list, and the place goes in.
  await card(a.page, VAKE).getByRole("button", { name: `Save ${VAKE}` }).click({ button: "right" });
  let sheet = a.page.getByRole("dialog", { name: "Save to a list" });
  await sheet.getByRole("button", { name: "New list" }).click();
  await sheet.getByLabel("List name").fill(LIST);
  await sheet.getByRole("button", { name: "Create and save" }).click();
  await expect(a.page.getByText(`Saved to “${LIST}”`).first()).toBeVisible();
  await expect(sheet).toBeHidden();

  // The second place: choose the list in the sheet.
  await card(a.page, SOLOLAKI).getByRole("button", { name: `Save ${SOLOLAKI}` }).click({ button: "right" });
  sheet = a.page.getByRole("dialog", { name: "Save to a list" });
  await sheet.getByRole("button", { name: new RegExp(LIST) }).click();
  await expect(sheet).toBeHidden();
  await expect(card(a.page, SOLOLAKI).getByRole("button", { name: `Remove ${SOLOLAKI} from saved` })).toBeVisible();

  // One list per place, and the price is kept for price-drop alerts.
  const inList = () =>
    sql<{ name: string; alertPrice: string | null }>(
      `SELECT l.name, f."alertPrice"::text AS "alertPrice" FROM "Favorite" f JOIN "SavedList" l ON l.id = f."listId" WHERE f."userId" = $1`,
      [owner.id],
    );
  await expect.poll(async () => (await inList()).length).toBe(2);
  expect((await inList()).every((row) => row.name === LIST && row.alertPrice !== null)).toBe(true);

  // Share it from the saved page.
  await a.page.goto("/en/account/favorites");
  await a.page.getByRole("navigation", { name: "My lists" }).getByRole("link", { name: new RegExp(LIST) }).click();
  await expect(a.page).toHaveURL(/\/en\/account\/favorites\?list=/);
  await a.page.getByRole("button", { name: "Share" }).first().click();
  let share = a.page.getByRole("dialog", { name: `Share “${LIST}”` });
  await share.getByRole("button", { name: "Create a share link" }).click();
  const link = share.getByRole("textbox", { name: "Link to the list" });
  await expect(link).toHaveValue(/\/lists\/[A-Za-z0-9_-]{43}$/);
  const path = new URL(await link.inputValue()).pathname;
  await expect(share.getByRole("button", { name: "Send on WhatsApp" }).or(share.getByRole("link", { name: "Send on WhatsApp" }))).toBeVisible();
  await a.page.keyboard.press("Escape");

  // Logged out: the list opens, view only, without the owner's name.
  const guest = await openAs(browser, null);
  const response = await guest.page.goto(path);
  expect(response?.status()).toBe(200);
  await expect(guest.page.getByRole("heading", { level: 1, name: LIST })).toBeVisible();
  const places = guest.page.getByRole("list", { name: "Places in the list" }).getByRole("article");
  await expect(places).toHaveCount(2);
  await expect(guest.page.getByText("E2E Lists Owner")).toHaveCount(0);
  await expect(guest.page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  // The preview image (JPEG like the listing images: a photo as PNG is too big for WhatsApp).
  const og = await guest.page.locator('meta[property="og:image"]').getAttribute("content");
  expect(og).toBeTruthy();
  const ogPath = new URL(og!).pathname + new URL(og!).search;
  const image = await guest.page.request.get(ogPath);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toMatch(/^image\/(png|jpeg)$/);
  // Copying needs an account: the login dialog opens.
  await guest.page.getByRole("button", { name: "Copy to my lists" }).click();
  await expect(guest.page.getByRole("dialog")).toBeVisible();
  expect(guest.consoleErrors).toEqual([]);
  await guest.context.close();

  // A new user copies it: a new list in their account, with both places.
  const viewer = await createTestUser({ name: "E2E Lists Viewer" });
  const b = await openAsTestUser(browser, viewer);
  await b.page.goto(path);
  await b.page.getByRole("button", { name: "Copy to my lists" }).click();
  await expect(b.page).toHaveURL(/\/en\/account\/favorites\?list=/);
  await expect(b.page.getByText("The list was copied to your account").first()).toBeVisible();
  const copied = await sql<{ name: string; n: number }>(
    `SELECT l.name, count(f.id)::int AS n FROM "SavedList" l JOIN "Favorite" f ON f."listId" = l.id WHERE l."userId" = $1 GROUP BY l.name`,
    [viewer.id],
  );
  expect(copied).toEqual([{ name: LIST, n: 2 }]);
  await b.context.close();

  // Stop sharing: the link (and its image) no longer work.
  await a.page.getByRole("button", { name: "Share" }).first().click();
  share = a.page.getByRole("dialog", { name: `Share “${LIST}”` });
  await share.getByRole("button", { name: "Stop sharing" }).click();
  await expect(a.page.getByText("Sharing stopped. The old link no longer works.").first()).toBeVisible();
  const after = await openAs(browser, null);
  expect((await after.page.request.get(path)).status()).toBe(404);
  expect((await after.page.request.get(ogPath)).status()).toBe(404);
  await after.context.close();
  expect(a.consoleErrors).toEqual([]);
  await a.context.close();
});

test("signed out, the heart saves on the device; signing in moves it into the account", async ({ browser }) => {
  const guest = await openAs(browser, null);
  await openSearch(guest.page);
  await card(guest.page, VAKE).getByRole("button", { name: `Save ${VAKE}` }).click();
  await expect(guest.page.getByText("Saved on this device").first()).toBeVisible();
  await expect(card(guest.page, VAKE).getByRole("button", { name: `Remove ${VAKE} from saved` })).toBeVisible();
  expect(await guest.page.evaluate(() => localStorage.getItem("bayit:saved-lists"))).toContain("listingId");

  // "Saved" while signed out: the lists on this device.
  await guest.page.goto("/en/account/favorites");
  await expect(guest.page).toHaveURL(/\/en\/saved$/);
  await expect(guest.page.getByRole("heading", { name: "Saved on this device only" })).toBeVisible();
  await expect(guest.page.getByRole("article", { name: VAKE })).toBeVisible();
  const state = await guest.context.storageState();
  await guest.context.close();

  // The same browser, now signed in: the saved page merges the device's places into the account.
  const user = await createTestUser({ name: "E2E Lists Device" });
  const signedIn = await openAsTestUser(browser, user);
  await signedIn.page.goto("/en");
  await signedIn.page.evaluate((origins) => {
    for (const origin of origins) for (const item of origin.localStorage) localStorage.setItem(item.name, item.value);
  }, state.origins);
  await signedIn.page.goto("/en/account/favorites");
  await expect(signedIn.page.getByText("What you saved on this device is now in your account").first()).toBeVisible();
  await expect
    .poll(async () => (await sql(`SELECT 1 FROM "Favorite" WHERE "userId" = $1`, [user.id])).length)
    .toBe(1);
  await expect(signedIn.page.getByRole("article", { name: VAKE })).toBeVisible();
  expect(await signedIn.page.evaluate(() => localStorage.getItem("bayit:saved-lists"))).toBeNull();
  await signedIn.context.close();
});
