import { runPriceDropAlerts } from "@/lib/alerts/price-drop-run";
import { codeDisplayForHeaders } from "@/lib/auth/code-display";
import { runSavedSearchAlerts } from "@/lib/saved-searches/run";
import { isAuthorizedCron, runCronJob, runCronSteps, unauthorized } from "../auth";

/**
 * GET /api/cron/saved-alerts — the saved-search email (new places, at most one a day per user)
 * and the price-drop emails (round 3, brief 7.4). In the founder's daily-summary window: 08:00 to
 * 11:59 Israel time, never on Shabbat or Yom Tov. vercel.json calls it every hour from 05:29 to
 * 09:29 UTC (08:29 to 11:29 Israel time in winter, 08:29 to 12:29 in summer, when the last call is
 * "too_late"), so a failed run is retried that morning; every user is claimed before their email
 * and every price drop before its email, so an extra or concurrent call never sends twice
 * (src/lib/saved-searches/run.ts, src/lib/alerts/price-drop-run.ts). Needs CRON_SECRET.
 *
 * Development and test mode only (never on the real site, the same rule as the on-screen login
 * codes in src/lib/auth/code-display.ts): `?at=<ISO time>` runs it as if it were that moment and
 * `?user=<user id>` limits it to one user, for the end-to-end test.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();
  const params = new URL(request.url).searchParams;
  const testing = codeDisplayForHeaders(request.headers) !== null;
  const at = testing ? params.get("at") : null;
  const user = testing ? params.get("user") : null;
  const now = at && !Number.isNaN(Date.parse(at)) ? new Date(at) : new Date();
  const onlyUserId = user && /^[A-Za-z0-9_-]{1,64}$/.test(user) ? user : null;
  return runCronJob("saved-alerts", () =>
    runCronSteps("saved-alerts", {
      savedSearches: () => runSavedSearchAlerts(now, { onlyUserId }),
      priceDrops: () => runPriceDropAlerts(now, { onlyUserId }),
    }),
  );
}
