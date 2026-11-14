import { expect, openAs, openAsTestUser, settle, test } from "./fixtures";
import { createTestUser, sql } from "./helpers/db";
import { answerStaffProof, TEST_ADMIN_PHONE } from "./helpers/staff";

/**
 * Maintenance mode (SECURITY_REPORT 12.5.c, 17.1 "contain"): the admin switch closes the whole site
 * in one step — every visitor (and every account that is not an ADMIN with its 2-step code) gets
 * the 503 page in their language with Retry-After — while the admin keeps the panel and the site.
 *
 * It closes the site for EVERY test, so this file runs in its own Playwright project, after all the
 * others (playwright.config.ts "maintenance", dependencies: desktop + mobile). Whatever happens,
 * the switch is turned off again at the end.
 */

const SETTING = "maintenanceMode";

async function storedOn(): Promise<boolean> {
  const [row] = await sql<{ on: boolean | null }>(`SELECT (value->>'on')::boolean AS on FROM "SiteSetting" WHERE key = $1`, [SETTING]);
  return row?.on === true;
}

test.afterAll(async () => {
  // Never leave the site closed (MAINTENANCE_CACHE_MS later every server reads it again).
  await sql(`UPDATE "SiteSetting" SET value = '{"on": false, "since": null, "by": null}'::jsonb WHERE key = $1`, [SETTING]);
});

test("maintenance mode: visitors get the 503 page with Retry-After, the admin keeps the panel and the site", async ({ browser, request }) => {
  test.slow();
  const member = await createTestUser({ name: "E2E Maintenance Member" });
  const admin = await openAs(browser, TEST_ADMIN_PHONE);
  const signedIn = await openAsTestUser(browser, member);
  try {
    expect(await storedOn()).toBe(false);
    await admin.page.goto("/en/admin/maintenance");
    await settle(admin.page);

    // ── On, from Admin → Maintenance (a fresh authenticator code, audited) ──
    await admin.page.getByRole("button", { name: "Turn on maintenance mode" }).click();
    const confirmOn = admin.page.getByRole("alertdialog").or(admin.page.getByRole("dialog")).filter({ hasText: "Turn on maintenance mode?" });
    await confirmOn.getByRole("button", { name: "Turn on maintenance mode" }).click();
    await answerStaffProof(admin.page, admin.page.getByText("Maintenance mode is on: visitors see"));
    await expect.poll(storedOn).toBe(true);
    const [audit] = await sql<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'maintenance.mode_on' AND "createdAt" > now() - interval '5 minutes'`);
    expect(audit.n).toBeGreaterThan(0);

    // A visitor: the calm 503 page in their language, with Retry-After (within the 10-second cache).
    await expect.poll(async () => (await request.get("/he")).status(), { timeout: 30_000 }).toBe(503);
    const closed = await request.get("/he/search?city=tbilisi");
    expect(closed.status()).toBe(503);
    expect(closed.headers()["retry-after"]).toBe("600");
    expect(closed.headers()["cache-control"] ?? "").toMatch(/no-store/);
    const html = await closed.text();
    expect(html).toContain('lang="he"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("נחזור בעוד כמה דקות");
    // Public APIs answer a 503 too; the health check and security.txt stay reachable.
    expect((await request.get("/api/map/community")).status()).toBe(503);
    expect([200, 503]).toContain((await request.get("/api/health")).status());
    expect([200, 404]).toContain((await request.get("/.well-known/security.txt")).status());
    // No login texts go out while the site is closed (SMS pumping is one reason to close it).
    expect((await request.post("/api/auth/phone-number/send-otp", { data: { phoneNumber: member.phone } })).status()).toBe(503);

    // A signed-in account that is not an ADMIN waits like everyone else.
    const memberPage = await signedIn.context.request.get("/en/account");
    expect(memberPage.status()).toBe(503);

    // The admin (2-step done in this session) still has the panel and the public site.
    const panel = await admin.page.goto("/en/admin");
    expect(panel?.status()).toBe(200);
    await expect(admin.page.getByRole("heading", { level: 1 })).toBeVisible();
    const home = await admin.page.goto("/he");
    expect(home?.status()).toBe(200);
    await expect(admin.page.locator("main")).toBeVisible();

    // ── Off again, the same way ──
    await admin.page.goto("/en/admin/maintenance");
    await settle(admin.page);
    await admin.page.getByRole("button", { name: "Turn off maintenance mode" }).click();
    const confirmOff = admin.page.getByRole("alertdialog").or(admin.page.getByRole("dialog")).filter({ hasText: "Turn off maintenance mode?" });
    await confirmOff.getByRole("button", { name: "Turn off maintenance mode" }).click();
    await answerStaffProof(admin.page, admin.page.getByText("The site is open to everyone."));
    await expect.poll(storedOn).toBe(false);
    await expect.poll(async () => (await request.get("/he")).status(), { timeout: 30_000 }).toBe(200);
    expect(admin.consoleErrors).toEqual([]);
  } finally {
    await admin.context.close();
    await signedIn.context.close();
  }
});
