"use server";

import { headers } from "next/headers";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { assertRateLimit } from "@/lib/rate-limit";
import { auth } from "./server";
import { requireUserForAction } from "./session";

/**
 * "התנתקות מכל המכשירים" (round 3, bug 2.9): ends every session of the signed-in account, this one
 * included. Needs a fully signed-in session (2-step code entered, as the login library's own
 * /revoke-sessions does); staff use is written to the audit log. The browser then signs out and
 * clears its private data (src/lib/auth/logout.ts).
 */
export async function logOutEverywhere(): Promise<ActionResult<{ sessions: number }>> {
  return runAction<{ sessions: number }>(async () => {
    const user = await requireUserForAction();
    await assertRateLimit(`auth:logout-all:${user.id}`, { limit: 5, windowSeconds: 3600 });
    const sessions = await db.session.count({ where: { userId: user.id } });
    const result = await auth.api.revokeSessions({ headers: await headers() }).catch((error: unknown) => {
      console.error("[auth] could not revoke all sessions:", error);
      return null;
    });
    if (!result?.status) return fail("logout_all_failed");
    if (user.isStaff) {
      await audit({
        actorId: user.id,
        action: "auth.logout_all_devices",
        targetType: "User",
        targetId: user.id,
        details: { sessions },
      });
    }
    return ok({ sessions });
  });
}
