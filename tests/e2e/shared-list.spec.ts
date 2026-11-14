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

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * A sentence with a list's name in it: the page isolates the user-written name (FSI … PDI, so
 * "2027 Gudauri" keeps its order in Hebrew; bidi-1), so withList("Share ", LIST) matches
 * "Share “" + FSI + LIST + PDI + "”" (and the plain form).
 */
const withList = (before: string, name: string) => new RegExp(`${escapeRegExp(before)}“\u2068?${escapeRegExp(name)}\u2069?”`);

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
  await expect(a.page.getByText(withList("Saved to ", LIST)).first()).toBeVisible();
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
  let share = a.page.getByRole("dialog", { name: withList("Share ", LIST) });
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
  share = a.page.getByRole("dialog", { name: withList("Share ", LIST) });
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

test("any signed-in page moves the device's saved places into the account, not only the saved page (lists-alerts-3)", async ({ browser }) => {
  const user = await createTestUser({ name: "E2E Lists Auto Merge" });
  // The Vake demo place (its English title is a translation).
  const listing = (await sql<{ id: string }>(`SELECT "listingId" AS id FROM "ListingTranslation" WHERE title = $1 LIMIT 1`, [VAKE]))[0];
  expect(listing).toBeTruthy();
  const signedIn = await openAsTestUser(browser, user);
  await signedIn.page.goto("/en/help");
  // What a signed-out visit left on this device (as the heart writes it).
  await signedIn.page.evaluate((listingId) => {
    localStorage.setItem("bayit:saved-lists", JSON.stringify({ lists: [], items: [{ listingId, listKey: "default", savedAt: Date.now() - 1000 }], defaultUsedAt: null }));
  }, listing.id);
  // The next page (any page) merges it: logging out later can no longer lose it.
  await signedIn.page.goto("/en/help");
  await expect
    .poll(async () => (await sql(`SELECT 1 FROM "Favorite" WHERE "userId" = $1 AND "listingId" = $2`, [user.id, listing.id])).length)
    .toBe(1);
  await expect.poll(() => signedIn.page.evaluate(() => localStorage.getItem("bayit:saved-lists"))).toBeNull();
  expect(signedIn.consoleErrors).toEqual([]);
  await signedIn.context.close();
});

test("switching lists never carries the last list's share link or text over; a new list can't be called “Saved” (ui-1, ui-2, lists-alerts-10)", async ({ browser }) => {
  const user = await createTestUser({ name: "E2E Lists Tabs" });
  const stamp = Date.now().toString(36);
  const shared = { id: `e2e-list-a-${stamp}`, name: `E2E Shared ${stamp}`, token: `e2e${stamp}`.padEnd(43, "x") };
  const plain = { id: `e2e-list-b-${stamp}`, name: `E2E Plain ${stamp}` };
  await sql(
    `INSERT INTO "SavedList" (id, "userId", name, "isDefault", "shareToken", "sharedAt", "createdAt", "updatedAt") VALUES
       ($1, $3, $4, false, $5, now(), now(), now()),
       ($2, $3, $6, false, NULL, NULL, now(), now())`,
    [shared.id, plain.id, user.id, shared.name, shared.token, plain.name],
  );
  const { context, page, consoleErrors } = await openAsTestUser(browser, user);
  const tabs = page.getByRole("navigation", { name: "My lists" });

  // The shared list's sheet shows its live link.
  await page.goto(`/en/account/favorites?list=${shared.id}`);
  await page.getByRole("button", { name: "Share" }).first().click();
  let sheet = page.getByRole("dialog", { name: withList("Share ", shared.name) });
  await expect(sheet.getByRole("textbox", { name: "Link to the list" })).toHaveValue(new RegExp(`/lists/${shared.token}$`));
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // Another tab (a soft navigation): its own sheet, never the other list's link.
  await tabs.getByRole("link", { name: new RegExp(escapeRegExp(plain.name)) }).click();
  await expect(page).toHaveURL(new RegExp(`list=${plain.id}`));
  await page.getByRole("button", { name: "Share" }).first().click();
  sheet = page.getByRole("dialog", { name: withList("Share ", plain.name) });
  await expect(sheet.getByRole("button", { name: "Create a share link" })).toBeVisible();
  await expect(sheet.getByRole("textbox", { name: "Link to the list" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // "New list": the default list's name is taken; after a create the sheet starts empty again.
  await page.getByRole("button", { name: "New list" }).click();
  let create = page.getByRole("dialog", { name: "New list" });
  await create.getByLabel("List name").fill("Saved");
  await create.getByRole("button", { name: "Create list" }).click();
  await expect(create.getByRole("alert")).toHaveText("You already have a list with this name.");
  await create.getByLabel("List name").fill(`E2E Third ${stamp}`);
  await create.getByRole("button", { name: "Create list" }).click();
  await expect(create).toBeHidden();
  await expect(tabs.getByRole("link", { name: new RegExp(`E2E Third ${stamp}`) })).toBeVisible();
  await page.getByRole("button", { name: "New list" }).click();
  create = page.getByRole("dialog", { name: "New list" });
  await expect(create.getByLabel("List name")).toHaveValue("");
  await expect(create.getByRole("alert")).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
  await context.close();
});
