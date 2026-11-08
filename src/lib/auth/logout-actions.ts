"use server";

import { cookies } from "next/headers";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { assertRateLimit } from "@/lib/rate-limit";
import { endAllSessions, endSession } from "./account-sessions";
import { getSession, requireUserForAction } from "./session";
import { auth } from "./server";
import { clearStaffCookie } from "./staff-session";

/**
 * Logging out on the server (SECURITY_REPORT 3.5.d). The browser side is ./logout.ts.
 *
 * - logOutHere(): ends THIS session. It answers ok only when the session row is really gone (the
 *   login library answers "success" even when its delete fails), and clears the cookies. Works in
 *   a session still waiting for its 2-step code too (the /two-factor page's "log out").
 * - logOutEverywhere() — "התנתקות מכל המכשירים" (round 3, bug 2.9): ends every session of the
 *   account, this one included. Needs a fully signed-in session (2-step code entered); staff use is
 *   written to the audit log.
 */

/** Expires the login library's cookies the way it set them ("__Host-" cookies need Secure + Path=/). */
async function clearSessionCookies(): Promise<void> {
  const ctx = await auth.$context;
  const jar = await cookies();
  for (const cookie of [ctx.authCookies.sessionToken, ctx.authCookies.sessionData, ctx.authCookies.dontRememberToken]) {
    jar.set(cookie.name, "", {
      httpOnly: true,
      secure: !!cookie.attributes.secure,
      path: cookie.attributes.path ?? "/",
      sameSite: String(cookie.attributes.sameSite ?? "lax").toLowerCase() as "lax" | "strict" | "none",
      maxAge: 0,
    });
  }
  await clearStaffCookie();
}

export async function logOutHere(): Promise<ActionResult> {
  return runAction(async () => {
    const session = await getSession();
    // No session: nothing to end on the server (the browser still clears its own data).
    if (!session) {
      await clearSessionCookies();
      return ok();
    }
    const deleted = await endSession(session.user.id, session.session.id);
    if (deleted !== 1) return fail("logout_failed");
    await clearSessionCookies();
    return ok();
  });
}

export async function logOutEverywhere(): Promise<ActionResult<{ sessions: number }>> {
  return runAction<{ sessions: number }>(async () => {
    const user = await requireUserForAction();
    await assertRateLimit(`auth:logout-all:${user.id}`, { limit: 5, windowSeconds: 3600 });
    const sessions = await endAllSessions(user.id);
    if (sessions < 1) return fail("logout_all_failed");
    await clearSessionCookies();
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
