import "server-only";
import type { AppLocale } from "@/config/site";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { getDeviceHash, getIpHash } from "@/lib/request";
import { isPlaceholderEmail } from "./phone";

/**
 * Side effects of sign-up and sign-in (called from the Better Auth database hooks).
 * They never block a login: failures are logged and swallowed.
 */

/** Links this browser's device id to the account ("several accounts on one device" check). */
export async function linkDevice(userId: string): Promise<void> {
  try {
    const [deviceHash, ipHash] = await Promise.all([getDeviceHash(), getIpHash()]);
    if (!deviceHash) return;
    const now = new Date();
    await db.deviceLink.upsert({
      where: { deviceHash_userId: { deviceHash, userId } },
      create: { deviceHash, userId, ipHash, firstSeenAt: now, lastSeenAt: now },
      update: { lastSeenAt: now, ...(ipHash && { ipHash }) },
    });
  } catch (error) {
    // headers()/cookies() are unavailable outside a request (scripts, seed) — nothing to link.
    console.error("[auth] could not link device", error);
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
