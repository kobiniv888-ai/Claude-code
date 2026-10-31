import { test as base, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { acceptCookies, loginByPhone } from "./helpers/auth";

/** Console noise that is not an app error (external photos that cannot load offline, dev HMR). */
const IGNORED_CONSOLE = [/Failed to load resource/i, /\[HMR\]/, /\[Fast Refresh\]/, /Download the React DevTools/];

/** Collects every console error and uncaught page error of a page (minus the noise above). */
export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (!IGNORED_CONSOLE.some((pattern) => pattern.test(text))) errors.push(text.slice(0, 500));
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`.slice(0, 500)));
  return errors;
}

/**
 * `page` with the cookie banner already answered, and `consoleErrors`: every console error and
 * uncaught page error of the test (assert it is empty where the page must be clean).
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  // (The fixture callback is not named `use`, so the React hooks lint rule leaves it alone.)
  page: async ({ page }, provide) => {
    await acceptCookies(page);
    await provide(page);
  },
  consoleErrors: async ({ page }, provide) => {
    await provide(trackConsoleErrors(page));
  },
});

export { expect };

/** Waits until client components are interactive (Next dev compiles on first use). */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

/**
 * Sessions already opened in this worker, by phone. Login codes are rate-limited per IP
 * (20 an hour), so the demo admin logs in once per worker instead of once per test.
 */
const sessions = new Map<string, StorageState>();

/**
 * A second browser (its own cookies) with the project's settings, signed in with `phone` when
 * given, e.g. the admin next to the owner. Close it with `context.close()`.
 */
export async function openAs(browser: Browser, phone: string | null, storageState?: StorageState) {
  const use = test.info().project.use;
  const cached = phone ? sessions.get(phone) : undefined;
  const context = await browser.newContext({
    baseURL: use.baseURL,
    userAgent: use.userAgent,
    viewport: use.viewport,
    locale: use.locale,
    timezoneId: use.timezoneId,
    storageState: storageState ?? cached,
  });
  const page = await context.newPage();
  const consoleErrors = trackConsoleErrors(page);
  await acceptCookies(page);
  if (phone && !cached) {
    await loginByPhone(page, phone);
    sessions.set(phone, await context.storageState());
  }
  return { context, page, consoleErrors };
}
