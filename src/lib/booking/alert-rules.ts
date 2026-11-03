/**
 * How Bayit tells a host about a new booking, and when instant booking may go through
 * (round 3, founder's answer 4; pure and client-safe, so it is unit-tested).
 *
 * Each host has a list of ALERT CHANNELS. A booking only stands once at least one channel that
 * CONFIRMS delivery accepted the "new booking" alert:
 *   - email     (now): Resend returned an id. In development and test mode (localhost, a
 *                Codespaces preview: the codeDisplay rule) the dev outbox counts, so the
 *                codespace and the e2e tests can book. Demo hosts always use the outbox.
 *   - telegram  (later, needs the founder's OK for User.telegramChatId): the bot API accepted it.
 *   - push      (later, PushSubscription): browser notifications can't confirm the host saw the
 *                alert, so they never count on their own; they are an extra.
 * SMS and WhatsApp alerts are planned as paid options; Viber is not planned.
 *
 * When no confirming channel is ready, instant booking is off for that host: the listing shows
 * "שאלה למארח" and the host's booking step says why (reason below).
 *
 * A later bounce or spam complaint (Resend webhook) marks the email channel as failing for that
 * address in User.notificationPrefs.alerts.email. Only that address is paused: a new address, or a
 * later "delivered" event for it, makes the channel work again.
 */

export const ALERT_CHANNELS = ["email", "telegram", "push"] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

/** Channels whose provider confirms that it accepted the message. */
export const CONFIRMING_CHANNELS: readonly AlertChannel[] = ["email", "telegram"];

/** Why a host can't take instant bookings (messages: booking.hostAlerts.reason.*). */
export const ALERT_BLOCK_REASONS = ["email_not_configured", "no_email", "email_failing", "no_channel"] as const;
export type AlertBlockReason = (typeof ALERT_BLOCK_REASONS)[number];

/**
 * Where the code runs, for the email channel:
 * - resend: RESEND_API_KEY is set (emails really go out);
 * - outboxCounts: a development / test-mode host (codeDisplay rule), where the dev outbox stands
 *   in for delivery.
 */
export type AlertEnvironment = { resend: boolean; outboxCounts: boolean };

/** How the email channel delivers for one host. */
export type EmailTransport = "resend" | "outbox";

export type ChannelStatus =
  | { channel: AlertChannel; ready: true; confirms: boolean; transport?: EmailTransport }
  | { channel: AlertChannel; ready: false; reason: AlertBlockReason };

export type FailingEmail = {
  /** The address that bounced (lower-case). Only this address is paused. */
  address: string;
  /** "bounced" | "complained" (Resend event), or "failed" (Resend refused the send). */
  reason: "bounced" | "complained" | "failed";
  /** ISO time of the event. */
  since: string;
};

/** The parts of User.notificationPrefs this module reads and writes: { alerts: { email: { failing } } }. */
export type AlertPrefs = { email: { failing: FailingEmail | null } };

export type HostAlertTarget = {
  /** notificationEmailFor(host): a real address, never the phone-only placeholder. */
  email: string | null;
  isDemo: boolean;
  /** User.notificationPrefs (any shape). */
  prefs: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const FAILING_REASONS = new Set<FailingEmail["reason"]>(["bounced", "complained", "failed"]);

/** Reads notificationPrefs.alerts (any shape) — missing or broken values mean "nothing failing". */
export function parseAlertPrefs(prefs: unknown): AlertPrefs {
  const email = record(record(record(prefs).alerts).email);
  const failing = record(email.failing);
  const address = typeof failing.address === "string" ? failing.address.trim().toLowerCase() : "";
  const reason = failing.reason as FailingEmail["reason"];
  const since = typeof failing.since === "string" ? failing.since : "";
  return {
    email: { failing: address && FAILING_REASONS.has(reason) ? { address, reason, since } : null },
  };
}

/**
 * notificationPrefs with the email channel marked as failing for `failing.address` (or cleared
 * with null). Every other key is kept as it was (the account settings own them).
 */
export function withEmailFailing(prefs: unknown, failing: FailingEmail | null): Record<string, unknown> {
  const root = { ...record(prefs) };
  const alerts = { ...record(root.alerts) };
  const email = { ...record(alerts.email) };
  if (failing) email.failing = { ...failing, address: failing.address.trim().toLowerCase() };
  else delete email.failing;
  alerts.email = email;
  root.alerts = alerts;
  return root;
}

/** notificationPrefs.alerts, to carry over when another part of the site rewrites the prefs. */
export function alertsPart(prefs: unknown): Record<string, unknown> | undefined {
  const alerts = record(prefs).alerts;
  return alerts && typeof alerts === "object" && !Array.isArray(alerts) ? (alerts as Record<string, unknown>) : undefined;
}

/** The email channel for one host. */
export function emailChannelStatus(target: HostAlertTarget, env: AlertEnvironment): ChannelStatus {
  const address = target.email?.trim().toLowerCase() || null;
  // Demo hosts are made up: their alerts stay in the dev outbox (never sent), which is enough.
  if (target.isDemo) return { channel: "email", ready: true, confirms: true, transport: "outbox" };
  if (!address) return { channel: "email", ready: false, reason: "no_email" };
  const failing = parseAlertPrefs(target.prefs).email.failing;
  if (failing && failing.address === address) return { channel: "email", ready: false, reason: "email_failing" };
  if (env.resend) return { channel: "email", ready: true, confirms: true, transport: "resend" };
  if (env.outboxCounts) return { channel: "email", ready: true, confirms: true, transport: "outbox" };
  return { channel: "email", ready: false, reason: "email_not_configured" };
}

/**
 * Every alert channel of a host, in the order they are tried. Telegram and browser notifications
 * join this list when their tables exist (founder's OK pending); until then only email.
 */
export function hostAlertChannels(target: HostAlertTarget, env: AlertEnvironment): ChannelStatus[] {
  return [emailChannelStatus(target, env)];
}

export type InstantGate = { ok: true; channels: AlertChannel[] } | { ok: false; reason: AlertBlockReason };

/**
 * May this host take instant bookings? Yes when at least one channel that confirms delivery is
 * ready. Otherwise the most useful reason to show the host (the first channel's).
 */
export function instantBookingGate(channels: readonly ChannelStatus[]): InstantGate {
  const ready = channels.filter((c): c is Extract<ChannelStatus, { ready: true }> => c.ready && c.confirms);
  if (ready.length > 0) return { ok: true, channels: ready.map((c) => c.channel) };
  const blocked = channels.find((c): c is Extract<ChannelStatus, { ready: false }> => !c.ready);
  return { ok: false, reason: blocked?.reason ?? "no_channel" };
}

/** One attempt to alert the host on one channel. */
export type AlertAttempt = { channel: AlertChannel; accepted: boolean; providerId?: string | null; error?: string | null };

/** The booking stands when a confirming channel accepted the alert. */
export function alertAccepted(attempts: readonly AlertAttempt[]): boolean {
  return attempts.some((a) => a.accepted && CONFIRMING_CHANNELS.includes(a.channel));
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
