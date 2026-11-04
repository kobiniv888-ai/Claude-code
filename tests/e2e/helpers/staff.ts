/**
 * Staff logins for the end-to-end tests: REAL 2-step login (an authenticator code), in production
 * mode too. There is no bypass flag: the test admin is an ordinary staff account with 2-step login
 * turned on, and the tests compute its authenticator code the way an app does.
 *
 * - The global setup creates the test admin (a test phone, role ADMIN, not a demo account) with a
 *   random TOTP secret per run, stored encrypted like `src/lib/auth/two-factor.ts` stores it
 *   (AES-256-GCM with APP_ENCRYPTION_KEY from .env; the server must use the same .env).
 * - `adminCode()` computes the code with the same algorithm as `src/lib/auth/totp.ts` (RFC 6238:
 *   SHA-1, 6 digits, 30 seconds), for a time step the server has not accepted yet (it refuses a
 *   code twice), so two workers never send the same code.
 * - `verifyTwoFactor(page)` enters it on /two-factor, like a person with the app.
 *
 * The account and its rows match the test phone prefix, so cleanupTestData() removes them.
 */
import os from "node:os";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { freshPhone, newId, sql, TEST_EMAIL_DOMAIN, TEST_PHONE_PREFIX } from "./db";
import { E2E_PORT } from "./env";
import { decryptSecret, encryptSecret, newTotpSecret, nextCodeStep, totpCodeAt } from "./totp";

/** The test admin's phone (inside the test range, so the cleanup finds it). */
export const TEST_ADMIN_PHONE = `${TEST_PHONE_PREFIX}0001`;

/** The test admin's verified browser state, shared by the workers of one run (fixtures.ts). */
export const ADMIN_STATE_FILE = path.join(os.tmpdir(), `bayit-e2e-admin-${E2E_PORT}.json`);

/**
 * Creates (or resets) the test admin with 2-step login on and a fresh random secret. Called by the
 * global setup after the cleanup, so every run starts with a new account and empty rate limits.
 */
export async function createTestAdmin(): Promise<{ id: string; phone: string }> {
  const secret = newTotpSecret();
  const existing = await sql<{ id: string }>(`SELECT id FROM "User" WHERE "phoneNumber" = $1`, [TEST_ADMIN_PHONE]);
  const id = existing[0]?.id ?? newId();
  if (existing[0]) {
    await sql(`UPDATE "User" SET role = 'ADMIN', "twoFactorEnabled" = true, "totpSecret" = $2, "updatedAt" = now() WHERE id = $1`, [id, encryptSecret(secret)]);
  } else {
    await sql(
      `INSERT INTO "User" (id, name, "firstName", email, "emailVerified", "phoneNumber", "phoneNumberVerified", role, locale, "twoFactorEnabled", "totpSecret", "updatedAt")
       VALUES ($1, 'E2E Admin', 'E2E', $2, false, $3, true, 'ADMIN', 'en', true, $4, now())`,
      [id, `admin-${TEST_ADMIN_PHONE.slice(1)}@${TEST_EMAIL_DOMAIN}`, TEST_ADMIN_PHONE, encryptSecret(secret)],
    );
  }
  await sql(`DELETE FROM "Verification" WHERE identifier = $1`, [`totp-last:${id}`]);
  return { id, phone: TEST_ADMIN_PHONE };
}

/**
 * Another staff account for role checks (e.g. a MODERATOR), with 2-step login on and its own random
 * secret, like the test admin. A test phone and a test email address, so cleanupTestData() removes
 * it; it signs in with an email code (loginByEmail) and then `verifyTwoFactor(page, next, phone)`.
 */
export async function createTestStaff(opts: { role: "MODERATOR" | "SUPPORT" | "EDITOR"; name: string }): Promise<{ id: string; phone: string; email: string; name: string }> {
  const id = newId();
  const phone = await freshPhone();
  const email = `${phone.slice(1)}@${TEST_EMAIL_DOMAIN}`;
  await sql(
    `INSERT INTO "User" (id, name, "firstName", email, "emailVerified", "phoneNumber", "phoneNumberVerified", role, locale, "twoFactorEnabled", "totpSecret", "updatedAt")
     VALUES ($1, $2, $3, $4, false, $5, true, $6::"UserRole", 'en', true, $7, now())`,
    [id, opts.name, opts.name.split(" ").pop(), email, phone, opts.role, encryptSecret(newTotpSecret())],
  );
  return { id, phone, email, name: opts.name };
}

/**
 * A code the server will accept now for the staff account with `phone` (the test admin by
 * default): the current time step, or a later one when that step was already used (the server
 * accepts one step ahead, and never the same step twice).
 */
export async function adminCode(phone = TEST_ADMIN_PHONE): Promise<string> {
  const [admin] = await sql<{ id: string; totpSecret: string | null }>(`SELECT id, "totpSecret" FROM "User" WHERE "phoneNumber" = $1`, [phone]);
  if (!admin?.totpSecret) throw new Error(`No staff account with 2-step login for ${phone} (the global setup creates the test admin, tests/e2e/global-setup.ts)`);
  const secret = decryptSecret(admin.totpSecret);
  const [last] = await sql<{ value: string }>(
    `SELECT value FROM "Verification" WHERE identifier = $1 ORDER BY "createdAt" DESC LIMIT 1`,
    [`totp-last:${admin.id}`],
  );
  const step = nextCodeStep(Date.now(), last ? Number(last.value) : null);
  // A step more than one ahead would be refused: wait for the clock (at most 30 seconds).
  if (step.waitMs > 0) await new Promise((resolve) => setTimeout(resolve, step.waitMs + 200));
  return totpCodeAt(secret, step.counter);
}

/**
 * The second step of logging in, as a person does it: /two-factor, the 6-digit code from the app
 * (the form submits by itself), then on to `next`. `phone`: whose app (the test admin by default).
 */
export async function verifyTwoFactor(page: Page, next = "/en/admin", phone = TEST_ADMIN_PHONE) {
  await page.goto(`/en/two-factor?next=${encodeURIComponent(next)}`);
  const field = page.getByLabel("Authenticator code");
  await expect(field).toBeVisible();
  await field.fill(await adminCode(phone));
  await page.waitForURL((url) => url.pathname === next, { timeout: 60_000 });
}
