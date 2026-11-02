import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { BASE_URL } from "./env";

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

/**
 * Signs the page's browser context in with a phone code through the Better Auth API (the same
 * calls the login form makes). Creates the account when the phone is new.
 */
export async function loginByPhone(page: Page, phone: string) {
  const request = page.context().request;
  const headers = { origin: BASE_URL, "content-type": "application/json" };
  const send = await request.post("/api/auth/phone-number/send-otp", { data: { phoneNumber: phone }, headers });
  expect(send.status(), `send-otp: ${await send.text()}`).toBe(200);
  const code = await devOtp(request, phone);
  const verify = await request.post("/api/auth/phone-number/verify", { data: { phoneNumber: phone, code }, headers });
  expect(verify.status(), `verify: ${await verify.text()}`).toBe(200);
}

/**
 * Signs in with an email code through the Better Auth API (what the email form does). Creates the
 * account when the address is new (it then still needs a first name: pass `firstName`).
 */
export async function loginByEmail(page: Page, email: string, opts: { firstName?: string } = {}) {
  const request = page.context().request;
  const headers = { origin: BASE_URL, "content-type": "application/json" };
  const send = await request.post("/api/auth/email-otp/send-verification-otp", { data: { email, type: "sign-in" }, headers });
  expect(send.status(), `send email code: ${await send.text()}`).toBe(200);
  const otp = await devEmailOtp(request, email);
  const verify = await request.post("/api/auth/sign-in/email-otp", { data: { email, otp }, headers });
  expect(verify.status(), `sign in: ${await verify.text()}`).toBe(200);
  if (opts.firstName) {
    const { sql } = await import("./db");
    await sql(`UPDATE "User" SET "firstName" = $1 WHERE email = $2`, [opts.firstName, email.toLowerCase()]);
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

/** A brand-new account answers the first-name step that follows its first sign-in. */
async function answerFirstName(scope: Page | Locator, firstName: string | undefined) {
  if (!firstName) return;
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
  await scope.getByRole("button", { name: "Email me a code" }).click();
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
  await scope.getByRole("button", { name: "Send code" }).click();
  const code = await devOtp(page.context().request, phone);
  // The form submits by itself once the 6 digits are in.
  await scope.getByLabel("6-digit code").fill(code);
  await answerFirstName(scope, opts.firstName);
}
