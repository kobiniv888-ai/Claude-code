import { runSecurityAlerts } from "@/lib/security/alerts";
import { isAuthorizedCron, runCronJob, unauthorized } from "../auth";

/**
 * GET /api/cron/security-alerts — hourly (vercel.json; SECURITY_REPORT 16.3). Reads the last hour
 * of the security event log, the audit log and new accounts, listings and bookings, and tells the
 * founder by email and Telegram when a rule fires (src/lib/security/alerts-rules.ts): staff
 * logins from new devices and staff security changes, 2-step locks, recovery codes, code and
 * failure spikes, SMS pauses, ID guessing, cap spikes, sign-up bursts (alert only), role changes,
 * maintenance mode, "sign everyone out", off-site backup failures, unreadable encrypted fields,
 * the HTTPS certificate, support tickets past the reply promise. Once per kind per hour. Needs
 * CRON_SECRET.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();
  return runCronJob("security-alerts", async () => ({ ...(await runSecurityAlerts()) }));
}
