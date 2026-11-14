import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { hmacHash, safeEqual } from "@/lib/crypto";
import { db } from "@/lib/db";
import { recordSecurityEvent } from "@/lib/security/events";
import { secureCookiesFor, staffCookieName } from "./session-cookies";
import {
  isStaffSessionIdle,
  nextStaffMarkerExpiry,
  shouldRefreshStaffMarker,
  staffActiveKey,
  staffCookieMaxAgeSeconds,
  staffCookiePayload,
} from "./staff-session-rules";

/**
 * Staff sessions: the 12-hour idle limit and the SameSite=Strict staff cookie (rules and reasons in
 * ./staff-session-rules.ts). Called by getCurrentUser (./session.ts) and by the 2-step actions.
 */

const secure = () => secureCookiesFor(process.env);

/** Starts (or restarts) the 12 idle hours of a staff session: right after its 2-step code. */
export async function markStaffSessionActive(sessionId: string, now = new Date()): Promise<void> {
  const identifier = staffActiveKey(sessionId);
  await db.$transaction([
    db.verification.deleteMany({ where: { identifier } }),
    db.verification.create({ data: { id: randomUUID(), identifier, value: "1", expiresAt: nextStaffMarkerExpiry(now) } }),
  ]);
}

/**
 * The idle check for a staff session whose 2-step code was entered: "active" (and the marker
 * moves on), or "idle" (the session's 2-step check is cleared, so the next page asks for the code).
 * Fails closed: a database error counts as idle.
 */
export async function checkStaffSessionIdle(input: { userId: string; sessionId: string }, now = new Date()): Promise<"active" | "idle"> {
  const identifier = staffActiveKey(input.sessionId);
  try {
    const marker = await db.verification.findFirst({ where: { identifier }, orderBy: { expiresAt: "desc" }, select: { id: true, expiresAt: true } });
    if (!isStaffSessionIdle(marker?.expiresAt, now)) {
      if (marker && shouldRefreshStaffMarker(marker.expiresAt, now)) {
        await db.verification.update({ where: { id: marker.id }, data: { expiresAt: nextStaffMarkerExpiry(now) } }).catch(() => undefined);
      }
      return "active";
    }
    await db.$transaction([
      db.session.updateMany({ where: { id: input.sessionId, userId: input.userId }, data: { twoFactorVerifiedAt: null } }),
      db.verification.deleteMany({ where: { identifier } }),
    ]);
    // Awaited (it never throws): an idle logout is rare, and the row must exist when the check returns.
    await recordSecurityEvent({ type: "staff_session_idle_logout", userId: input.userId, meta: { hadMarker: !!marker } });
    return "idle";
  } catch (error) {
    console.error("[auth] staff idle check failed — asking for the 2-step code again:", (error as Error)?.message);
    return "idle";
  }
}

/** Forgets a session's staff marker (logout, session rotation). */
export async function forgetStaffSession(sessionId: string): Promise<void> {
  await db.verification.deleteMany({ where: { identifier: staffActiveKey(sessionId) } }).catch(() => undefined);
}

const cookieValueFor = (sessionId: string) => hmacHash(staffCookiePayload(sessionId));

/**
 * Sets the SameSite=Strict staff cookie for this session (server actions and route handlers only).
 * It lives as long as the session (at most 30 days): the 12 IDLE hours are the server-side marker's
 * job (checkStaffSessionIdle, fail closed), so an admin who keeps working is not asked for the code
 * again just because 12 hours passed since it was entered. The value is an HMAC of the session id:
 * it is worth nothing once the session ends, and logout clears it.
 */
export async function issueStaffCookie(sessionId: string, now = new Date()): Promise<void> {
  const isSecure = secure();
  const session = await db.session.findUnique({ where: { id: sessionId }, select: { expiresAt: true } }).catch(() => null);
  (await cookies()).set(staffCookieName(isSecure), cookieValueFor(sessionId), {
    httpOnly: true,
    secure: isSecure,
    sameSite: "strict",
    path: "/",
    maxAge: staffCookieMaxAgeSeconds(session?.expiresAt ?? null, now),
  });
}

/** Does this request carry the staff cookie of this session? */
export async function hasStaffCookie(sessionId: string): Promise<boolean> {
  try {
    const value = (await cookies()).get(staffCookieName(secure()))?.value;
    return !!value && safeEqual(value, cookieValueFor(sessionId));
  } catch {
    return false;
  }
}

/**
 * Removes the staff cookie (logout). Not `cookies().delete()`: a "__Host-" cookie is only replaced
 * by a Set-Cookie that is Secure with Path=/ too.
 */
export async function clearStaffCookie(): Promise<void> {
  try {
    const isSecure = secure();
    (await cookies()).set(staffCookieName(isSecure), "", { httpOnly: true, secure: isSecure, sameSite: "strict", path: "/", maxAge: 0 });
  } catch {
    // Outside a server action / route handler: nothing to clear.
  }
}
