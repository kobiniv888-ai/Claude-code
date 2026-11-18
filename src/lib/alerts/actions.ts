"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { requireUserForAction } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { assertRateLimit } from "@/lib/rate-limit";
import { alertEnvironment, alertHost, loadAlertHost, localeOfUser } from "./host";
import { telegramReply } from "./messages";
import { isPushConfigured, removePushSubscription, savePushSubscription } from "./push";
import { pushEndpointSchema, pushSubscriptionSchema } from "./push-subscription";
import { ALERT_CHANNELS, withChannelEnabled, withChannelFailing, type AlertChannel } from "./rules";
import { sendTelegramMessage, telegramConfig } from "./telegram";
import { telegramLinkToken, telegramStartUrl } from "./telegram-token";

/**
 * The "Booking alerts" settings (round 3). Every action: the signed-in user's own account only,
 * zod-validated input, rate-limited. The section is src/components/account/booking-alerts.tsx.
 */

const SETTINGS_LIMIT = { limit: 30, windowSeconds: 60 };

const channelSchema = z.object({ channel: z.enum(ALERT_CHANNELS), on: z.boolean() });

/** Turns one channel on or off (the host's choice in notificationPrefs.alerts.channels). */
export async function setAlertChannelAction(input: unknown): Promise<ActionResult<{ channel: AlertChannel; on: boolean }>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = channelSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    await assertRateLimit(`alerts:settings:${user.id}`, SETTINGS_LIMIT);
    const current = await db.user.findUnique({ where: { id: user.id }, select: { notificationPrefs: true } });
    const prefs = withChannelEnabled(current?.notificationPrefs, parsed.data.channel, parsed.data.on);
    await db.user.update({ where: { id: user.id }, data: { notificationPrefs: prefs as Prisma.InputJsonValue } });
    return ok(parsed.data);
  });
}

/** A fresh t.me link that connects this account's Telegram (valid 15 minutes, once). */
export async function connectTelegramAction(): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    await assertRateLimit(`alerts:telegram-link:${user.id}`, { limit: 10, windowSeconds: 3600 });
    const config = telegramConfig();
    const secret = process.env.BETTER_AUTH_SECRET ?? "";
    if (!config || !secret) return fail("telegram_not_configured");
    const token = telegramLinkToken(user.id, secret);
    if (!token) return fail("telegram_not_configured");
    return ok({ url: telegramStartUrl(config.username, token) });
  });
}

/** Polled by the settings page while the host is in Telegram: connected yet? */
export async function telegramLinkStatusAction(): Promise<ActionResult<{ linked: boolean; linkedAt: string | null }>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    await assertRateLimit(`alerts:telegram-status:${user.id}`, { limit: 120, windowSeconds: 600 });
    const row = await db.user.findUnique({ where: { id: user.id }, select: { telegramChatId: true, telegramLinkedAt: true } });
    return ok({ linked: !!row?.telegramChatId, linkedAt: row?.telegramLinkedAt?.toISOString() ?? null });
  });
}

/** Disconnects Telegram (a goodbye message goes to the chat, best effort). */
export async function disconnectTelegramAction(): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    await assertRateLimit(`alerts:settings:${user.id}`, SETTINGS_LIMIT);
    const row = await db.user.findUnique({ where: { id: user.id }, select: { telegramChatId: true, notificationPrefs: true, locale: true } });
    if (!row?.telegramChatId) return ok();
    await db.user.update({
      where: { id: user.id },
      data: {
        telegramChatId: null,
        telegramLinkedAt: null,
        notificationPrefs: withChannelFailing(row.notificationPrefs, "telegram", null) as Prisma.InputJsonValue,
      },
    });
    await audit({ actorId: user.id, action: "alerts.telegram_disconnected", targetType: "User", targetId: user.id });
    await sendTelegramMessage(row.telegramChatId, await telegramReply(localeOfUser(row), "disconnected"));
    return ok();
  });
}

/** Saves this device's browser notification subscription. */
export async function savePushSubscriptionAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = pushSubscriptionSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    if (!isPushConfigured()) return fail("push_not_configured");
    await assertRateLimit(`alerts:push:${user.id}`, { limit: 20, windowSeconds: 3600 });
    await savePushSubscription(user.id, parsed.data, (await headers()).get("user-agent"));
    return ok();
  });
}

const removeDeviceSchema = z.union([pushEndpointSchema, z.object({ id: z.string().min(1).max(40) })]);

/** Removes one of the user's devices (this one by endpoint, or any of theirs by id). */
export async function removePushDeviceAction(input: unknown): Promise<ActionResult<{ removed: number }>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = removeDeviceSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    await assertRateLimit(`alerts:push:${user.id}`, { limit: 20, windowSeconds: 3600 });
    const removed = await removePushSubscription(user.id, parsed.data);
    return ok({ removed });
  });
}

export type TestAlertResult = { channel: AlertChannel; accepted: boolean }[];

/**
 * "Send a test alert" on every channel that is on, paused ones included: a Telegram message that
 * gets through ends its pause, an email that arrives ends an email pause (Resend's webhook).
 */
export async function sendTestAlertAction(): Promise<ActionResult<{ results: TestAlertResult }>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    await assertRateLimit(`alerts:test:${user.id}`, { limit: 5, windowSeconds: 3600 });
    const host = await loadAlertHost(user.id);
    if (!host) return fail("not_found");
    const attempts = await alertHost(host, { kind: "test" }, alertEnvironment(await headers()), { retryFailing: true });
    return ok({ results: attempts.map((a) => ({ channel: a.channel, accepted: a.accepted })) });
  });
}
