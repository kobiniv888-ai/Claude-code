import { expect, openAs, settle, test } from "./fixtures";
import { DEMO, loginByPhone } from "./helpers/auth";
import { sql, withAdvisoryLock } from "./helpers/db";
import { adminCode, TEST_ADMIN_PHONE } from "./helpers/staff";

/**
 * Staff log in with REAL 2-step login (founder's answer 1, round 3), in production mode too: a phone
 * code, then the authenticator code. A wrong code is refused. In production mode the demo admin
 * can't skip the authenticator step (the development shortcut is for `next dev` only).
 */

test("the admin panel asks for the authenticator code; a wrong code is refused, the right one opens it", async ({ browser }) => {
  const { context, page, consoleErrors } = await openAs(browser, null);
  // One worker at a time logs the admin in (a phone code replaces the previous one, and the server
  // takes each authenticator code only once).
  await withAdvisoryLock(4615_0001, async () => {
    await loginByPhone(page, TEST_ADMIN_PHONE);
    await page.goto("/en/admin");
    await expect(page).toHaveURL(/\/en\/two-factor\?next=(%2F|\/)admin/);
    await expect(page.getByRole("heading", { level: 1, name: "2-step login" })).toBeVisible();
    await settle(page);
    const field = page.getByLabel("Authenticator code");
    const right = await adminCode();
    const wrong = right === "000000" ? "111111" : "000000";
    await field.fill(wrong);
    await expect(page.getByRole("alert").filter({ hasText: "That code isn't right" })).toHaveText("That code isn't right. Enter the current code from your app.");
    await expect(page).toHaveURL(/\/two-factor/);
    await field.fill(right);
    await page.waitForURL((url) => url.pathname === "/en/admin", { timeout: 60_000 });
  });
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
  await context.close();
});

test("the demo admin can't skip 2-step login outside the development server", async ({ browser }) => {
  const { context, page } = await openAs(browser, DEMO.admin);
  await page.goto("/en/admin");
  // The development server shows its strip on every page; `next start` never does.
  const development = (await page.getByRole("note").filter({ hasText: "Development version" }).count()) > 0;
  if (development) {
    // `next dev` with DEV_SKIP_STAFF_2FA=true: demo staff only, on localhost.
    test.info().annotations.push({ type: "mode", description: "development server: the demo shortcut applies" });
    await expect(page).toHaveURL(/\/en\/(admin|two-factor\/setup)/);
  } else {
    await expect(page).toHaveURL(/\/en\/two-factor\/setup\?next=/);
    await expect(page.getByRole("heading", { level: 1, name: "Turn on 2-step login" })).toBeVisible();
  }
  await context.close();
  // The set-up page started a pending secret for the demo admin (15 minutes): remove it.
  await sql(`DELETE FROM "Verification" WHERE identifier = 'totp-enroll:' || (SELECT id FROM "User" WHERE "phoneNumber" = $1)`, [DEMO.admin]);
});
