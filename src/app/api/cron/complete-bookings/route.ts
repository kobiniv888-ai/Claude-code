import { completeFinishedBookings, expireHostAskedAnswers } from "@/lib/booking/service";
import { isAuthorizedCron, runCronJob, unauthorized } from "../auth";

/**
 * GET /api/cron/complete-bookings — daily (vercel.json).
 * Confirmed bookings become COMPLETED the day after check-out (Georgia time), and the guest gets a
 * thank-you email. Idempotent: only CONFIRMED bookings change, one by one.
 * Also the "the host asked me to cancel" timeout (founder's answer (4)): those the host did not
 * answer within 72 hours go to the admin review queue (expireHostAskedAnswers).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();
  return runCronJob("complete-bookings", async () => {
    const completed = await completeFinishedBookings();
    const hostAsked = await expireHostAskedAnswers();
    return { ...completed, hostAskedExpired: hostAsked.expired };
  });
}
