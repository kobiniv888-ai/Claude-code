import { expect, openAs, settle, test } from "./fixtures";

/**
 * Operations and incidents (SECURITY_REPORT 18.1, 18.2, 12.5.c), on the running server:
 * - the "Report a security problem" page in all five languages (RTL for Hebrew and Arabic), linked
 *   from the footer, with the safe-harbour promise and no console errors;
 * - /.well-known/security.txt: RFC 9116 fields when SECURITY_CONTACT_EMAIL is set on the server,
 *   404 when it is not (a codespace);
 * - the health check answers without the database details.
 * Maintenance mode itself is not switched on here: it would answer 503 to every other spec running
 * at the same time. Its rules are unit tests (src/lib/maintenance/mode.test.ts,
 * tests/unit/maintenance-viewer-db.test.ts).
 */

const HEADINGS: Record<string, string> = {
  he: "דיווח על בעיית אבטחה",
  en: "Report a security problem",
  ru: "Сообщить о проблеме безопасности",
  ar: "الإبلاغ عن مشكلة أمنية",
  ka: "უსაფრთხოების პრობლემის შეტყობინება",
};

for (const [locale, heading] of Object.entries(HEADINGS)) {
  test(`${locale}: the security page explains how to report, with the promise to researchers`, async ({ browser }) => {
    const { context, page, consoleErrors } = await openAs(browser, null);
    const response = await page.goto(`/${locale}/security`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "he" || locale === "ar" ? "rtl" : "ltr");
    // Six sections: how, our only domain (SECURITY_REPORT 14.4.b), what, next, the promise, what not to do.
    await expect(page.locator("main h2")).toHaveCount(6);
    // The footer links here.
    await expect(page.locator(`footer a[href="/${locale}/security"]`).first()).toBeAttached();
    // A mailto link (SECURITY_CONTACT_EMAIL) or, without it, the support form.
    const mail = page.locator('main a[href^="mailto:"]');
    const form = page.locator(`main a[href*="/help/new-ticket?category=TECHNICAL"]`);
    expect((await mail.count()) + (await form.count())).toBeGreaterThan(0);
    await expect(page.locator('main a[href="/.well-known/security.txt"]')).toBeAttached();
    await settle(page);
    expect(consoleErrors).toEqual([]);
    await context.close();
  });
}

test("the help page links to the security page (18.2)", async ({ browser }) => {
  const { context, page } = await openAs(browser, null);
  for (const locale of ["he", "en"]) {
    await page.goto(`/${locale}/help`);
    await expect(page.locator(`main a[href="/${locale}/security"]`).first()).toBeVisible();
  }
  await context.close();
});

test("security.txt follows RFC 9116 (or is absent without a contact address)", async ({ request }) => {
  const response = await request.get("/.well-known/security.txt");
  if (response.status() === 404) {
    test.info().annotations.push({ type: "note", description: "SECURITY_CONTACT_EMAIL is not set on this server" });
    return;
  }
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");
  const body = await response.text();
  expect(body).toMatch(/^Contact: mailto:[^\s@]+@[^\s@]+$/m);
  expect(body).toMatch(/^Preferred-Languages: he, en$/m);
  expect(body).toMatch(/^Canonical: https?:\/\/\S+\/\.well-known\/security\.txt$/m);
  expect(body).toMatch(/^Policy: https?:\/\/\S+\/he\/security$/m);
  const expires = /^Expires: (\S+)$/m.exec(body)?.[1];
  expect(expires).toBeTruthy();
  const ahead = Date.parse(expires!) - Date.now();
  expect(ahead).toBeGreaterThan(0);
  expect(ahead).toBeLessThan(365 * 24 * 3600 * 1000);
});

test("the health check says only ok / not ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect([200, 503]).toContain(response.status());
  expect(response.headers()["cache-control"]).toContain("no-store");
  const body = JSON.stringify(await response.json());
  expect(body).not.toMatch(/postgres|password|DATABASE_URL|stack/i);
});
