import { syncIcalImports } from "@/lib/ical";
import { isAuthorizedCron, runCronJob, unauthorized } from "../auth";

/**
 * GET /api/cron/ical-sync — every 3 hours (vercel.json).
 * Re-imports the Airbnb / Booking.com calendars of listings that have import URLs.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();
  return runCronJob("ical-sync", () => syncIcalImports());
}
