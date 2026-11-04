import { runDailySummary } from "@/lib/alerts/daily-summary";
import { isAuthorizedCron, runCronJob, unauthorized } from "../auth";

/**
 * GET /api/cron/daily-summary — the founder's daily summary (round 3, brief 9): 08:00 Israel time,
 * not on Shabbat or Yom Tov. vercel.json calls it at 05:03 and 06:03 UTC, which is 08:03 Israel
 * time in summer and in winter; any extra call is harmless: at most one summary per Israel day
 * (src/lib/alerts/daily-summary.ts claims the day first).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();
  return runCronJob("daily-summary", () => runDailySummary());
}
