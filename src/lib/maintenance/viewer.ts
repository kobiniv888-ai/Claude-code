import "server-only";
import { isAccountBlocked } from "@/lib/auth/account-status";
import { secureCookiesFor, sessionCookieName, staffCookieName } from "@/lib/auth/session-cookies";
import { isStaffSessionIdle, staffActiveKey, staffCookiePayload } from "@/lib/auth/staff-session-rules";
import { hmacHash, safeEqual } from "@/lib/crypto";
import { db } from "@/lib/db";
import { demoAllowed } from "@/lib/site-env";
import type { MaintenanceViewer } from "./mode";

/**
 * Who is asking, for maintenance mode only (./proxy-gate.ts): the proxy cannot use the page
 * helpers (next/headers), so the session cookie is looked up here directly. Read-only (no idle
 * marker moved, no cookie set). FAILS CLOSED: anything missing or failing is "not an admin".
 *
 * The session cookie's value is "<token>.<signature>"; the token is the session's 256-bit secret,
 * looked up in the Session table (expired sessions don't count). "twoFactorVerified" is the same
 * rule as getCurrentUser (src/lib/auth/session.ts): the 2-step code entered in this session, not
 * idle for 12 hours, and the SameSite=Strict staff cookie of this session present.
 */

type CookieJar = { get(name: string): { value: string } | undefined };

function tokenFrom(raw: string | undefined): string | null {
  if (!raw) return null;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const token = value.split(".")[0] ?? "";
  return /^[A-Za-z0-9_-]{16,256}$/.test(token) ? token : null;
}

export async function maintenanceViewer(cookies: CookieJar, now: Date = new Date()): Promise<MaintenanceViewer> {
  try {
    const secure = secureCookiesFor(process.env);
    const token = tokenFrom(cookies.get(sessionCookieName(secure))?.value);
    if (!token) return null;
    const session = await db.session.findUnique({
      where: { token },
      select: {
        id: true,
        expiresAt: true,
        twoFactorVerifiedAt: true,
        user: { select: { role: true, status: true, suspendedUntil: true, isDemo: true, twoFactorEnabled: true } },
      },
    });
    if (!session || session.expiresAt.getTime() <= now.getTime()) return null;
    const { user } = session;
    if (isAccountBlocked(user, now) || (user.isDemo && !demoAllowed())) return null;
    let twoFactorVerified = false;
    if (user.twoFactorEnabled && session.twoFactorVerifiedAt) {
      const marker = await db.verification.findFirst({
        where: { identifier: staffActiveKey(session.id) },
        orderBy: { expiresAt: "desc" },
        select: { expiresAt: true },
      });
      const staffCookie = cookies.get(staffCookieName(secure))?.value;
      twoFactorVerified =
        !isStaffSessionIdle(marker?.expiresAt, now) && !!staffCookie && safeEqual(staffCookie, hmacHash(staffCookiePayload(session.id)));
    }
    return { role: user.role, twoFactorVerified };
  } catch (error) {
    console.error("[maintenance] session check failed (counted as not an admin):", (error as Error)?.message ?? error);
    return null;
  }
}
