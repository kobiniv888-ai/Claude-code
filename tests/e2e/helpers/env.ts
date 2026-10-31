/** Where the tests run (playwright.config.ts starts or reuses a dev server on this port). */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3601);
export const BASE_URL = `http://localhost:${E2E_PORT}`;
/** Added to the browser user agent, so sessions created by the tests can be found and removed. */
export const E2E_USER_AGENT_TAG = "BayitE2E";
