/**
 * The Node.js half of src/instrumentation.ts register() (imported only when NEXT_RUNTIME is
 * "nodejs", so the Edge bundle never contains `process.exit`).
 * 1. The settings check (src/lib/startup-check.ts, SECURITY_REPORT 2.2.j / 3.4.b / 20.8): when
 *    SITE_ENV is missing or invalid, a required secret is missing or weak, or a setting is unsafe
 *    for this kind of site (test mode on the real site…), the process EXITS with code 1 and a
 *    list of what to fix. Fail closed: no request is ever served with such settings.
 * 2. Loud warnings when nobody could log in (src/lib/auth/login-methods.ts), when links that
 *    leave the site would not be on the permanent address (SITE_URL, src/lib/site-url.ts) and when
 *    Google could not index the site (src/lib/seo.ts).
 * 3. In production builds, the home pages and their first-screen photos are prepared in the
 *    background (src/lib/warm-start.ts).
 */
import { formatStartupProblems, startupProblems, startupWarnings } from "@/lib/startup-check";

export async function registerNode(): Promise<void> {
  const problems = startupProblems(process.env);
  if (problems.length > 0) {
    console.error(`\n${formatStartupProblems(problems)}\n`);
    process.exit(1);
  }
  for (const warning of startupWarnings(process.env)) console.warn(`\n${warning}\n`);
  const [{ loginMethodsWarning }, { siteUrlWarning }, { indexingWarning }, { warmOnStart }] = await Promise.all([
    import("@/lib/auth/login-methods"),
    import("@/lib/site-url"),
    import("@/lib/seo"),
    import("@/lib/warm-start"),
  ]);
  const warning = loginMethodsWarning(process.env);
  if (warning) console.error(`\n${warning}\n`);
  for (const message of [siteUrlWarning(process.env), indexingWarning(process.env)]) {
    if (message?.level === "error") console.error(`\n${message.text}\n`);
    else if (message) console.info(message.text);
  }
  warmOnStart();
}
