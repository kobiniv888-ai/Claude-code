import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { alertEnvironment, hostAlertTarget, isBookingHost, loadAlertHost } from "./host";
import { vapidPublicKey } from "./push";
import { hostAlertChannels, instantBookingGate, parseAlertPrefs, type AlertChannel, type ChannelStatus, type InstantGate } from "./rules";

/**
 * What the "Booking alerts" section of the account settings shows (round 3): every channel with
 * its state, the gate, the paused address, the Telegram connection and this account's devices.
 */

export type AlertDevice = {
  id: string;
  /** sha256(endpoint), first 16 hex characters: the page finds "this device" without the endpoint. */
  key: string;
  label: string | null;
  createdAt: string;
  lastOkAt: string | null;
  failing: boolean;
};

/** The same short hash the browser computes for its own subscription (booking-alerts.tsx). */
export function endpointKey(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 16);
}

export type BookingAlertSettings = {
  /** Offers short stays or hotels (or connected a channel already): the section is shown. */
  show: boolean;
  gate: InstantGate;
  channels: (Pick<ChannelStatus, "channel" | "state" | "confirms" | "transport"> & { on: boolean })[];
  /** Where email alerts go (notificationEmailFor), shown with <Ltr>. */
  emailAddress: string | null;
  /** The address that bounced, when the email channel is paused. */
  failingAddress: string | null;
  telegram: { configured: boolean; linked: boolean; linkedAt: string | null };
  push: { configured: boolean; publicKey: string | null; devices: AlertDevice[] };
  /** Development / test mode: emails stay in the outbox (shown as a hint). */
  outbox: boolean;
};

export async function getBookingAlertSettings(userId: string, requestHeaders: Pick<Headers, "get"> | null): Promise<BookingAlertSettings | null> {
  const host = await loadAlertHost(userId);
  if (!host) return null;
  const env = alertEnvironment(requestHeaders);
  const target = hostAlertTarget(host);
  const prefs = parseAlertPrefs(host.notificationPrefs);
  const statuses = hostAlertChannels(target, env);
  const devices = await db.pushSubscription.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, endpoint: true, userAgent: true, createdAt: true, lastOkAt: true, failedAt: true },
  });
  const show = (await isBookingHost(userId)) || !!host.telegramChatId || devices.length > 0;
  const email = statuses.find((s) => s.channel === "email");
  return {
    show,
    gate: instantBookingGate(statuses),
    channels: statuses.map((s) => ({ channel: s.channel, state: s.state, confirms: s.confirms, transport: s.transport, on: prefs.channels[s.channel as AlertChannel] })),
    emailAddress: target.email,
    failingAddress: email?.state === "failing" ? (email.failing?.address ?? null) : null,
    telegram: { configured: env.telegram, linked: !!host.telegramChatId, linkedAt: host.telegramLinkedAt?.toISOString() ?? null },
    push: {
      configured: env.push,
      publicKey: env.push ? vapidPublicKey() : null,
      devices: devices.map((d) => ({
        id: d.id,
        key: endpointKey(d.endpoint),
        label: d.userAgent,
        createdAt: d.createdAt.toISOString(),
        lastOkAt: d.lastOkAt?.toISOString() ?? null,
        failing: !!d.failedAt && (!d.lastOkAt || d.failedAt > d.lastOkAt),
      })),
    },
    outbox: email?.transport === "outbox",
  };
}
