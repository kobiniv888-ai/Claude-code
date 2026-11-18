"use server";

import { headers } from "next/headers";
import { ok, runAction, type ActionResult } from "@/lib/action";
import { requireUserForAction } from "@/lib/auth/session";
import { assertRateLimit } from "@/lib/rate-limit";
import { hostAlertStatus, type HostAlertStatus } from "./alerts";

/**
 * Can the signed-in host take instant bookings right now (round 3, founder's answer 4)? The
 * booking step and the place calendar say why not. Only the host's own status; no input.
 */
export async function hostAlertStatusAction(): Promise<ActionResult<HostAlertStatus>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    await assertRateLimit(`booking:alert-status:${user.id}`, { limit: 60, windowSeconds: 60 });
    return ok(await hostAlertStatus(user.id, await headers()));
  });
}
