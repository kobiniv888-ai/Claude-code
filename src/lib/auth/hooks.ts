import "server-only";
import type { AppLocale } from "@/config/site";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { getDeviceHash, getIpHash, getUserAgent } from "@/lib/request";
import { recordSecurityEvent } from "@/lib/security/events";
import { describeDevice } from "./device-label";
import { markFreshProof } from "./fresh-proof";
import { isStaffRole } from "./permissions";
import { isPlaceholderEmail } from "./phone";
import { notifyNewDevice } from "./security-notices";

/**
 * Side effects of sign-up and sign-in (called from the Better Auth database hooks).
 * They never block a login: failures are logged and swallowed.
 */

export type DeviceLinkResult = {
  /** This device had never signed in to this account before. */
  isNew: boolean;
  /** The account had signed in on another device before (so this is not its first device). */
  hadOthers: boolean;
};

/** Links this browser's device id to the account ("several accounts on one device" check, new-device alerts). */
export async function linkDevice(userId: string): Promise<DeviceLinkResult | null> {
  try {
    const [deviceHash, ipHash] = await Promise.all([getDeviceHash(), getIpHash()]);
    if (!deviceHash) return null;
    const now = new Date();
    const existing = await db.deviceLink.findUnique({ where: { deviceHash_userId: { deviceHash, userId } }, select: { id: true } });
    if (existing) {
      await db.deviceLink.update({ where: { id: existing.id }, data: { lastSeenAt: now, ...(ipHash && { ipHash }) } });
      return { isNew: false, hadOthers: true };
    }
    const others = await db.deviceLink.count({ where: { userId } });
    await db.deviceLink.upsert({
      where: { deviceHash_userId: { deviceHash, userId } },
      create: { deviceHash, userId, ipHash, firstSeenAt: now, lastSeenAt: now },
      update: { lastSeenAt: now, ...(ipHash && { ipHash }) },
    });
    return { isNew: true, hadOthers: others > 0 };
  } catch (error) {
    // headers()/cookies() are unavailable outside a request (scripts, seed) — nothing to link.
    console.error("[auth] could not link device", error);
    return null;
  }
}

/** Login endpoints that prove the person holds a code right now (a fresh proof, ./fresh-proof-rules.ts). */
const CODE_LOGIN_PATHS = new Set(["/sign-in/email-otp", "/phone-number/verify"]);

/**
 * After every new session (Better Auth `session.create.after`): the device link, the last-seen
 * time, a fresh proof for code logins, and the new-device alert (SECURITY_REPORT 3.6.e): hosts
 * (accounts with listings) and staff are emailed when an account signs in on a device it never
 * used before (not on its very first device); staff also alert the founder. Every new device is a
 * security event. `path`: the login library's endpoint (none for our own session rotation).
 */
export async function afterSignIn(session: { id: string; userId: string }, path: string | undefined): Promise<void> {
  try {
    const [link] = await Promise.all([
      linkDevice(session.userId),
      db.user.update({ where: { id: session.userId }, data: { lastSeenAt: new Date() } }),
      path && CODE_LOGIN_PATHS.has(path) ? markFreshProof(session.id, "login_code") : Promise.resolve(),
    ]);
    if (!link?.isNew || !link.hadOthers) return;
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { role: true, isDemo: true, _count: { select: { listings: { where: { deletedAt: null } } } } },
    });
    if (!user) return;
    const staff = isStaffRole(user.role);
    const host = user._count.listings > 0;
    await recordSecurityEvent({ type: "new_device_login", userId: session.userId, meta: { staff, host } });
    if (staff || host) await notifyNewDevice({ userId: session.userId, device: describeDevice(await getUserAgent().catch(() => null)) });
  } catch (error) {
    console.error("[auth] could not record sign-in", error);
  }
}

/** Welcome email for accounts with a real address (Google/Apple), in the account's language. */
export async function sendWelcomeEmail(user: {
  id: string;
  email: string;
  name: string;
  locale?: AppLocale | null;
}): Promise<void> {
  if (isPlaceholderEmail(user.email)) return;
  try {
    const locale = user.locale ?? "en";
    await sendEmail({ to: user.email, template: "welcome", locale, data: { name: user.name } });
  } catch (error) {
    console.error("[auth] could not send the welcome email", error);
  }
}
