import { expect, openAs, settle, test } from "./fixtures";
import { loginByPhone } from "./helpers/auth";
import { createTestStaff, verifyTwoFactor } from "./helpers/staff";
import { createTestUser } from "./helpers/db";

/**
 * Sessions and 2-step login in the browser (SECURITY_REPORT 3.5, 3.6, 3.7). For the gate: run on a
 * production build (`next start`, http://localhost counts as secure in Chromium).
 *
 * - 3.5.a: the session cookie is "__Host-bayit.session_token": Secure, HttpOnly, SameSite=Lax,
 *   Path=/, no Domain. Staff get "__Host-bayit.staff" (SameSite=Strict) with the 2-step code, and
 *   the admin panel refuses a verified session without it.
 * - 3.5.b: the 2-step step gives the session a new id: the cookie from before it no longer works.
 * - 3.6: a sensitive change (deleting the account) first asks "Confirm it's you".
 * - 3.7.c: /two-factor offers a recovery code.
 */

test("the login cookie is __Host- with Secure, HttpOnly, SameSite=Lax and no Domain", async ({ browser }) => {
  const user = await createTestUser({ name: "E2E Cookie" });
  const { context, page } = await openAs(browser, user.phone);
  await page.goto("/en/account");
  await settle(page);
  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === "__Host-bayit.session_token");
  expect(session, cookies.map((c) => c.name).join(", ")).toBeTruthy();
  expect(session).toMatchObject({ secure: true, httpOnly: true, sameSite: "Lax", path: "/" });
  // A host-only cookie: no leading dot, exactly this host.
  expect(session!.domain.startsWith(".")).toBe(false);
  expect(cookies.some((c) => c.name.includes("better-auth"))).toBe(false);
  await context.close();
});

test("2-step login rotates the session and sets the Strict staff cookie; the panel needs it", async ({ browser }) => {
  const staff = await createTestStaff({ role: "MODERATOR", name: "E2E Rotation" });
  const { context, page } = await openAs(browser, null);
  await loginByPhone(page, staff.phone);
  const before = (await context.cookies()).find((c) => c.name === "__Host-bayit.session_token");
  expect(before).toBeTruthy();

  await verifyTwoFactor(page, "/en/admin", staff.phone);
  const after = await context.cookies();
  const rotated = after.find((c) => c.name === "__Host-bayit.session_token");
  expect(rotated?.value).not.toBe(before!.value);
  expect(after.find((c) => c.name === "__Host-bayit.staff")).toMatchObject({ sameSite: "Strict", httpOnly: true, secure: true, path: "/" });

  // The token from before the 2-step code is dead.
  const old = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  // (Chromium takes a "__Host-" cookie from the test by domain + path, not by URL.)
  await old.addCookies([{ name: before!.name, value: before!.value, domain: before!.domain, path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  expect(await (await old.request.get("/api/auth/get-session")).json()).toBeNull();
  await old.close();

  // A verified session without the staff cookie (another browser holding a copied session cookie,
  // or a link from another site) does not open the panel: the 2-step page asks again.
  await context.clearCookies({ name: "__Host-bayit.staff" });
  await page.goto("/en/admin");
  await page.waitForURL(/\/en\/two-factor/);
  await expect(page.getByLabel("Authenticator code")).toBeVisible();
  await context.close();
});

test("the 2-step page offers a recovery code instead of the app", async ({ browser }) => {
  const staff = await createTestStaff({ role: "SUPPORT", name: "E2E Recovery" });
  const { context, page } = await openAs(browser, null);
  await loginByPhone(page, staff.phone);
  await page.goto("/en/two-factor?next=/en/admin");
  await page.getByRole("button", { name: /Use a recovery code/ }).click();
  await page.getByLabel("Recovery code").fill("AAAAA-BBBBB");
  await page.getByRole("button", { name: "Log in with a recovery code" }).click();
  await expect(page.getByRole("alert")).toContainText("recovery code isn’t right");
  await context.close();
});

test("deleting the account first asks for a fresh code", async ({ browser }) => {
  const user = await createTestUser({ name: "E2E Fresh" });
  const { context, page } = await openAs(browser, user.phone);
  await page.goto("/en/account/settings#delete");
  await settle(page);
  await page.getByRole("button", { name: "Delete my account" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("textbox").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete forever" }).click();
  await expect(page.getByRole("dialog", { name: "Confirm it’s you" })).toBeVisible();
  await context.close();
});
