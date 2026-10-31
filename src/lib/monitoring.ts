/**
 * Server error monitoring (Sentry-compatible), without an SDK.
 *
 * When SENTRY_DSN is set, unexpected server errors are sent to Sentry's envelope endpoint:
 * crashes while rendering pages and route handlers (src/instrumentation.ts → onRequestError),
 * unexpected errors inside server actions (toActionError in @/lib/action) and failed
 * scheduled jobs (runCronJob). Without SENTRY_DSN — and in the browser — it does nothing.
 *
 * Privacy: only the error (type, message, stack), the path WITHOUT its query string, the method
 * and the route are sent. Never headers, cookies, request bodies or user data.
 */

export type ErrorContext = {
  /** Where it happened: "render", "route", "action", "proxy", "cron"… */
  kind: string;
  /** Route file path, e.g. "/[locale]/listing/[id]" (used as the Sentry transaction). */
  route?: string;
  /** Request path; anything after "?" or "#" is dropped. */
  path?: string;
  method?: string;
  /** Short, non-personal labels (job name…). */
  tags?: Record<string, string>;
};

export type ParsedDsn = { publicKey: string; envelopeUrl: string };

/** "https://<key>@<host>[/<path>]/<projectId>" → the envelope URL and the public key (null if invalid). */
export function parseDsn(dsn: string | undefined | null): ParsedDsn | null {
  if (!dsn?.trim()) return null;
  let url: URL;
  try {
    url = new URL(dsn.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const publicKey = decodeURIComponent(url.username);
  const segments = url.pathname.split("/").filter(Boolean);
  const projectId = segments.pop();
  if (!publicKey || !projectId || !/^\d+$/.test(projectId)) return null;
  const prefix = segments.length ? `/${segments.join("/")}` : "";
  return { publicKey, envelopeUrl: `${url.protocol}//${url.host}${prefix}/api/${projectId}/envelope/` };
}

/** Drops the query string and fragment (they can hold tokens, phone numbers or search text). */
export function stripQuery(path: string | undefined): string | undefined {
  if (!path) return undefined;
  return path.split(/[?#]/, 1)[0] || "/";
}

function describeError(error: unknown): { type: string; message: string; stack?: string; digest?: string } {
  const digest =
    typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : undefined;
  if (error instanceof Error) {
    return { type: error.name || "Error", message: error.message.slice(0, 2000), stack: error.stack?.slice(0, 8000), digest };
  }
  return { type: "NonError", message: String(error).slice(0, 2000), digest };
}

function newEventId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "");
}

/** The Sentry envelope (three JSON lines) for one error event. Pure — exported for tests. */
export function buildEnvelope(
  error: unknown,
  context: ErrorContext,
  options: { eventId?: string; now?: Date; environment?: string; release?: string } = {},
): string {
  const now = options.now ?? new Date();
  const eventId = options.eventId ?? newEventId();
  const info = describeError(error);
  const path = stripQuery(context.path);
  const event = {
    event_id: eventId,
    timestamp: now.getTime() / 1000,
    platform: "node",
    level: "error",
    logger: "bayit",
    environment: options.environment ?? "production",
    ...(options.release ? { release: options.release } : {}),
    transaction: context.route ?? path,
    tags: { kind: context.kind, ...(info.digest ? { digest: info.digest } : {}), ...context.tags },
    ...(path ? { request: { method: context.method ?? "GET", url: path } } : {}),
    exception: { values: [{ type: info.type, value: info.message }] },
    ...(info.stack ? { extra: { stack: info.stack } } : {}),
  };
  return [
    JSON.stringify({ event_id: eventId, sent_at: now.toISOString() }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
}

const MAX_PER_MINUTE = 30;
let windowStart = 0;
let sentInWindow = 0;

/** Sends one error to Sentry. Never throws; a no-op without SENTRY_DSN or in the browser. */
export async function reportError(error: unknown, context: ErrorContext): Promise<void> {
  if (typeof window !== "undefined") return;
  const dsn = parseDsn(process.env.SENTRY_DSN);
  if (!dsn) return;
  // A crash loop must not flood the monitoring account (per server instance).
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    sentInWindow = 0;
  }
  if (++sentInWindow > MAX_PER_MINUTE) return;
  try {
    const body = buildEnvelope(error, context, {
      environment: process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV,
      release: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    });
    await fetch(dsn.envelopeUrl, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=bayit-monitoring/1.0`,
      },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
  } catch {
    // Monitoring must never break the request; the error is already in the server log.
  }
}
