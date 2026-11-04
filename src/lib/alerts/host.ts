import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { siteConfig, type AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { codeDisplayForHeaders, codeDisplayMode, type CodeDisplayEnv } from "@/lib/auth/code-display";
import { personName } from "@/lib/auth/first-name";
import { verifiedPhoneOf } from "@/lib/auth/phone-once";
import { audit } from "@/lib/audit";
import { emailHostCancelledByGuest, emailHostNewBooking, hostBookingSummary } from "@/lib/booking/notify";
import { BOOKABLE_DEAL_TYPES } from "@/lib/booking/constants";
import { db } from "@/lib/db";
import { isEmailDeliveryConfigured, notificationEmailFor, sendEmail, type SendEmailResult } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { isSmsConfigured, sendSms } from "@/lib/sms";
import { sendFounderAlert } from "./founder";
import { ALERT_SETTINGS_PATH, alertTexts, telegramReply, type HostAlertKind } from "./messages";
import { isPushConfigured, pushToUser } from "./push";
import {
  afterChannelFailure,
  currentFailure,
  emailDeliveryAccepted,
  hostAlertChannels,
  instantBookingGate,
  parseAlertPrefs,
  withChannelFailing,
  type AlertAttempt,
  type AlertChannel,
  type AlertEnvironment,
  type ChannelStatus,
  type ConfirmingChannel,
  type FailurePlan,
  type FailureReason,
  type HostAlertTarget,
  type InstantGate,
} from "./rules";
import { isTelegramConfigured, sendTelegramMessage } from "./telegram";

/**
 * Sending booking alerts to a host on the channels they chose (round 3; the rules are in
 * ./rules.ts, the booking side in src/lib/booking/alerts.ts).
 *
 *   const env = alertEnvironment(await headers());
 *   const attempts = await alertHost(host, { kind: "new_booking", bookingId }, env, { channels: ["email", "telegram"] });
 *
 * A Telegram 403 (bot blocked) pauses that channel right away (reportChannelFailure): the host is
 * told on every channel left, and the founder too. A later successful send clears it.
 */

/** Where the code runs. Without headers: development counts for email, production not. */
export function alertEnvironment(requestHeaders?: Pick<Headers, "get"> | null): AlertEnvironment {
  const mode = requestHeaders ? codeDisplayForHeaders(requestHeaders) : codeDisplayMode(process.env as CodeDisplayEnv, []);
  return { resend: isEmailDeliveryConfigured(), outboxCounts: mode !== null, telegram: isTelegramConfigured(), push: isPushConfigured() };
}

/** What the alert rules and senders read about a host. */
export const hostAlertSelect = {
  id: true,
  name: true,
  firstName: true,
  email: true,
  contactEmail: true,
  isDemo: true,
  locale: true,
  notificationPrefs: true,
  telegramChatId: true,
  telegramLinkedAt: true,
  phoneNumber: true,
  phoneNumberVerified: true,
  deletedAt: true,
  _count: { select: { pushSubscriptions: true } },
} as const satisfies Prisma.UserSelect;

export type AlertHost = Prisma.UserGetPayload<{ select: typeof hostAlertSelect }>;

export function hostAlertTarget(user: AlertHost): HostAlertTarget {
  return {
    email: notificationEmailFor(user),
    isDemo: user.isDemo,
    prefs: user.notificationPrefs,
    telegramChatId: user.telegramChatId,
    pushDevices: user._count.pushSubscriptions,
  };
}

export async function loadAlertHost(userId: string): Promise<AlertHost | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: hostAlertSelect }).catch(() => null);
  return user && !user.deletedAt ? user : null;
}

export function localeOfUser(user: { locale: string | null }): AppLocale {
  return isAppLocale(user.locale) ? user.locale : siteConfig.i18n.primaryLocale;
}

/** May this host take instant bookings here and now? */
export async function hostInstantGate(hostUserId: string, env: AlertEnvironment): Promise<InstantGate> {
  const host = await loadAlertHost(hostUserId);
  if (!host) return { ok: false, reason: "no_channel" };
  return instantBookingGate(hostAlertChannels(hostAlertTarget(host), env));
}

/** Does this account offer bookable places (short stays, hotels), in any state? */
export async function isBookingHost(userId: string): Promise<boolean> {
  const count = await db.listing.count({ where: { ownerId: userId, deletedAt: null, dealType: { in: [...BOOKABLE_DEAL_TYPES] } } }).catch(() => 0);
  return count > 0;
}

// ─── Sending ──────────────────────────────────────────────────

export type HostAlert = { kind: "new_booking"; bookingId: string } | { kind: "cancelled"; bookingId: string } | Exclude<HostAlertKind, { booking: unknown }>;

export type AlertHostOptions = {
  /** Only these channels (default: every ready channel). */
  channels?: readonly AlertChannel[];
  /** Also try paused channels (the "send a test" button: a success clears the pause). */
  retryFailing?: boolean;
  /** Don't start the failure flow on a Telegram 403 (used while telling a host about a pause). */
  quiet?: boolean;
};

function emailAccepted(sent: SendEmailResult, transport: ChannelStatus["transport"]): boolean {
  return emailDeliveryAccepted(sent.delivery, transport);
}

async function emailFor(host: AlertHost, alert: HostAlert, transport: ChannelStatus["transport"], env: AlertEnvironment): Promise<SendEmailResult> {
  const outboxOnly = transport === "outbox" && env.resend;
  const to = notificationEmailFor(host);
  const locale = localeOfUser(host);
  switch (alert.kind) {
    case "new_booking":
      return emailHostNewBooking(alert.bookingId, { outboxOnly });
    case "cancelled":
      return emailHostCancelledByGuest(alert.bookingId, { outboxOnly });
    case "test":
      if (!to) return { ok: false, delivery: "failed" };
      return sendEmail({
        to,
        locale,
        template: "host_alert_test",
        outboxOnly: outboxOnly || host.isDemo,
        data: { hostName: personName(host), settingsUrl: ALERT_SETTINGS_PATH },
      });
    case "paused":
      if (!to) return { ok: false, delivery: "failed" };
      return sendEmail({
        to,
        locale,
        template: "host_alerts_paused",
        outboxOnly: outboxOnly || host.isDemo,
        data: {
          hostName: personName(host),
          channel: alert.failed,
          stillInstant: alert.stillInstant,
          settingsUrl: ALERT_SETTINGS_PATH,
        },
      });
  }
}

async function textsFor(host: AlertHost, alert: HostAlert) {
  const locale = localeOfUser(host);
  if (alert.kind === "new_booking" || alert.kind === "cancelled") {
    const booking = await hostBookingSummary(alert.bookingId);
    return booking ? alertTexts(booking.locale, { kind: alert.kind, booking }) : null;
  }
  return alertTexts(locale, alert);
}

/**
 * Sends one alert on the host's channels and returns one attempt per channel tried. Never throws.
 * Email: Resend returned an id (the outbox in development / test mode and for demo hosts).
 * Telegram: sendMessage answered ok (a 403 pauses the channel). Push: at least one device's push
 * service accepted it (never confirming).
 */
export async function alertHost(host: AlertHost, alert: HostAlert, env: AlertEnvironment, opts: AlertHostOptions = {}): Promise<AlertAttempt[]> {
  const target = hostAlertTarget(host);
  const channels = hostAlertChannels(target, env).filter((c) => {
    if (opts.channels && !opts.channels.includes(c.channel)) return false;
    return c.ready || (opts.retryFailing && c.state === "failing");
  });
  if (channels.length === 0) return [];
  const texts = channels.some((c) => c.channel !== "email") ? await textsFor(host, alert).catch(() => null) : null;

  const attempts = await Promise.all(
    channels.map(async (status): Promise<AlertAttempt> => {
      try {
        if (status.channel === "email") {
          const sent = await emailFor(host, alert, status.transport, env);
          const accepted = emailAccepted(sent, status.transport);
          return { channel: "email", accepted, providerId: sent.providerId ?? null, error: accepted ? null : sent.delivery };
        }
        if (!texts) return { channel: status.channel, accepted: false, error: "no_text" };
        if (status.channel === "telegram") {
          const sent = await sendTelegramMessage(host.telegramChatId!, texts.text);
          return sent.ok
            ? { channel: "telegram", accepted: true, providerId: sent.messageId ? String(sent.messageId) : null }
            : { channel: "telegram", accepted: false, blocked: sent.blocked, error: sent.error };
        }
        const pushed = await pushToUser(host.id, texts.push);
        return { channel: "push", accepted: pushed.accepted > 0, error: pushed.accepted > 0 ? null : "not_accepted" };
      } catch (error) {
        console.error(`[alerts] ${status.channel} alert to ${host.id} failed:`, error);
        return { channel: status.channel, accepted: false, error: "error" };
      }
    }),
  );

  // A Telegram message got through: a pause for this chat is over.
  const telegram = attempts.find((a) => a.channel === "telegram");
  if (telegram?.accepted && currentFailure(parseAlertPrefs(host.notificationPrefs), "telegram", target)) {
    await clearChannelFailure(host.id, "telegram", "sent").catch(() => undefined);
  }
  // The host blocked the bot: pause Telegram (and say so on the channels left).
  if (telegram?.blocked && !opts.quiet) {
    await reportChannelFailure({ userId: host.id, channel: "telegram", reason: "blocked", chatId: host.telegramChatId, env }).catch((error) =>
      console.error("[alerts] could not pause Telegram:", error),
    );
  }
  return attempts;
}

// ─── Pause and resume ─────────────────────────────────────────

export type ChannelFailureInput = {
  userId: string;
  channel: ConfirmingChannel;
  reason: FailureReason;
  /** Email: the address that bounced (default: the account's notification address). */
  address?: string | null;
  /** Telegram: the chat that blocked the bot (default: the account's chat). */
  chatId?: string | null;
  env?: AlertEnvironment;
  /** Send the founder an alert about it (default true; a bounce sends its own). */
  tellFounder?: boolean;
  at?: Date;
};

/** At most this many founder alerts per host and channel a day (a flapping channel). */
const FOUNDER_ALERTS_PER_DAY = 3;

/**
 * A confirming channel failed (email bounce or spam complaint, a blocked bot): pause ONLY that
 * channel, tell the host on every channel left (push and text included) and the founder. Nothing
 * happens twice for the same address / chat. Returns whether it changed anything and what the
 * host is left with.
 */
export async function reportChannelFailure(input: ChannelFailureInput): Promise<{ changed: boolean; plan: FailurePlan | null }> {
  const host = await loadAlertHost(input.userId);
  if (!host) return { changed: false, plan: null };
  const env = input.env ?? alertEnvironment();
  const target = hostAlertTarget(host);
  const prefs = parseAlertPrefs(host.notificationPrefs);

  const address = (input.address ?? target.email ?? "").trim().toLowerCase();
  const chatId = (input.chatId ?? host.telegramChatId ?? "").trim();
  if (input.channel === "email" ? !address || address !== target.email?.toLowerCase() : !chatId || chatId !== host.telegramChatId) {
    // About an address / chat the account no longer uses: nothing to pause.
    return { changed: false, plan: null };
  }
  if (currentFailure(prefs, input.channel, target)) return { changed: false, plan: null };

  const before = hostAlertChannels(target, env);
  const since = (input.at ?? new Date()).toISOString();
  const failing = input.channel === "email" ? { reason: input.reason, since, address } : { reason: input.reason, since, chatId };
  const notificationPrefs = withChannelFailing(host.notificationPrefs, input.channel, failing);
  await db.user.update({ where: { id: host.id }, data: { notificationPrefs: notificationPrefs as Prisma.InputJsonValue } });
  await audit({ actorId: null, action: `alerts.${input.channel}_paused`, targetType: "User", targetId: host.id, details: { reason: input.reason } });

  const plan = afterChannelFailure(before, input.channel);
  const updated: AlertHost = { ...host, notificationPrefs: notificationPrefs as Prisma.JsonValue };
  if (await isBookingHost(host.id)) {
    const notice = { kind: "paused" as const, failed: input.channel, stillInstant: plan.stillInstant, address: input.channel === "email" ? address : null };
    await alertHost(updated, notice, env, { channels: plan.tellVia, quiet: true }).catch(() => undefined);
    await textHostPaused(updated, notice).catch(() => undefined);
  }
  if (input.tellFounder !== false) {
    const quota = await rateLimit(`alert:channel-paused:${host.id}:${input.channel}`, { limit: FOUNDER_ALERTS_PER_DAY, windowSeconds: 24 * 3600 }).catch(() => ({ ok: true }));
    if (quota.ok) {
      await sendFounderAlert({
        kind: "host_channel_paused",
        reason: input.reason,
        hostName: personName(host),
        channel: input.channel,
        stillInstant: plan.stillInstant,
        address: input.channel === "email" ? address : null,
        adminUrl: `/admin/users/${host.id}`,
      });
    }
  }
  return { changed: true, plan };
}

/** A text about the pause, when Twilio Messaging is set up (it is not one of the alert channels). */
async function textHostPaused(host: AlertHost, notice: Extract<HostAlert, { kind: "paused" }>): Promise<void> {
  const phone = verifiedPhoneOf(host);
  if (!phone || !isSmsConfigured()) return;
  const texts = await alertTexts(localeOfUser(host), notice);
  await sendSms({ to: phone, body: texts.text, logAs: `host_alerts_paused ${notice.failed}`, logOnly: host.isDemo });
}

/** Clears a pause (a later delivery, a successful send, a re-connect). Returns whether there was one. */
export async function clearChannelFailure(userId: string, channel: ConfirmingChannel, why: "delivered" | "sent" | "reconnected" | "address_changed"): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { notificationPrefs: true } });
  if (!user) return false;
  const prefs = parseAlertPrefs(user.notificationPrefs);
  if (!prefs[channel].failing) return false;
  await db.user.update({
    where: { id: userId },
    data: { notificationPrefs: withChannelFailing(user.notificationPrefs, channel, null) as Prisma.InputJsonValue },
  });
  await audit({ actorId: null, action: `alerts.${channel}_resumed`, targetType: "User", targetId: userId, details: { why } });
  return true;
}

/** "Telegram alerts are back on" after the host unblocked the bot; clears the pause when it gets through. */
export async function telegramUnblocked(chatId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { telegramChatId: chatId }, select: { id: true, locale: true, notificationPrefs: true } });
  if (!user) return false;
  const failing = parseAlertPrefs(user.notificationPrefs).telegram.failing;
  if (!failing || failing.chatId !== chatId) return false;
  const sent = await sendTelegramMessage(chatId, await telegramReply(localeOfUser(user), "resumed"));
  return sent.ok ? clearChannelFailure(user.id, "telegram", "sent") : false;
}
