import { expect, settle, test } from "./fixtures";
import { BASE_URL } from "./helpers/env";
import { isEssentialCookie } from "../../src/lib/legal/cookies";

/**
 * SECURITY_REPORT 15.10.a: only essential cookies by default. A brand-new visitor (no cookies, an
 * English browser opening Hebrew pages) browses a few public pages: every cookie the browser holds
 * is one of the cookie policy's essential list (src/lib/legal/cookies.ts), and nothing optional
 * appears before or after "Necessary only". The browser storage behind "Preferences" stays empty
 * until the visitor allows it.
 */
test("a first visit sets only essential cookies, before and after the banner's choice", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE_URL, locale: "en-US" });
  const page = await context.newPage();
  try {
    for (const path of ["/he", "/en/search", "/he/legal/cookies"]) {
      await page.goto(path);
      await settle(page);
    }
    const before = (await context.cookies()).map((cookie) => cookie.name);
    expect(before).toContain("bayit_did");
    expect(before).not.toContain("bayit_consent");
    for (const name of before) expect(isEssentialCookie(name), `${name} is not on the essential list`).toBe(true);

    // The banner asks; "Necessary only" saves the choice and nothing optional follows.
    const banner = page.locator("[data-cookie-banner]");
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: /^(הכרחיות בלבד|רק הכרחיות|Necessary only)$/ }).click();
    await expect(banner).toBeHidden();
    await page.goto("/he");
    await settle(page);
    const after = await context.cookies();
    const consent = after.find((cookie) => cookie.name === "bayit_consent");
    expect(consent, "the choice is remembered").toBeTruthy();
    expect(JSON.parse(decodeURIComponent(consent!.value))).toMatchObject({ preferences: false, analytics: false });
    for (const cookie of after) expect(isEssentialCookie(cookie.name), `${cookie.name} is not on the essential list`).toBe(true);

    // "Preferences" storage (recently viewed, last search) is not written without consent.
    const stored = await page.evaluate(() => Object.keys(window.localStorage));
    expect(stored.filter((key) => /recent|last-search|lastSearch/i.test(key))).toEqual([]);
  } finally {
    await context.close();
  }
});
