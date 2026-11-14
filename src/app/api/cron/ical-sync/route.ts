import { syncIcalImports } from "@/lib/ical";
import { isAuthorizedCron, runCronJob, unauthorized } from "../auth";

/**
 * GET /api/cron/ical-sync — every hour (vercel.json).
 * Re-imports the Airbnb / Booking.com calendars of listings that have import URLs; imported nights
 * block bookings on Bayit. Overlaps with confirmed Bayit bookings are logged ("conflicts").
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();
  return runCronJob("ical-sync", () => syncIcalImports());
}
