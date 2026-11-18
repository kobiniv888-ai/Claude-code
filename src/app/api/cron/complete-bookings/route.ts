import { completeFinishedBookings, expireHostAskedAnswers } from "@/lib/booking/service";
import { isAuthorizedCron, runCronJob, runCronSteps, unauthorized } from "../auth";

/**
 * GET /api/cron/complete-bookings — daily (vercel.json).
 * Confirmed bookings become COMPLETED the day after check-out (Georgia time), and the guest gets a
 * thank-you email. Idempotent: only CONFIRMED bookings change, one by one.
 * Also the "the host asked me to cancel" timeout (founder's answer (4)): those the host did not
 * answer within 72 hours go to the admin review queue (expireHostAskedAnswers). The two steps run
 * independently (runCronSteps): a failing completion never skips the timeout. The timeout also
 * runs hourly from /api/cron/security-alerts, so a case reaches Admin → Flags within an hour of its
 * deadline (FC-5).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();
  return runCronJob("complete-bookings", () =>
    runCronSteps("complete-bookings", {
      completed: () => completeFinishedBookings(),
      hostAskedExpired: async () => (await expireHostAskedAnswers()).expired,
    }),
  );
}
