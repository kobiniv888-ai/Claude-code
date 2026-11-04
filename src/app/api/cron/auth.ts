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

/**
 * Thrown by a job made of independent steps when all of them ran but some failed (each one
 * already logged and reported): answered 500 with every step's result.
 */
export class CronStepsFailed extends Error {
  constructor(readonly result: Record<string, unknown>) {
    super("Some steps of the cron job failed");
  }
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
    if (error instanceof CronStepsFailed) {
      const durationMs = Date.now() - started;
      console.error(`[cron] ${job} finished in ${durationMs} ms with failed steps`, error.result);
      return Response.json({ ok: false, job, durationMs, error: "steps_failed", ...error.result }, { status: 500, headers: NO_STORE });
    }
    console.error(`[cron] ${job} failed:`, error);
    await reportError(error, { kind: "cron", tags: { job } });
    return Response.json({ ok: false, job, error: "server_error" }, { status: 500, headers: NO_STORE });
  }
}

/**
 * Runs the independent steps of one job in order, each on its own: a step that fails is logged,
 * reported and recorded as `{ error: "failed" }`, and the steps after it still run. Answers every
 * step's result; throws CronStepsFailed (runCronJob answers 500 with the results) if any failed.
 */
export async function runCronSteps(job: string, steps: Record<string, () => Promise<unknown>>): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};
  let failed = false;
  for (const [step, run] of Object.entries(steps)) {
    try {
      results[step] = await run();
    } catch (error) {
      failed = true;
      results[step] = { error: "failed" };
      console.error(`[cron] ${job}: step ${step} failed:`, error);
      await reportError(error, { kind: "cron", tags: { job, step } });
    }
  }
  if (failed) throw new CronStepsFailed(results);
  return results;
}
