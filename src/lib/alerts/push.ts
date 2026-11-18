import "server-only";
import webpush, { WebPushError } from "web-push";
import { siteConfig } from "@/config/site";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/site-url";
import { deviceLabel, MAX_PUSH_DEVICES, type PushPayload, type PushSubscriptionInput } from "./push-subscription";

/**
 * Browser / app notifications for booking alerts (round 3), sent with web-push and the site's
 * VAPID keys (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY in .env: scripts/ensure-vapid.mjs makes them in
 * a codespace; the real site needs the same pair, see OWNER_TODO). public/sw.js shows them and
 * opens the booking on click. They NEVER count as a confirmed alert: an extra.
 *
 * One PushSubscription row per device. A 404/410 from the push service means the device turned
 * notifications off (or the subscription expired): that row is deleted.
 */

const SEND_TIMEOUT_MS = 8_000;
/** A booking alert is useless after a day. */
const TTL_SECONDS = 24 * 3600;

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

function vapidSubject(): string {
  const configured = process.env.VAPID_SUBJECT?.trim();
  if (configured && /^(mailto:|https:\/\/)/.test(configured)) return configured;
  const site = siteUrl();
  if (site.startsWith("https://") && !/\/\/(localhost|127\.0\.0\.1)/.test(site)) return site;
  return `mailto:${siteConfig.supportEmail}`;
}

export function vapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: vapidSubject() };
}

export function isPushConfigured(): boolean {
  return vapidConfig() !== null;
}

/** The public key the browser subscribes with (safe to show). */
export function vapidPublicKey(): string | null {
  return vapidConfig()?.publicKey ?? null;
}

export type PushSendResult = { ok: true } | { ok: false; gone: boolean; status: number | null; error: string };

type Subscription = { endpoint: string; p256dh: string; auth: string };

/** One notification to one device. Never throws. */
export async function sendPush(subscription: Subscription, payload: PushPayload): Promise<PushSendResult> {
  const config = vapidConfig();
  if (!config) return { ok: false, gone: false, status: null, error: "not_configured" };
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
      {
        vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
        TTL: TTL_SECONDS,
        urgency: "high",
        topic: payload.tag ? payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined : undefined,
        timeout: SEND_TIMEOUT_MS,
      },
    );
    return { ok: true };
  } catch (error) {
    if (error instanceof WebPushError) {
      const gone = error.statusCode === 404 || error.statusCode === 410;
      return { ok: false, gone, status: error.statusCode, error: `push service ${error.statusCode}` };
    }
    return { ok: false, gone: false, status: null, error: ((error as Error)?.message ?? String(error)).slice(0, 200) };
  }
}

export type PushToUserResult = { attempted: number; accepted: number; removed: number };

/** Sends to every device of a user; deletes gone subscriptions and records the outcome per device. */
export async function pushToUser(userId: string, payload: PushPayload): Promise<PushToUserResult> {
  if (!isPushConfigured()) return { attempted: 0, accepted: 0, removed: 0 };
  const subscriptions = await db.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
    orderBy: { createdAt: "desc" },
    take: MAX_PUSH_DEVICES,
  });
  let accepted = 0;
  let removed = 0;
  await Promise.all(
    subscriptions.map(async (subscription) => {
      const result = await sendPush(subscription, payload);
      if (result.ok) {
        accepted++;
        await db.pushSubscription.update({ where: { id: subscription.id }, data: { lastOkAt: new Date(), failedAt: null } }).catch(() => undefined);
      } else if (result.gone) {
        removed++;
        await db.pushSubscription.deleteMany({ where: { id: subscription.id } }).catch(() => undefined);
      } else {
        await db.pushSubscription.update({ where: { id: subscription.id }, data: { failedAt: new Date() } }).catch(() => undefined);
      }
    }),
  );
  return { attempted: subscriptions.length, accepted, removed };
}

/**
 * Saves this device's subscription for the signed-in user. The endpoint is unique: a device that
 * was subscribed by another account now belongs to this one (the person signed in there).
 * Keeps at most MAX_PUSH_DEVICES per account (the oldest goes).
 */
export async function savePushSubscription(userId: string, input: PushSubscriptionInput, userAgent: string | null): Promise<{ id: string }> {
  const label = deviceLabel(userAgent);
  const row = await db.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: { userId, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent: label },
    update: { userId, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent: label, failedAt: null },
    select: { id: true },
  });
  const extra = await db.pushSubscription.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: MAX_PUSH_DEVICES,
    select: { id: true },
  });
  if (extra.length > 0) await db.pushSubscription.deleteMany({ where: { id: { in: extra.map((e) => e.id) } } });
  return row;
}

/** Removes a device (only the user's own). */
export async function removePushSubscription(userId: string, where: { endpoint?: string; id?: string }): Promise<number> {
  if (!where.endpoint && !where.id) return 0;
  const result = await db.pushSubscription.deleteMany({ where: { userId, ...(where.endpoint ? { endpoint: where.endpoint } : { id: where.id }) } });
  return result.count;
}
