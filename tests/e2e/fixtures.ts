import fs from "node:fs";
import { test as base, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { acceptCookies, loginByPhone } from "./helpers/auth";
import { withAdvisoryLock } from "./helpers/db";
import { ADMIN_STATE_FILE, TEST_ADMIN_PHONE, verifyTwoFactor } from "./helpers/staff";

/** Console noise that is not an app error (external photos that cannot load offline, dev HMR). */
const IGNORED_CONSOLE = [/Failed to load resource/i, /\[HMR\]/, /\[Fast Refresh\]/, /Download the React DevTools/];

/**
 * Errors thrown by the development server's hot reload itself (e.g. a refresh message that
 * arrives while the page is still starting, when a file in the working tree changes).
 */
const IGNORED_PAGE_ERROR_STACK = [/\bhmrRefresh\b/, /WebSocket\.handleMessage/];

/** Collects every console error and uncaught page error of a page (minus the noise above). */
export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  // While the development server hot-reloads a changed file (and just after), React may log
  // transient warnings: they are not errors of the page itself.
  let refreshing = false;
  let refreshedAt = 0;
  const duringRefresh = () => refreshing || Date.now() - refreshedAt < 3_000;
  page.on("console", (message) => {
    const text = message.text();
    if (/\[Fast Refresh\] rebuilding/.test(text)) refreshing = true;
    if (/\[Fast Refresh\] done/.test(text)) {
      refreshing = false;
      refreshedAt = Date.now();
    }
    if (message.type() !== "error" || duringRefresh()) return;
    if (!IGNORED_CONSOLE.some((pattern) => pattern.test(text))) errors.push(text.slice(0, 500));
  });
  page.on("pageerror", (error) => {
    if (IGNORED_PAGE_ERROR_STACK.some((pattern) => pattern.test(error.stack ?? ""))) return;
    errors.push(`pageerror: ${error.message}`.slice(0, 500));
  });
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
 * The test admin's signed-in, 2-step-verified browser state, shared by every worker of the run
 * (a file the global setup clears): each authenticator code costs one of the 5 tries the server
 * allows per 10 minutes, so the admin logs in once per run, under a database lock.
 */
async function adminState(browser: Browser): Promise<StorageState> {
  const cached = sessions.get(TEST_ADMIN_PHONE);
  if (cached) return cached;
  const state = await withAdvisoryLock(4615_0001, async () => {
    if (fs.existsSync(ADMIN_STATE_FILE)) return JSON.parse(fs.readFileSync(ADMIN_STATE_FILE, "utf8")) as StorageState;
    const use = test.info().project.use;
    const context = await browser.newContext({ baseURL: use.baseURL, userAgent: use.userAgent, viewport: use.viewport, locale: use.locale });
    const page = await context.newPage();
    await acceptCookies(page);
    await loginByPhone(page, TEST_ADMIN_PHONE);
    await verifyTwoFactor(page);
    const fresh = await context.storageState();
    await context.close();
    fs.writeFileSync(ADMIN_STATE_FILE, JSON.stringify(fresh));
    return fresh;
  });
  sessions.set(TEST_ADMIN_PHONE, state);
  return state;
}

/**
 * A second browser (its own cookies) with the project's settings, signed in with `phone` when
 * given, e.g. the admin next to the owner. Close it with `context.close()`. The test admin
 * (TEST_ADMIN_PHONE) comes with its 2-step login done (helpers/staff.ts).
 */
export async function openAs(browser: Browser, phone: string | null, storageState?: StorageState) {
  const use = test.info().project.use;
  const cached = phone === TEST_ADMIN_PHONE && !storageState ? await adminState(browser) : phone ? sessions.get(phone) : undefined;
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
