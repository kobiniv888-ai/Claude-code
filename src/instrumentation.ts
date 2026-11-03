import type { Instrumentation } from "next";

/** Runs once when the server starts: a loud warning when nobody could log in (src/lib/auth/login-methods.ts). */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loginMethodsWarning } = await import("@/lib/auth/login-methods");
  const warning = loginMethodsWarning(process.env);
  if (warning) console.error(`\n${warning}\n`);
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
