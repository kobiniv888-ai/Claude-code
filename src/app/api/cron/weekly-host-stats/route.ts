import { codeDisplayForHeaders } from "@/lib/auth/code-display";
import { runWeeklyHostStats } from "@/lib/alerts/weekly-host-stats";
import { isAuthorizedCron, runCronJob, unauthorized } from "../auth";

/**
 * GET /api/cron/weekly-host-stats — the hosts' weekly stats email (round 3, brief 6.2; founder's
 * answer 10: Sunday 09:00 Israel time). vercel.json calls it every hour from 06:11 to 09:11 UTC
 * on Sunday to Tuesday: 08:11 to 11:11 Israel time in winter (UTC+2) and 09:11 to 12:11 in summer
 * (UTC+3); outside 09:00–11:59 on the week's due day (Sunday, or the next day after a Yom Tov
 * Sunday) a call does nothing, and every host is claimed before their email, so an extra call
 * never sends twice (src/lib/alerts/weekly-host-stats.ts).
 *
 * Development and test mode only (never on the real site, the same rule as the on-screen login
 * codes in src/lib/auth/code-display.ts): `?at=<ISO time>` runs it as if it were that moment and
 * `?host=<user id>` limits it to one host, for the end-to-end test.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();
  const params = new URL(request.url).searchParams;
  const testing = codeDisplayForHeaders(request.headers) !== null;
  const at = testing ? params.get("at") : null;
  const host = testing ? params.get("host") : null;
  const now = at && !Number.isNaN(Date.parse(at)) ? new Date(at) : new Date();
  const onlyHostId = host && /^[A-Za-z0-9_-]{1,64}$/.test(host) ? host : null;
  return runCronJob("weekly-host-stats", () => runWeeklyHostStats(now, { onlyHostId }));
}
