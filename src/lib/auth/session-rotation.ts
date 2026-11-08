import "server-only";
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { auth } from "./server";
import { freshProofKey } from "./fresh-proof-rules";
import { forgetStaffSession } from "./staff-session";

/**
 * A new session id when a session gains rights (SECURITY_REPORT 3.5.b): after the 2-step code
 * (or a recovery code), and after 2-step login is turned on. The old row is deleted, so a session
 * token someone planted or saw before this step is worth nothing afterwards.
 *
 * Better Auth makes and stores the new session (its database hooks run as at any sign-in); the
 * signed cookie is set here exactly as Better Auth sets it (`<token>.<HMAC-SHA256 base64>`, same
 * name and attributes). Server actions and route handlers only (it sets a cookie).
 */

export type RotatedSession = { id: string; token: string };

/** The cookie value Better Auth expects: the token, a dot, its HMAC-SHA256 (base64) with the auth secret. */
export function signedSessionValue(token: string, secret: string): string {
  return `${token}.${createHmac("sha256", secret).update(token).digest("base64")}`;
}

export async function rotateSession(input: {
  userId: string;
  oldSessionId: string;
  /** Mark the new session as 2-step verified (the code was just entered). */
  twoFactorVerified: boolean;
}): Promise<RotatedSession> {
  const ctx = await auth.$context;
  const old = await db.session.findFirst({
    where: { id: input.oldSessionId, userId: input.userId },
    select: { id: true, token: true, ipAddress: true, userAgent: true },
  });
  if (!old) throw new Error("rotateSession: the current session is gone");

  const created = await ctx.internalAdapter.createSession(input.userId, false, {
    ipAddress: old.ipAddress ?? "",
    userAgent: old.userAgent ?? "",
  });
  if (!created) throw new Error("rotateSession: no new session");

  const now = new Date();
  await db.$transaction([
    db.session.update({ where: { id: created.id }, data: { twoFactorVerifiedAt: input.twoFactorVerified ? now : null } }),
    // A recent fresh code (the email-code login, a code for a sensitive change) follows the session.
    db.verification.updateMany({ where: { identifier: freshProofKey(old.id) }, data: { identifier: freshProofKey(created.id) } }),
    db.session.deleteMany({ where: { id: old.id } }),
  ]);
  await forgetStaffSession(old.id);

  const cookie = ctx.authCookies.sessionToken;
  const attributes = cookie.attributes;
  (await cookies()).set(cookie.name, signedSessionValue(created.token, ctx.secret), {
    httpOnly: attributes.httpOnly ?? true,
    secure: !!attributes.secure,
    path: attributes.path ?? "/",
    sameSite: String(attributes.sameSite ?? "lax").toLowerCase() as "lax" | "strict" | "none",
    maxAge: attributes.maxAge ?? 60 * 60 * 24 * 30,
    ...(attributes.domain && { domain: attributes.domain }),
  });
  return { id: created.id, token: created.token };
}
