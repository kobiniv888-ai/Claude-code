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
  let code: string | null = null;
  await expect
    .poll(
      async () => {
        const res = await request.get(`/api/dev/last-otp?phone=${encodeURIComponent(phone)}`);
        expect(res.status(), "GET /api/dev/last-otp (development server without Twilio)").toBe(200);
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

/** Fills the phone form (login page or login dialog) and the development code. */
export async function loginThroughForm(page: Page, phone: string, scope: Page | Locator = page) {
  const national = phone.replace(/^\+995/, "");
  await scope.getByRole("textbox", { name: "Phone number" }).fill(national);
  await scope.getByRole("button", { name: "Send code" }).click();
  const code = await devOtp(page.context().request, phone);
  // The form submits by itself once the 6 digits are in.
  await scope.getByLabel("6-digit code").fill(code);
}
