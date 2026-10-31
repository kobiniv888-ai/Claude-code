import "server-only";
import { safeEqual } from "@/lib/crypto";
import { reportError } from "@/lib/monitoring";

/**
 * Shared by the cron route handlers (not a route itself).
 *
 * Every cron endpoint needs `Authorization: Bearer <CRON_SECRET>` — Vercel Cron sends exactly
 * this header when CRON_SECRET is set in the project. In development `?secret=<CRON_SECRET>`
 * also works, so a job can be run from the browser. Without CRON_SECRET every call is refused.
 */

export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.warn("[cron] CRON_SECRET is not set — refusing the request (see .env.example).");
    return false;
  }
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Bearer ") && safeEqual(header.slice(7).trim(), secret)) return true;
  if (process.env.NODE_ENV === "development") {
    const query = new URL(request.url).searchParams.get("secret");
    if (query && safeEqual(query, secret)) return true;
  }
  return false;
}

const NO_STORE = { "Cache-Control": "no-store" };

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
}

/** Runs a job, logs how long it took and answers { ok, job, durationMs, ...result }. */
export async function runCronJob(job: string, task: () => Promise<Record<string, unknown>>): Promise<Response> {
  const started = Date.now();
  try {
    const result = await task();
    const durationMs = Date.now() - started;
    console.info(`[cron] ${job} done in ${durationMs} ms`, result);
    return Response.json({ ok: true, job, durationMs, ...result }, { headers: NO_STORE });
  } catch (error) {
    console.error(`[cron] ${job} failed:`, error);
    await reportError(error, { kind: "cron", tags: { job } });
    return Response.json({ ok: false, job, error: "server_error" }, { status: 500, headers: NO_STORE });
  }
}
