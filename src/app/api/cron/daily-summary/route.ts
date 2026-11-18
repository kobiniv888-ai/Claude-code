import { runDailySummary } from "@/lib/alerts/daily-summary";
import { isAuthorizedCron, runCronJob, unauthorized } from "../auth";

/**
 * GET /api/cron/daily-summary — the founder's daily summary (round 3, brief 9): 08:00 Israel time,
 * not on Shabbat or Yom Tov. vercel.json calls it every hour from 05:03 to 09:03 UTC: 08:03 to
 * 11:03 Israel time in winter (UTC+2) and 08:03 to 12:03 in summer (UTC+3, the 12:03 call is
 * "too_late"), so a failed send is retried that morning in both seasons; any extra call is
 * harmless: at most one summary per Israel day (src/lib/alerts/daily-summary.ts claims the day first).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();
  return runCronJob("daily-summary", () => runDailySummary());
}
