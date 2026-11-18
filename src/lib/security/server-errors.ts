import "server-only";
import { recordSecurityEvent } from "./events";

/**
 * Unexpected server errors as security events ("server_error"), for the founder's error-spike
 * alert (SECURITY_REPORT 16.3; ./alerts-rules.ts error_spike). Called next to reportError (Sentry)
 * by src/instrumentation.ts (pages, route handlers, server actions) and the cron helpers, so the
 * email + Telegram channel hears about a burst of 500s even without a Sentry alert rule.
 *
 * Capped per server instance (SERVER_ERROR_EVENTS_PER_HOUR): a crash loop must not flood the
 * table; the cap is far above the alert threshold, so a spike still shows. Best effort: never
 * throws (a database that is down cannot record it; Sentry and the log still have it). The meta
 * holds the kind and a job name only, never the message.
 */

export const SERVER_ERROR_EVENTS_PER_HOUR = 120;

let windowStartedAt = 0;
let recordedInWindow = 0;

/** Should this error be recorded (the per-instance hourly cap)? Exported for tests. */
export function takeServerErrorSlot(now: number = Date.now()): boolean {
  if (now - windowStartedAt >= 3600_000) {
    windowStartedAt = now;
    recordedInWindow = 0;
  }
  if (recordedInWindow >= SERVER_ERROR_EVENTS_PER_HOUR) return false;
  recordedInWindow += 1;
  return true;
}

/** Records one server error (kind: render / route / action / cron…; job: a cron job's name). */
export async function recordServerError(kind: string, job?: string): Promise<void> {
  try {
    if (!takeServerErrorSlot()) return;
    await recordSecurityEvent({ type: "server_error", ip: null, meta: { kind: kind.slice(0, 40), ...(job ? { job: job.slice(0, 60) } : {}) } });
  } catch {
    // Best effort.
  }
}
