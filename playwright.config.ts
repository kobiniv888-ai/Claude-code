import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, E2E_PORT, E2E_USER_AGENT_TAG } from "./tests/e2e/helpers/env";

// The cron routes need CRON_SECRET (the host-stats test runs the weekly email through its route).
// Without one in .env, the tests and the server they start share this test-only value; a server
// started by hand gets the same value (README → "End-to-end tests").
process.env.CRON_SECRET ||= "e2e-only-cron-secret";

/**
 * End-to-end tests (BRIEF section 15, "Definition of done"). See README → "End-to-end tests".
 *
 * The tests run against a development server on port 3601 with its own build folder, so they can
 * run next to `npm run dev`. An already running server on that port is reused, so the same tests
 * run in PRODUCTION mode against a `next start` with `SITE_ENV=development AUTH_TEST_MODE=true` on
 * that port (or on `E2E_PORT`, see README → "End-to-end tests"). The server needs the local
 * database (with `npm run db:seed`) and the login codes on screen (test mode: AUTH_TEST_MODE=true
 * on a development site, no Twilio, `GET /api/dev/last-otp`). Staff tests use real 2-step login: the global setup creates a test
 * admin with an authenticator secret and the tests compute its codes (tests/e2e/helpers/staff.ts).
 */
const PORT = E2E_PORT;
const baseURL = BASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // The dev server compiles each route on first use and can be slow on a busy machine: be generous.
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: process.env.CI ? 1 : 2,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    locale: "en-US",
    timezoneId: "Asia/Tbilisi",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 90_000,
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /mobile\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        userAgent: `${devices["Desktop Chrome"].userAgent} ${E2E_USER_AGENT_TAG}`,
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      // Phones from 360 px: languages/RTL and the guest search flow.
      name: "mobile",
      testMatch: /(i18n|mobile)\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        userAgent: `${devices["Pixel 7"].userAgent} ${E2E_USER_AGENT_TAG}`,
        viewport: { width: 360, height: 780 },
      },
    },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `${baseURL}/en`,
    reuseExistingServer: true,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      NEXT_DIST_DIR: `.next-${PORT}`,
      // A development site in test mode (src/lib/site-env.ts): login codes on screen for the tests.
      SITE_ENV: "development",
      AUTH_TEST_MODE: "true",
      // Better Auth only trusts its own origin: point it at this port.
      BETTER_AUTH_URL: baseURL,
      NEXT_PUBLIC_SITE_URL: baseURL,
      CRON_SECRET: process.env.CRON_SECRET,
    },
  },
});
