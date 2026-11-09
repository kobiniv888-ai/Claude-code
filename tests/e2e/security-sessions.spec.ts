import { expect, openAs, openAsTestUser, settle, test } from "./fixtures";
import { loginByPhone } from "./helpers/auth";
import { adminCode, createTestStaff, TEST_ADMIN_PHONE, verifyTwoFactor } from "./helpers/staff";
import { createTestListing, createTestUser, sql } from "./helpers/db";

/**
 * Sessions and 2-step login in the browser (SECURITY_REPORT 3.5, 3.6, 3.7). For the gate: run on a
 * production build (`next start`, http://localhost counts as secure in Chromium).
 *
 * - 3.5.a: the session cookie is "__Host-bayit.session_token": Secure, HttpOnly, SameSite=Lax,
 *   Path=/, no Domain. Staff get "__Host-bayit.staff" (SameSite=Strict) with the 2-step code, and
 *   the admin panel refuses a verified session without it.
 * - 3.5.b: the 2-step step gives the session a new id: the cookie from before it no longer works.
 * - 3.6: a sensitive change (deleting the account) first asks "Confirm it's you".
 * - 3.6.c / 12.6.c: a destructive admin action (a ban) first asks for a NEW authenticator code;
 *   an emailed code is not offered, and nothing changes until the code is given.
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
  // (Next's own route announcer is an empty role="alert" too: match the form's message.)
  await expect(page.getByRole("alert").filter({ hasText: "recovery code isn’t right" })).toBeVisible();
  await context.close();
});

test("deleting the account first asks for a fresh code", async ({ browser }) => {
  const user = await createTestUser({ name: "E2E Fresh" });
  // A session with no code entered in it (a login code counts as a fresh proof for 5 minutes,
  // src/lib/auth/hooks.ts), like a phone left signed in: deleting must ask for a code first.
  const { context, page } = await openAsTestUser(browser, user);
  await page.goto("/en/account/settings#delete");
  await settle(page);
  await page.getByRole("button", { name: "Delete my account" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("textbox").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete forever" }).click();
  await expect(page.getByRole("dialog", { name: "Confirm it’s you" })).toBeVisible();
  // Refused on the server: the account is still there.
  expect(await sql(`SELECT 1 FROM "User" WHERE id = $1`, [user.id])).toHaveLength(1);
  await context.close();
});

test("a ban first asks the admin for a fresh authenticator code; nothing changes before it (3.6.c)", async ({ browser }) => {
  const user = await createTestUser({ name: "E2E Ban Target" });
  // An admin of its own (not the shared test admin), so no other test's session is touched.
  const staff = await createTestStaff({ role: "SUPPORT", name: "E2E Proof Admin" });
  await sql(`UPDATE "User" SET role = 'ADMIN' WHERE id = $1`, [staff.id]);
  const { context, page, consoleErrors } = await openAs(browser, null);
  await loginByPhone(page, staff.phone);
  await verifyTwoFactor(page, `/en/admin/users/${user.id}`, staff.phone);
  // The 2-step login left a 5-minute proof in this session: remove it, like an admin whose last
  // code was entered a while ago (src/lib/admin/server/staff-proof.ts).
  const proofRows = `SELECT 'fresh-proof:' || id FROM "Session" WHERE "userId" = $1`;
  await sql(`DELETE FROM "Verification" WHERE identifier IN (${proofRows})`, [staff.id]);
  await settle(page);
  await page.getByRole("button", { name: "Ban", exact: true }).click();
  const confirm = page.getByRole("dialog").or(page.getByRole("alertdialog")).filter({ hasText: "Ban E2E Ban Target" });
  await confirm.getByRole("combobox", { name: "Reason" }).click();
  await page.getByRole("option", { name: "Spam" }).click();
  await confirm.getByRole("button", { name: "Ban account" }).click();

  const proof = page.getByRole("dialog", { name: "Confirm with your authenticator" });
  await expect(proof).toBeVisible();
  await expect(proof).toContainText("an email code is not enough");
  // Refused on the server until the code is given: the account is still active.
  expect((await sql<{ status: string }>(`SELECT status FROM "User" WHERE id = $1`, [user.id]))[0].status).toBe("ACTIVE");

  await proof.getByLabel("Authenticator code").fill(await adminCode(staff.phone));
  await expect.poll(async () => (await sql<{ status: string }>(`SELECT status FROM "User" WHERE id = $1`, [user.id]))[0].status).toBe("BANNED");
  await expect(page.getByText("The account is banned.")).toBeVisible();
  // One code, one destructive action: the proof was spent.
  expect(await sql(`SELECT 1 FROM "Verification" WHERE identifier IN (${proofRows}) AND "expiresAt" > now()`, [staff.id])).toHaveLength(0);
  expect(consoleErrors).toEqual([]);
  await context.close();
});

test("changing a live listing's contact number first asks the host for a fresh code (3.6.a)", async ({ browser }) => {
  const owner = await createTestUser({ name: "E2E Contact Host" });
  const listing = await createTestListing({ ownerId: owner.id, title: `E2E Contact change ${Date.now().toString(36)}`, status: "LIVE" });
  const before = (await sql<{ contact: string }>(`SELECT "contactMethods"::text AS contact FROM "Listing" WHERE id = $1`, [listing.id]))[0].contact;
  // A session with no code entered in it (like a phone left signed in).
  const { context, page } = await openAsTestUser(browser, owner);
  await page.goto(`/en/account/listings/${listing.id}/edit?step=12`);
  await expect(page.getByRole("heading", { name: "How should guests contact you?" })).toBeVisible();
  await settle(page);
  const whatsapp = page.getByRole("textbox", { name: "WhatsApp number" });
  // The country code (+995) is its own field: the national number only.
  await whatsapp.fill("555990777");
  await expect(whatsapp).toHaveValue(/555\s?99\s?07\s?77/);
  await whatsapp.blur();
  await expect(page.getByRole("dialog", { name: "Confirm it’s you" })).toBeVisible();
  // Refused on the server: the guests still see the old details, and nothing was marked as changed.
  const after = (await sql<{ contact: string; changed: Date | null }>(`SELECT "contactMethods"::text AS contact, "contactChangedAt" AS changed FROM "Listing" WHERE id = $1`, [listing.id]))[0];
  expect(after.contact).toBe(before);
  expect(after.changed).toBeNull();
  await context.close();
});

test("support staff see only the last 2 digits of a phone on the user page; an ADMIN sees it all (founder's answer c)", async ({ browser }) => {
  const user = await createTestUser({ name: "E2E Masked Phone" });
  const last2 = user.phone.slice(-2);
  const staff = await createTestStaff({ role: "SUPPORT", name: "E2E Support Viewer" });
  const { context, page } = await openAs(browser, null);
  await loginByPhone(page, staff.phone);
  await verifyTwoFactor(page, `/en/admin/users/${user.id}`, staff.phone);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("E2E Masked Phone");
  await expect(page.getByText(`••• ••• ••${last2}`).first()).toBeVisible();
  // Neither the page nor its data carries the number, in any spacing (the test email holds the
  // digits without "+", so look for the "+" forms).
  const html = (await page.content()).replace(/[\s ‎‏()-]/g, "");
  expect(html).not.toContain(user.phone);
  const rsc = await page.request.get(`/en/admin/users/${user.id}`, { headers: { RSC: "1" } });
  expect((await rsc.text()).replace(/[\s ‎‏()-]/g, "")).not.toContain(user.phone);
  await context.close();

  const admin = await openAs(browser, TEST_ADMIN_PHONE);
  await admin.page.goto(`/en/admin/users/${user.id}`);
  const adminHtml = (await admin.page.content()).replace(/[\s ‎‏()-]/g, "");
  expect(adminHtml).toContain(user.phone);
  await admin.context.close();
});
