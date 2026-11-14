import { randomBytes } from "node:crypto";
import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { sql, TEST_EMAIL_DOMAIN } from "./db";
import { BASE_URL } from "./env";
import { answerTermsStep, TERMS_BOX_NAME } from "./terms";

/** Demo logins (docs/DEMO-DATA.md). */
export const DEMO = {
  admin: "+995555000001",
  moderator: "+995555000002",
  support: "+995555000003",
  editor: "+995555000004",
  ownerYossi: "+995555000011",
  guest: "+995555000021",
} as const;

/** The development login code for a phone (GET /api/dev/last-otp). */
export async function devOtp(request: APIRequestContext, phone: string): Promise<string> {
  return pollDevCode(request, `phone=${encodeURIComponent(phone)}`);
}

/** The development login code for an email address (GET /api/dev/last-otp?email=). */
export async function devEmailOtp(request: APIRequestContext, email: string): Promise<string> {
  return pollDevCode(request, `email=${encodeURIComponent(email)}`);
}

async function pollDevCode(request: APIRequestContext, query: string): Promise<string> {
  let code: string | null = null;
  await expect
    .poll(
      async () => {
        const res = await request.get(`/api/dev/last-otp?${query}`);
        expect(res.status(), "GET /api/dev/last-otp (development server, or AUTH_TEST_MODE on localhost)").toBe(200);
        code = ((await res.json()) as { code: string | null }).code;
        return code;
      },
      { timeout: 15_000 },
    )
    .toMatch(/^\d{6}$/);
  return code as unknown as string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The site's own HOURLY login-request windows (src/lib/auth/login-rate-limit.ts LOGIN_CODE_LIMITS:
 * 20 code requests and 30 code checks an hour per IP, 5 per number or address). The whole suite
 * runs from 127.0.0.1 and signs in far more often than one person could, so it would hit them
 * mid-run. TEST-ONLY reset: the helper clears those windows in the local test database and asks
 * again. The server has no bypass; the resend waits and daily caps do not apply to codes shown on
 * screen in test mode (they cost nothing and reach nobody), and the real limits are unit-tested
 * (login-rate-limit.test.ts, code-rules.test.ts).
 */
async function clearHourlyLoginWindows() {
  await sql(
    `DELETE FROM "RateLimit" WHERE key LIKE 'auth:otp-send:%' OR key LIKE 'auth:email-otp-send:%' OR key LIKE 'auth:otp-verify:%'`,
  );
}

/**
 * A Better Auth call that waits out its rate limit. In production mode (`next start`) Better Auth
 * allows 10 phone-login requests a minute per IP, and every test runs from 127.0.0.1: on 429 the
 * test waits the X-Retry-After seconds the server names and tries again, like a patient person.
 * Our own hourly windows ("RATE_LIMITED") are cleared instead (clearHourlyLoginWindows).
 */
async function authPost(request: APIRequestContext, path: string, data: Record<string, unknown>) {
  const headers = { origin: BASE_URL, "content-type": "application/json" };
  for (let attempt = 0; ; attempt += 1) {
    const response = await request.post(path, { data, headers });
    if (response.status() !== 429 || attempt >= 3) return response;
    const body = (await response.json().catch(() => null)) as { code?: string } | null;
    if (body?.code === "RATE_LIMITED") {
      await clearHourlyLoginWindows();
      continue;
    }
    const wait = Number(response.headers()["x-retry-after"] ?? "60");
    await sleep((Math.min(Number.isFinite(wait) ? wait : 60, 65) + 1) * 1000);
  }
}

/**
 * Signs the page's browser context in with a phone code through the Better Auth API (the same
 * calls the login form makes). Creates the account when the phone is new.
 */
export async function loginByPhone(page: Page, phone: string) {
  const request = page.context().request;
  const send = await authPost(request, "/api/auth/phone-number/send-otp", { phoneNumber: phone });
  expect(send.status(), `send-otp: ${await send.text()}`).toBe(200);
  const code = await devOtp(request, phone);
  const verify = await authPost(request, "/api/auth/phone-number/verify", { phoneNumber: phone, code });
  expect(verify.status(), `verify: ${await verify.text()}`).toBe(200);
}

/**
 * Signs in with an email code through the Better Auth API (what the email form does). Creates the
 * account when the address is new (it then still needs a first name: pass `firstName`).
 */
export async function loginByEmail(page: Page, email: string, opts: { firstName?: string } = {}) {
  const request = page.context().request;
  const send = await authPost(request, "/api/auth/email-otp/send-verification-otp", { email, type: "sign-in" });
  expect(send.status(), `send email code: ${await send.text()}`).toBe(200);
  const otp = await devEmailOtp(request, email);
  const verify = await authPost(request, "/api/auth/sign-in/email-otp", { email, otp });
  expect(verify.status(), `sign in: ${await verify.text()}`).toBe(200);
  if (opts.firstName) {
    const { sql } = await import("./db");
    await sql(`UPDATE "User" SET "firstName" = $1 WHERE email = $2`, [opts.firstName, email.toLowerCase()]);
    // The sign-up's "18 or older + Terms" step (SECURITY_REPORT 15.11.b/c), as the login form logs it.
    const { TERMS_VERSION } = await import("../../../src/lib/legal/terms");
    await sql(
      `INSERT INTO "TermsAcceptance" (id, "userId", version, "ageConfirmed", "acceptedAt")
       SELECT md5(random()::text || clock_timestamp()::text), id, $1, true, now() FROM "User" WHERE email = $2
         AND NOT EXISTS (SELECT 1 FROM "TermsAcceptance" t WHERE t."userId" = "User".id)`,
      [TERMS_VERSION, email.toLowerCase()],
    );
  }
}

/** Pre-accepts the cookie banner (necessary only), so it never covers buttons. */
export async function acceptCookies(page: Page) {
  await page.context().addCookies([
    {
      name: "bayit_consent",
      value: encodeURIComponent(JSON.stringify({ necessary: true, preferences: false, analytics: false, v: 1 })),
      url: BASE_URL,
    },
  ]);
}

/**
 * Presses "Send code" and waits for the code field. If the server's rate limit answers instead
 * (production mode: 10 phone-login requests a minute per IP, all tests share 127.0.0.1), waits a
 * minute and presses it again, like a person would after "Please wait a few minutes".
 */
async function sendCodeWaitingOutLimit(scope: Page | Locator, button: Locator) {
  const codeField = scope.getByLabel("6-digit code");
  const limited = scope.getByText("Too many attempts. Please wait a few minutes and try again.");
  for (let attempt = 0; ; attempt += 1) {
    await button.click();
    await expect(codeField.or(limited).first()).toBeVisible({ timeout: 30_000 });
    if (!(await limited.isVisible()) || attempt >= 2) return;
    await sleep(61_000);
  }
}

/**
 * Founder's answer (5), 9 Nov 2026: every account has an email. A NEW phone sign-up (phone login
 * exists only in development and staging) is asked for one before anything else: a test address
 * (removed by the clean-up), confirmed with the code test mode shows on screen. An email sign-up
 * goes straight to the terms step.
 */
async function answerAccountEmailStep(scope: Page | Locator) {
  const title = scope.getByText(/^(Add your email address|הוסיפו כתובת אימייל)$/);
  const terms = scope.getByRole("checkbox", { name: TERMS_BOX_NAME });
  await expect(title.or(terms).first()).toBeVisible({ timeout: 30_000 });
  if (!(await title.isVisible())) return;
  await scope.getByRole("textbox", { name: /^(Email address|כתובת אימייל)$/ }).fill(`e2e-${randomBytes(5).toString("hex")}@${TEST_EMAIL_DOMAIN}`);
  await scope.getByRole("button", { name: /^(Send code|שליחת קוד)$/ }).click();
  const shown = scope.getByText(/^(Your code:|הקוד שלך:)/);
  await expect(shown).toBeVisible({ timeout: 30_000 });
  const code = ((await shown.textContent()) ?? "").match(/\d{6}/)?.[0] ?? "";
  await scope.getByLabel(/^(6-digit code|קוד בן 6 ספרות)$/).fill(code);
  await scope.getByRole("button", { name: /^(Confirm|אישור)$/ }).click();
  await expect(title).toBeHidden({ timeout: 30_000 });
}

/**
 * A brand-new account answers the "18 or older + Terms" step (SECURITY_REPORT 15.11.b/c) and then
 * the first-name step that follow its first sign-in.
 */
async function answerFirstName(scope: Page | Locator, firstName: string | undefined) {
  if (!firstName) return;
  await answerAccountEmailStep(scope);
  await answerTermsStep(scope);
  const field = scope.getByRole("textbox", { name: "First name" });
  await expect(field).toBeVisible({ timeout: 30_000 });
  await field.fill(firstName);
  await scope.getByRole("button", { name: "Continue" }).click();
}

/**
 * Fills the email form (login page or login dialog) and the development code. A new address
 * creates the account: pass `firstName` to answer the first-name step.
 */
export async function loginThroughEmailForm(page: Page, email: string, scope: Page | Locator = page, opts: { firstName?: string } = {}) {
  await scope.getByRole("textbox", { name: "Email" }).fill(email);
  await sendCodeWaitingOutLimit(scope, scope.getByRole("button", { name: "Email me a code" }));
  const code = await devEmailOtp(page.context().request, email);
  await scope.getByLabel("6-digit code").fill(code);
  await answerFirstName(scope, opts.firstName);
}

/**
 * Fills the phone form (development / test mode: "Log in with a phone code") and the development
 * code. A new number creates the account: pass `firstName` to answer the first-name step.
 */
export async function loginThroughForm(page: Page, phone: string, scope: Page | Locator = page, opts: { firstName?: string } = {}) {
  // The email form comes first; phone login is behind a link in development / test mode.
  await scope.getByRole("button", { name: "Log in with a phone code (test mode)" }).click();
  const national = phone.replace(/^\+995/, "");
  // English pages start on +972 (guests are mostly Israeli); the demo accounts are Georgian.
  const country = scope.getByRole("button", { name: /^Country code/ });
  if (!((await country.textContent()) ?? "").includes("+995")) {
    await country.click();
    await page.getByPlaceholder("Search country or code").fill("995");
    await page.getByRole("option", { name: /\+995/ }).click();
  }
  await scope.getByRole("textbox", { name: "Phone number" }).fill(national);
  await sendCodeWaitingOutLimit(scope, scope.getByRole("button", { name: "Send code" }));
  const code = await devOtp(page.context().request, phone);
  // The form submits by itself once the 6 digits are in.
  await scope.getByLabel("6-digit code").fill(code);
  await answerFirstName(scope, opts.firstName);
}
