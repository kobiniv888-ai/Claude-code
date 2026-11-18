import "server-only";
import type { AppLocale } from "@/config/site";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { getDeviceHash, getIpHash, getUserAgent } from "@/lib/request";
import { recordSecurityEvent } from "@/lib/security/events";
import { checkSignupDevice } from "@/lib/security/signup-guard";
import { describeDevice } from "./device-label";
import { markFreshProof } from "./fresh-proof";
import { isStaffRole } from "./permissions";
import { isPlaceholderEmail } from "./phone";
import { notifyNewDevice } from "./security-notices";

/**
 * Side effects of sign-up and sign-in (called from the Better Auth database hooks).
 * They never block a login: failures are logged and swallowed.
 */

/**
 * What linking this browser's device id did. DeviceLink ("remembered devices", kept 1 year) only
 * means "this device signed in to this account before": it suppresses a REPEAT new-device alert
 * and feeds the risk checks ("several accounts on one device"). It never skips or shortens any
 * login step: no 2-step code is ever skipped because a device is known, for staff or anyone
 * (founder's answer d, 8 November 2026; tests/unit/no-trusted-device.test.ts).
 */
export type DeviceLinkResult =
  /** `isNew`: this device had never signed in to this account; `hadOthers`: the account had other devices. */
  | { status: "linked"; isNew: boolean; hadOthers: boolean }
  /** The request carried no device id (a script, or the bayit_did cookie blocked or stripped). */
  | { status: "no_device_id" }
  /** Outside a request (scripts, seed) or a database error: nothing linked. */
  | { status: "error" };

/** Links this browser's device id to the account ("several accounts on one device" check, new-device alerts). */
export async function linkDevice(userId: string): Promise<DeviceLinkResult> {
  try {
    const [deviceHash, ipHash] = await Promise.all([getDeviceHash(), getIpHash()]);
    if (!deviceHash) return { status: "no_device_id" };
    const now = new Date();
    const existing = await db.deviceLink.findUnique({ where: { deviceHash_userId: { deviceHash, userId } }, select: { id: true } });
    if (existing) {
      await db.deviceLink.update({ where: { id: existing.id }, data: { lastSeenAt: now, ...(ipHash && { ipHash }) } });
      return { status: "linked", isNew: false, hadOthers: true };
    }
    const others = await db.deviceLink.count({ where: { userId } });
    await db.deviceLink.upsert({
      where: { deviceHash_userId: { deviceHash, userId } },
      create: { deviceHash, userId, ipHash, firstSeenAt: now, lastSeenAt: now },
      update: { lastSeenAt: now, ...(ipHash && { ipHash }) },
    });
    return { status: "linked", isNew: true, hadOthers: others > 0 };
  } catch (error) {
    // headers()/cookies() are unavailable outside a request (scripts, seed) — nothing to link.
    console.error("[auth] could not link device", error);
    return { status: "error" };
  }
}

/**
 * After a sign-up (Better Auth `user.create.after`): the device link, then the fake sign-up check
 * of SECURITY_REPORT 3.8.b (more than 3 accounts made on one device in 30 days → a flag for the
 * admin and a security event; never a block: src/lib/security/signup-guard.ts).
 */
export async function afterSignUpDevice(userId: string): Promise<DeviceLinkResult> {
  const link = await linkDevice(userId);
  if (link.status === "linked") await checkSignupDevice(userId);
  return link;
}

/** Login endpoints that prove the person holds a code right now (a fresh proof, ./fresh-proof-rules.ts). */
const CODE_LOGIN_PATHS = new Set(["/sign-in/email-otp", "/phone-number/verify"]);

/** A sign-up's own first session (the account was created moments ago) is not a "new device". */
const NEW_ACCOUNT_GRACE_MS = 2 * 60 * 1000;

/** How a session was started, for the security event log (Better Auth endpoint → method). */
export function loginMethodOf(path: string): "email_code" | "phone_code" | "social" | "other" {
  if (path === "/sign-in/email-otp") return "email_code";
  if (path === "/phone-number/verify") return "phone_code";
  if (path.startsWith("/callback") || path.startsWith("/sign-in/social") || path.startsWith("/oauth2")) return "social";
  return "other";
}

/**
 * Is this sign-in from a device the account has not used? A linked device answers directly (not
 * the account's very first device). A sign-in WITHOUT a device id never counts as known
 * (SECURITY_REPORT 3.6.e: stripping the cookie must not hide a login): it is a new device unless it
 * is a sign-up's own first session (no devices, no other session, an account under 2 minutes old).
 */
async function isUnknownDevice(
  link: DeviceLinkResult,
  session: { id: string; userId: string },
  createdAt: Date,
): Promise<{ noDeviceId?: true } | null> {
  if (link.status === "linked") return link.isNew && link.hadOthers ? {} : null;
  if (link.status !== "no_device_id") return null;
  const [devices, otherSessions] = await Promise.all([
    db.deviceLink.count({ where: { userId: session.userId } }),
    db.session.count({ where: { userId: session.userId, NOT: { id: session.id } } }),
  ]);
  const established = devices > 0 || otherSessions > 0 || Date.now() - createdAt.getTime() > NEW_ACCOUNT_GRACE_MS;
  return established ? { noDeviceId: true } : null;
}

/**
 * After every new session (Better Auth `session.create.after`): the device link, the last-seen
 * time, a fresh proof for code logins, the login in the security event log (16.2), and the
 * new-device alert (SECURITY_REPORT 3.6.e): hosts (accounts with listings) and staff are emailed
 * when an account signs in on a device it never used before (not on its very first device, and
 * also when the request carries no device id); staff also alert the founder. Every new device is a
 * security event. `path`: the login library's endpoint (none for our own session rotation, which
 * follows a login that was already recorded: nothing is recorded or sent for it).
 */
export async function afterSignIn(session: { id: string; userId: string }, path: string | undefined): Promise<void> {
  try {
    const [link] = await Promise.all([
      linkDevice(session.userId),
      db.user.update({ where: { id: session.userId }, data: { lastSeenAt: new Date() } }),
      path && CODE_LOGIN_PATHS.has(path) ? markFreshProof(session.id, "login_code") : Promise.resolve(),
    ]);
    if (!path) return;
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { role: true, createdAt: true, _count: { select: { listings: { where: { deletedAt: null } } } } },
    });
    if (!user) return;
    const staff = isStaffRole(user.role);
    const host = user._count.listings > 0;
    await recordSecurityEvent({ type: "login_success", userId: session.userId, meta: { method: loginMethodOf(path), staff } });
    const unknown = await isUnknownDevice(link, session, user.createdAt);
    if (!unknown) return;
    await recordSecurityEvent({ type: "new_device_login", userId: session.userId, meta: { staff, host, ...unknown } });
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
