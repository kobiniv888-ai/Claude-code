import { expireDueListings } from "@/lib/listing/lifecycle";
import { isAuthorizedCron, runCronJob, unauthorized } from "../auth";

/**
 * GET /api/cron/expire-listings — hourly (vercel.json).
 * Sends "about to expire" emails, then moves LIVE listings past their expiry date to EXPIRED.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();
  return runCronJob("expire-listings", () => expireDueListings());
}
