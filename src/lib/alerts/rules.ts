/**
 * How Bayit alerts a host about NEW BOOKINGS and CANCELLATIONS, and when instant booking may go
 * through (round 3, founder's answer 4). Pure and client-safe, so every rule is unit-tested.
 *
 * Each host chooses their ALERT CHANNELS (more than one can be on):
 *   - email     a CONFIRMING channel: Resend returned an id. In development and test mode
 *               (localhost, a Codespaces preview: the codeDisplay rule) the dev outbox counts, so
 *               the codespace and the e2e tests can book. Demo hosts always use the outbox.
 *   - telegram  a CONFIRMING channel: the Bayit bot's sendMessage returned ok. Needs the bot
 *               (TELEGRAM_BOT_TOKEN) and the host's chat (User.telegramChatId, connected once).
 *   - push      browser / app notifications (PushSubscription rows). They can't confirm that the
 *               host saw the alert, so they NEVER count on their own: an extra.
 * SMS and WhatsApp are planned as paid options (LATER_CHANNELS); no Viber.
 *
 * Instant booking needs at least one confirming channel that works; otherwise the listing shows
 * "שאלה למארח" and the host's booking step and settings say why (AlertBlockReason).
 *
 * The choices and each channel's failure live in User.notificationPrefs.alerts:
 *   { channels: { email: true, telegram: true, push: true },
 *     email:    { failing: { address, reason, since } },
 *     telegram: { failing: { chatId, reason, since } } }
 * Missing values mean "on" and "nothing failing" (the sensible default: email on, and Telegram /
 * notifications on as soon as they are connected).
 *
 * A failure pauses ONLY that channel: a bounced email pauses the email channel for that address
 * (a new address, or a later "delivered" event, makes it work again); a Telegram 403 (the host
 * blocked the bot) pauses Telegram for that chat (a later successful send or a re-connect clears
 * it). Bookings continue while another confirming channel works.
 */

export const ALERT_CHANNELS = ["email", "telegram", "push"] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

/** Channels whose provider confirms that it accepted the message. */
export const CONFIRMING_CHANNELS: readonly AlertChannel[] = ["email", "telegram"];
export type ConfirmingChannel = "email" | "telegram";

/** Shown as "coming later" (paid options) in the settings; never sent. */
export const LATER_CHANNELS = ["sms", "whatsapp"] as const;

export function isAlertChannel(value: unknown): value is AlertChannel {
  return typeof value === "string" && (ALERT_CHANNELS as readonly string[]).includes(value);
}

export function isConfirmingChannel(channel: AlertChannel): channel is ConfirmingChannel {
  return CONFIRMING_CHANNELS.includes(channel);
}

/** Why a host can't take instant bookings (messages: alerts.reason.*). */
export const ALERT_BLOCK_REASONS = ["email_not_configured", "no_email", "email_failing", "telegram_failing", "no_channel"] as const;
export type AlertBlockReason = (typeof ALERT_BLOCK_REASONS)[number];

/**
 * What the code knows about where it runs:
 * - resend: RESEND_API_KEY is set (emails really go out);
 * - outboxCounts: a development / test-mode host (codeDisplay rule): the dev outbox stands in for
 *   email delivery;
 * - telegram: the Bayit bot is set up (TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME);
 * - push: VAPID keys are set (browser notifications can be sent).
 */
export type AlertEnvironment = { resend: boolean; outboxCounts: boolean; telegram: boolean; push: boolean };

/** How the email channel delivers for one host. */
export type EmailTransport = "resend" | "outbox";

/**
 * One channel of one host:
 * - ready: alerts go out on it;
 * - off: the host switched it off;
 * - not_configured: the site lacks the service (no Resend on the real site, no bot, no VAPID keys);
 * - not_linked: Telegram not connected, or no device with notifications on;
 * - no_email: the account has no real email address (phone-only);
 * - failing: paused after a bounce, a spam complaint or a blocked bot.
 */
export type ChannelState = "ready" | "off" | "not_configured" | "not_linked" | "no_email" | "failing";

export type ChannelStatus = {
  channel: AlertChannel;
  state: ChannelState;
  ready: boolean;
  /** A confirming channel (email, Telegram). */
  confirms: boolean;
  /** Email only: Resend or the dev outbox. */
  transport?: EmailTransport;
  /** When state is "failing". */
  failing?: ChannelFailure | null;
};

export type FailureReason = "bounced" | "complained" | "blocked" | "failed";

export type ChannelFailure = {
  reason: FailureReason;
  /** ISO time of the event. */
  since: string;
  /** Email: the address that bounced (lower-case). Only this address is paused. */
  address?: string;
  /** Telegram: the chat that blocked the bot. Only this chat is paused. */
  chatId?: string;
};

export type AlertPrefs = {
  /** The host's choices (missing → on). */
  channels: Record<AlertChannel, boolean>;
  email: { failing: (ChannelFailure & { address: string }) | null };
  telegram: { failing: (ChannelFailure & { chatId: string }) | null };
};

export type HostAlertTarget = {
  /** notificationEmailFor(host): a real address, never the phone-only placeholder. */
  email: string | null;
  isDemo: boolean;
  /** User.notificationPrefs (any shape). */
  prefs: unknown;
  /** User.telegramChatId. */
  telegramChatId?: string | null;
  /** How many devices have notifications on (PushSubscription rows). */
  pushDevices?: number;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const EMAIL_FAILURES = new Set<FailureReason>(["bounced", "complained", "failed"]);
const TELEGRAM_FAILURES = new Set<FailureReason>(["blocked", "failed"]);

function readFailure(value: unknown, allowed: Set<FailureReason>): { reason: FailureReason; since: string; raw: Record<string, unknown> } | null {
  const failing = record(value);
  const reason = failing.reason as FailureReason;
  if (!allowed.has(reason)) return null;
  return { reason, since: typeof failing.since === "string" ? failing.since : "", raw: failing };
}

/** Reads notificationPrefs.alerts (any shape): missing or broken values mean "on" and "nothing failing". */
export function parseAlertPrefs(prefs: unknown): AlertPrefs {
  const alerts = record(record(prefs).alerts);
  const chosen = record(alerts.channels);
  const channels = Object.fromEntries(ALERT_CHANNELS.map((c) => [c, chosen[c] !== false])) as Record<AlertChannel, boolean>;

  const email = readFailure(record(alerts.email).failing, EMAIL_FAILURES);
  const address = typeof email?.raw.address === "string" ? email.raw.address.trim().toLowerCase() : "";
  const telegram = readFailure(record(alerts.telegram).failing, TELEGRAM_FAILURES);
  const chatId = typeof telegram?.raw.chatId === "string" ? telegram.raw.chatId.trim() : "";
  return {
    channels,
    email: { failing: email && address ? { reason: email.reason, since: email.since, address } : null },
    telegram: { failing: telegram && chatId ? { reason: telegram.reason, since: telegram.since, chatId } : null },
  };
}

function withAlerts(prefs: unknown, change: (alerts: Record<string, unknown>) => void): Record<string, unknown> {
  const root = { ...record(prefs) };
  const alerts = { ...record(root.alerts) };
  change(alerts);
  root.alerts = alerts;
  return root;
}

/** notificationPrefs with one channel switched on or off. Every other key is kept as it was. */
export function withChannelEnabled(prefs: unknown, channel: AlertChannel, on: boolean): Record<string, unknown> {
  return withAlerts(prefs, (alerts) => {
    alerts.channels = { ...record(alerts.channels), [channel]: on };
  });
}

/**
 * notificationPrefs with a confirming channel marked as failing (or cleared with null). Email
 * failures name the address, Telegram failures the chat. Every other key is kept as it was.
 */
export function withChannelFailing(prefs: unknown, channel: ConfirmingChannel, failing: ChannelFailure | null): Record<string, unknown> {
  return withAlerts(prefs, (alerts) => {
    const part = { ...record(alerts[channel]) };
    if (failing) {
      const clean: ChannelFailure = { reason: failing.reason, since: failing.since };
      if (channel === "email") clean.address = (failing.address ?? "").trim().toLowerCase();
      else clean.chatId = (failing.chatId ?? "").trim();
      part.failing = clean;
    } else {
      delete part.failing;
    }
    alerts[channel] = part;
  });
}

/** The email channel's failing mark (kept for callers of the earlier email-only rules). */
export function withEmailFailing(prefs: unknown, failing: (ChannelFailure & { address: string }) | null): Record<string, unknown> {
  return withChannelFailing(prefs, "email", failing);
}

/** notificationPrefs.alerts, to carry over when another part of the site rewrites the prefs. */
export function alertsPart(prefs: unknown): Record<string, unknown> | undefined {
  const alerts = record(prefs).alerts;
  return alerts && typeof alerts === "object" && !Array.isArray(alerts) ? (alerts as Record<string, unknown>) : undefined;
}

/** Is this channel's failing mark about the host's CURRENT address / chat? */
export function currentFailure(prefs: AlertPrefs, channel: ConfirmingChannel, target: Pick<HostAlertTarget, "email" | "telegramChatId">): ChannelFailure | null {
  if (channel === "email") {
    const failing = prefs.email.failing;
    const address = target.email?.trim().toLowerCase() || null;
    return failing && address && failing.address === address ? failing : null;
  }
  const failing = prefs.telegram.failing;
  const chatId = target.telegramChatId?.trim() || null;
  return failing && chatId && failing.chatId === chatId ? failing : null;
}

function status(channel: AlertChannel, state: ChannelState, extra: Partial<ChannelStatus> = {}): ChannelStatus {
  return { channel, state, ready: state === "ready", confirms: isConfirmingChannel(channel), ...extra };
}

/** The email channel for one host. */
export function emailChannelStatus(target: HostAlertTarget, env: AlertEnvironment, prefs = parseAlertPrefs(target.prefs)): ChannelStatus {
  if (!prefs.channels.email) return status("email", "off");
  // Demo hosts are made up: their alerts stay in the dev outbox (never sent), which is enough.
  if (target.isDemo) return status("email", "ready", { transport: "outbox" });
  if (!target.email?.trim()) return status("email", "no_email");
  const failing = currentFailure(prefs, "email", target);
  if (failing) return status("email", "failing", { failing });
  if (env.resend) return status("email", "ready", { transport: "resend" });
  if (env.outboxCounts) return status("email", "ready", { transport: "outbox" });
  return status("email", "not_configured");
}

/** The Telegram channel for one host. */
export function telegramChannelStatus(target: HostAlertTarget, env: AlertEnvironment, prefs = parseAlertPrefs(target.prefs)): ChannelStatus {
  if (!env.telegram) return status("telegram", "not_configured");
  if (!target.telegramChatId?.trim()) return status("telegram", "not_linked");
  if (!prefs.channels.telegram) return status("telegram", "off");
  const failing = currentFailure(prefs, "telegram", target);
  if (failing) return status("telegram", "failing", { failing });
  return status("telegram", "ready");
}

/** Browser / app notifications for one host (never confirming). */
export function pushChannelStatus(target: HostAlertTarget, env: AlertEnvironment, prefs = parseAlertPrefs(target.prefs)): ChannelStatus {
  if (!env.push) return status("push", "not_configured");
  if (!target.pushDevices || target.pushDevices < 1) return status("push", "not_linked");
  if (!prefs.channels.push) return status("push", "off");
  return status("push", "ready");
}

/** Every alert channel of a host, in the order they are shown and tried. */
export function hostAlertChannels(target: HostAlertTarget, env: AlertEnvironment): ChannelStatus[] {
  const prefs = parseAlertPrefs(target.prefs);
  return [emailChannelStatus(target, env, prefs), telegramChannelStatus(target, env, prefs), pushChannelStatus(target, env, prefs)];
}

export type InstantGate = { ok: true; channels: ConfirmingChannel[] } | { ok: false; reason: AlertBlockReason };

/** The most useful reason to show a host whose confirming channels are all unavailable. */
export function blockReason(channels: readonly ChannelStatus[]): AlertBlockReason {
  const state = (channel: AlertChannel) => channels.find((c) => c.channel === channel)?.state;
  // A paused channel first: the host has to act (fix the mailbox, unblock the bot).
  if (state("email") === "failing") return "email_failing";
  if (state("telegram") === "failing") return "telegram_failing";
  if (state("email") === "no_email") return "no_email";
  if (state("email") === "not_configured") return "email_not_configured";
  return "no_channel";
}

/**
 * May this host take instant bookings? Yes when at least one confirming channel is ready (email
 * or Telegram); browser notifications alone never open it.
 */
export function instantBookingGate(channels: readonly ChannelStatus[]): InstantGate {
  const ready = channels.filter((c) => c.ready && c.confirms).map((c) => c.channel as ConfirmingChannel);
  if (ready.length > 0) return { ok: true, channels: ready };
  return { ok: false, reason: blockReason(channels) };
}

/** One attempt to alert the host on one channel. */
export type AlertAttempt = {
  channel: AlertChannel;
  accepted: boolean;
  providerId?: string | null;
  error?: string | null;
  /** Telegram 403: the host blocked the bot (the channel is paused). */
  blocked?: boolean;
};

/** The booking stands when a confirming channel accepted the alert. */
export function alertAccepted(attempts: readonly AlertAttempt[]): boolean {
  return attempts.some((a) => a.accepted && isConfirmingChannel(a.channel));
}

/** Booking.hostNotifiedVia: the confirming channels that accepted, in send order ("email,telegram"). */
export function notifiedVia(attempts: readonly AlertAttempt[]): string | null {
  const via = [...new Set(attempts.filter((a) => a.accepted && isConfirmingChannel(a.channel)).map((a) => a.channel))];
  return via.length > 0 ? via.join(",") : null;
}

/** Reads Booking.hostNotifiedVia back (unknown names are dropped). */
export function parseNotifiedVia(value: string | null | undefined): AlertChannel[] {
  return [...new Set((value ?? "").split(",").map((part) => part.trim()))].filter(isAlertChannel);
}

/**
 * A channel just failed: is a booking whose alert went out earlier affected (the host may never
 * have heard of it)? Yes when no OTHER confirming channel accepted that booking's alert. Bookings
 * without a record (made before round 3) count as affected: telling the guest is the safe side.
 */
export function bookingAffectedByFailure(hostNotifiedVia: string | null | undefined, failed: AlertChannel): boolean {
  const others = parseNotifiedVia(hostNotifiedVia).filter((channel) => channel !== failed && isConfirmingChannel(channel));
  return others.length === 0;
}

export type FailurePlan = {
  /** The host still takes instant bookings through another confirming channel. */
  stillInstant: boolean;
  /** Where to tell the host about the pause: every channel still working (push included). */
  tellVia: AlertChannel[];
};

/** What a newly failing channel means for a host (the pause/resume rules). */
export function afterChannelFailure(before: readonly ChannelStatus[], failed: ConfirmingChannel): FailurePlan {
  const after = before.map((c) => (c.channel === failed ? { ...c, state: "failing" as const, ready: false } : c));
  return { stillInstant: instantBookingGate(after).ok, tellVia: after.filter((c) => c.ready).map((c) => c.channel) };
}

/**
 * Should a later event clear a failing mark? Email: an email to the same address that was
 * created AFTER the failure was delivered. Telegram: a later message to the same chat was
 * accepted. An old event arriving late changes nothing.
 */
export function resumesFailure(
  failing: ChannelFailure | null,
  event: { channel: ConfirmingChannel; sentAt: Date; address?: string | null; chatId?: string | null },
): boolean {
  if (!failing) return false;
  if (event.channel === "email") {
    if (!failing.address || failing.address !== event.address?.trim().toLowerCase()) return false;
  } else if (!failing.chatId || failing.chatId !== event.chatId?.trim()) {
    return false;
  }
  const since = Date.parse(failing.since);
  return Number.isNaN(since) || event.sentAt.getTime() > since;
}

/** A delivery event from the email provider (the Resend webhook, src/lib/email/webhook.ts). */
export type EmailEvent = {
  kind: "bounced" | "complained" | "delivered";
  /** Resend's email id (EmailOutbox.providerId). */
  emailId: string | null;
  /** Lower-case addresses. */
  to: string[];
  tags: Record<string, string>;
  /** Resend's bounce details, for the outbox and the audit log. */
  detail?: string | null;
  at?: Date;
};

/** "BT-7K3Q9" inside a text (an email's body), for bounces that come back without tags. */
export function bookingCodeIn(text: string | null | undefined): string | null {
  return text?.match(/\bBT-[2-9A-HJ-NP-Z]{5}\b/)?.[0] ?? null;
}
