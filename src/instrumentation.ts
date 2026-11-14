import type { Instrumentation } from "next";

/**
 * Runs once when the server starts: on Node.js, src/instrumentation-node.ts — the settings check
 * that REFUSES TO START (exit code 1) with missing or unsafe settings (src/lib/startup-check.ts),
 * then the start-up warnings and the warm-up. `next build` does not run it.
 */
export async function register(): Promise<void> {
  // First of all: every console.* line of this server is scrubbed of emails, phone numbers, login
  // codes, IPs, coordinates and tokens (SECURITY_REPORT 5.l; src/lib/log-scrub.ts).
  const { installLogScrubber } = await import("@/lib/log-scrub");
  installLogScrubber();
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./instrumentation-node");
    await registerNode();
  }
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
