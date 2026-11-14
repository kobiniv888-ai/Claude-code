import { expect, test } from "./fixtures";
import { BASE_URL } from "./helpers/env";
import { TEST_EMAIL_DOMAIN, createTestUser, freshPhone, sql } from "./helpers/db";

/**
 * Login codes on the server (SECURITY_REPORT 3.1, 3.2): only Israeli and Georgian MOBILE numbers
 * get a code (checked before anything is stored or sent), phone codes are stored only as a keyed
 * hash, and the email-code answer is the same whether or not an account exists. Runs in test mode
 * (codes on screen): nothing is texted or emailed. Fake numbers and addresses only; the suite's
 * clean-up removes the rows.
 */

const headers = { origin: BASE_URL, "content-type": "application/json" };

test("SMS codes only to Israeli and Georgian mobile numbers", async ({ request }) => {
  for (const phoneNumber of ["+12015550123", "+19005550123", "+447911123456", "+79161234567", "+971501234567"]) {
    const response = await request.post("/api/auth/phone-number/send-otp", { data: { phoneNumber }, headers });
    expect(response.status(), phoneNumber).toBe(400);
    expect(((await response.json()) as { code?: string }).code, phoneNumber).toBe("COUNTRY_NOT_SUPPORTED");
  }
  // A Georgian landline (Tbilisi) and an Israeli landline (Jerusalem): mobile numbers only.
  for (const phoneNumber of ["+995322123456", "+97221234567"]) {
    const response = await request.post("/api/auth/phone-number/send-otp", { data: { phoneNumber }, headers });
    expect(response.status(), phoneNumber).toBe(400);
    expect(((await response.json()) as { code?: string }).code, phoneNumber).toBe("NOT_MOBILE_NUMBER");
  }
});

test("a phone code is stored only as a keyed hash", async ({ request }) => {
  const phone = await freshPhone();
  const response = await request.post("/api/auth/phone-number/send-otp", { data: { phoneNumber: phone }, headers });
  expect(response.status(), await response.text()).toBe(200);
  const rows = await sql<{ value: string }>(`SELECT value FROM "Verification" WHERE identifier = $1`, [`phone-number-otp-${phone}`]);
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) expect(row.value).toMatch(/^[0-9a-f]{64}:\d+$/);
  const plain = await sql<{ n: number }>(`SELECT count(*)::int AS n FROM "Verification" WHERE identifier LIKE 'phone-number-otp-%' AND value ~ '^[0-9]{6}:'`);
  expect(plain[0]!.n).toBe(0);
});

test("the email-code answer is the same whether or not an account exists", async ({ request }) => {
  // A test account (removed by the suite's clean-up) and an address nobody has.
  const user = await createTestUser();
  const [known] = await sql<{ email: string }>(`SELECT email FROM "User" WHERE id = $1`, [user.id]);
  const unknown = `nobody-${Date.now()}@${TEST_EMAIL_DOMAIN}`;
  const a = await request.post("/api/auth/email-otp/send-verification-otp", { data: { email: known!.email, type: "sign-in" }, headers });
  const b = await request.post("/api/auth/email-otp/send-verification-otp", { data: { email: unknown, type: "sign-in" }, headers });
  expect(a.status()).toBe(b.status());
  expect(await a.text()).toBe(await b.text());
});

test("the phone picker for SMS codes offers only Israel and Georgia", async ({ page }) => {
  await page.goto("/en/login");
  const phoneTab = page.getByRole("button", { name: "Log in with a phone code (test mode)" });
  test.skip((await phoneTab.count()) === 0, "phone login is shown only in test mode");
  await phoneTab.click();
  await page.getByRole("button", { name: /^Country code / }).click();
  const options = page.getByRole("option");
  await expect(options).toHaveCount(2);
  await expect(options.filter({ hasText: "+972" })).toHaveCount(1);
  await expect(options.filter({ hasText: "+995" })).toHaveCount(1);
});
