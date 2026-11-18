import { sendBookingReminders } from "@/lib/booking/service";
import { isAuthorizedCron, runCronJob, unauthorized } from "../auth";

/**
 * GET /api/cron/booking-reminders — daily (vercel.json), in the Georgian morning.
 * Emails and texts both sides 3 days before arrival (catching up on missed days). Idempotent:
 * each booking is claimed with reminderSentAt before anything is sent.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();
  return runCronJob("booking-reminders", () => sendBookingReminders());
}
