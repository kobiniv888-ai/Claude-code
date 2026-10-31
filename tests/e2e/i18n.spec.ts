import { expect, settle, test } from "./fixtures";

/** Definition of done: all 5 languages switch correctly; Hebrew and Arabic are right-to-left. */
const LOCALES = [
  { code: "he", dir: "rtl", name: "עברית" },
  { code: "en", dir: "ltr", name: "English" },
  { code: "ru", dir: "ltr", name: "Русский" },
  { code: "ar", dir: "rtl", name: "العربية" },
  { code: "ka", dir: "ltr", name: "ქართული" },
] as const;

test.describe("languages", () => {
  for (const locale of LOCALES) {
    test(`/${locale.code} loads ${locale.dir.toUpperCase()} without errors`, async ({ page, consoleErrors }) => {
      const response = await page.goto(`/${locale.code}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", locale.code);
      await expect(page.locator("html")).toHaveAttribute("dir", locale.dir);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("main").getByRole("group").first()).toBeVisible();
      await settle(page);
      // Nothing sticks out sideways (360 px phones included).
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      expect(consoleErrors).toEqual([]);
    });
  }

  test("the language switcher keeps the page and its filters", async ({ page }) => {
    await page.goto("/en/search?city=tbilisi&deal=short-stay");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Tbilisi");
    await settle(page);
    await page.getByRole("contentinfo").getByRole("button", { name: /Change language/ }).click();
    await page.getByRole("menuitem", { name: /עברית/ }).click();
    await expect(page).toHaveURL(/\/he\/search\?/);
    expect(new URL(page.url()).searchParams.get("city")).toBe("tbilisi");
    expect(new URL(page.url()).searchParams.get("deal")).toBe("short-stay");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("טביליסי");

    await settle(page);
    await page.getByRole("contentinfo").getByRole("button", { name: /שפה|Language/ }).click();
    await page.getByRole("menuitem", { name: /العربية/ }).click();
    await expect(page).toHaveURL(/\/ar\/search\?/);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  });

  test("the root address redirects by Accept-Language", async ({ playwright, baseURL }) => {
    const cases: [string, string][] = [
      ["he-IL,he;q=0.9", "/he"],
      ["ru-RU,ru;q=0.9,en;q=0.5", "/ru"],
      ["ar", "/ar"],
      ["ka-GE", "/ka"],
      ["fr-FR,fr;q=0.9", "/en"],
    ];
    for (const [acceptLanguage, target] of cases) {
      const request = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "accept-language": acceptLanguage } });
      const response = await request.get("/", { maxRedirects: 0 });
      expect([307, 308], `status for ${acceptLanguage}`).toContain(response.status());
      expect(new URL(response.headers()["location"], baseURL).pathname, `redirect for ${acceptLanguage}`).toBe(target);
      await request.dispose();
    }
  });

  test("a browser in Hebrew lands on /he", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ locale: "he-IL", baseURL });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/he$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await context.close();
  });

  for (const locale of ["en", "he"] as const) {
    test(`unknown pages show the designed 404 page (${locale})`, async ({ page }) => {
      const response = await page.goto(`/${locale}/this-page-does-not-exist`);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(locale === "en" ? "We couldn't find this page" : /.+/);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "he" ? "rtl" : "ltr");
      // A clear next step: search or go home.
      await expect(page.getByRole("main").getByRole("link").first()).toBeVisible();
    });
  }
});
