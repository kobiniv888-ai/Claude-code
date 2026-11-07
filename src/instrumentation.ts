import type { Instrumentation } from "next";

/**
 * Runs once when the server starts: a loud warning when nobody could log in
 * (src/lib/auth/login-methods.ts), when links that leave the site would not be on the
 * permanent address (SITE_URL, src/lib/site-url.ts) and when Google could not index the site
 * (SITE_URL missing, so every page is noindex: src/lib/seo.ts); then, in production, the home
 * pages and their first-screen photos are prepared in the background (src/lib/warm-start.ts).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
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

/**
 * Server errors while rendering pages, route handlers, server actions and the proxy go to error
 * monitoring (Sentry, when SENTRY_DSN is set — see src/lib/monitoring.ts).
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("@/lib/monitoring");
  await reportError(error, { kind: context.routeType, route: context.routePath, path: request.path, method: request.method });
};
