import { describe, expect, it } from "vitest";
import {
  afterChannelFailure,
  alertAccepted,
  alertsPart,
  blockReason,
  bookingAffectedByFailure,
  bookingCodeIn,
  emailChannelStatus,
  hostAlertChannels,
  instantBookingGate,
  notifiedVia,
  parseAlertPrefs,
  parseNotifiedVia,
  pushChannelStatus,
  resumesFailure,
  telegramChannelStatus,
  withChannelEnabled,
  withChannelFailing,
  withEmailFailing,
  type AlertEnvironment,
  type HostAlertTarget,
} from "./rules";

const host = (extra: Partial<HostAlertTarget> = {}): HostAlertTarget => ({
  email: "yossi@example.com",
  isDemo: false,
  prefs: null,
  telegramChatId: null,
  pushDevices: 0,
  ...extra,
});
const ALL: AlertEnvironment = { resend: true, outboxCounts: false, telegram: true, push: true };
const NO_RESEND: AlertEnvironment = { ...ALL, resend: false };
const CODESPACE: AlertEnvironment = { resend: false, outboxCounts: true, telegram: false, push: false };
const SINCE = "2026-11-03T10:00:00.000Z";

const emailOff = withChannelEnabled(null, "email", false);

describe("the gate: instant booking needs a confirming channel that works", () => {
  it("email only → instant", () => {
    expect(instantBookingGate(hostAlertChannels(host(), ALL))).toEqual({ ok: true, channels: ["email"] });
  });
  it("Telegram only → instant (even on a site without Resend)", () => {
    const telegramOnly = host({ email: null, telegramChatId: "1001" });
    expect(instantBookingGate(hostAlertChannels(telegramOnly, NO_RESEND))).toEqual({ ok: true, channels: ["telegram"] });
    expect(instantBookingGate(hostAlertChannels(host({ prefs: emailOff, telegramChatId: "1001" }), ALL))).toEqual({ ok: true, channels: ["telegram"] });
  });
  it("both → instant, email first", () => {
    expect(instantBookingGate(hostAlertChannels(host({ telegramChatId: "1001", pushDevices: 2 }), ALL))).toEqual({ ok: true, channels: ["email", "telegram"] });
  });
  it("browser notifications only → contact (they can't confirm delivery)", () => {
    const pushOnly = host({ prefs: emailOff, pushDevices: 3 });
    const channels = hostAlertChannels(pushOnly, ALL);
    expect(channels.find((c) => c.channel === "push")).toMatchObject({ ready: true, confirms: false });
    expect(instantBookingGate(channels)).toEqual({ ok: false, reason: "no_channel" });
    expect(instantBookingGate(hostAlertChannels(host({ email: null, pushDevices: 1 }), ALL))).toEqual({ ok: false, reason: "no_email" });
  });
  it("no channel at all → contact, with the most useful reason", () => {
    expect(instantBookingGate([])).toEqual({ ok: false, reason: "no_channel" });
    expect(instantBookingGate(hostAlertChannels(host({ prefs: emailOff }), ALL))).toEqual({ ok: false, reason: "no_channel" });
    expect(instantBookingGate(hostAlertChannels(host(), NO_RESEND))).toEqual({ ok: false, reason: "email_not_configured" });
    expect(instantBookingGate(hostAlertChannels(host({ email: null }), ALL))).toEqual({ ok: false, reason: "no_email" });
  });
  it("a paused channel is named first (the host has to act)", () => {
    const prefs = withChannelFailing(withChannelFailing(null, "email", { reason: "bounced", since: SINCE, address: "yossi@example.com" }), "telegram", {
      reason: "blocked",
      since: SINCE,
      chatId: "1001",
    });
    expect(instantBookingGate(hostAlertChannels(host({ prefs, telegramChatId: "1001" }), ALL))).toEqual({ ok: false, reason: "email_failing" });
    const telegramOnlyFailing = withChannelFailing(emailOff, "telegram", { reason: "blocked", since: SINCE, chatId: "1001" });
    expect(instantBookingGate(hostAlertChannels(host({ prefs: telegramOnlyFailing, telegramChatId: "1001" }), ALL))).toEqual({
      ok: false,
      reason: "telegram_failing",
    });
  });
  it("blockReason never blames a channel the host doesn't use", () => {
    expect(blockReason([{ channel: "telegram", state: "not_linked", ready: false, confirms: true }])).toBe("no_channel");
  });
});

describe("the email channel", () => {
  it("is ready on the real site when Resend is set up and the host has a real address", () => {
    expect(emailChannelStatus(host(), ALL)).toMatchObject({ state: "ready", ready: true, confirms: true, transport: "resend" });
  });
  it("uses the outbox in development / test mode, and always for demo hosts", () => {
    expect(emailChannelStatus(host(), CODESPACE)).toMatchObject({ ready: true, transport: "outbox" });
    expect(emailChannelStatus(host({ isDemo: true, email: null }), ALL)).toMatchObject({ ready: true, transport: "outbox" });
    expect(emailChannelStatus(host({ isDemo: true }), NO_RESEND)).toMatchObject({ ready: true, transport: "outbox" });
  });
  it("is off when the host turned it off, and not configured on the real site without Resend", () => {
    expect(emailChannelStatus(host({ prefs: emailOff }), ALL)).toMatchObject({ state: "off", ready: false });
    expect(emailChannelStatus(host(), NO_RESEND)).toMatchObject({ state: "not_configured", ready: false });
    expect(emailChannelStatus(host({ email: null }), CODESPACE)).toMatchObject({ state: "no_email" });
  });
  it("is paused for the address that bounced, and only that address", () => {
    const prefs = withEmailFailing(null, { address: "Yossi@Example.com", reason: "bounced", since: SINCE });
    expect(emailChannelStatus(host({ prefs }), ALL)).toMatchObject({ state: "failing", failing: { address: "yossi@example.com" } });
    expect(emailChannelStatus(host({ prefs }), CODESPACE)).toMatchObject({ state: "failing" });
    expect(emailChannelStatus(host({ prefs, email: "yossi.new@example.com" }), ALL)).toMatchObject({ state: "ready" });
  });
});

describe("Telegram and browser notifications", () => {
  it("Telegram: coming soon without the bot, needs a connected chat, can be switched off or paused", () => {
    expect(telegramChannelStatus(host({ telegramChatId: "1001" }), CODESPACE)).toMatchObject({ state: "not_configured" });
    expect(telegramChannelStatus(host(), ALL)).toMatchObject({ state: "not_linked" });
    expect(telegramChannelStatus(host({ telegramChatId: "1001" }), ALL)).toMatchObject({ state: "ready", confirms: true });
    expect(telegramChannelStatus(host({ telegramChatId: "1001", prefs: withChannelEnabled(null, "telegram", false) }), ALL)).toMatchObject({ state: "off" });
    const prefs = withChannelFailing(null, "telegram", { reason: "blocked", since: SINCE, chatId: "1001" });
    expect(telegramChannelStatus(host({ telegramChatId: "1001", prefs }), ALL)).toMatchObject({ state: "failing" });
    // Re-connected from another chat: the old pause no longer applies.
    expect(telegramChannelStatus(host({ telegramChatId: "2002", prefs }), ALL)).toMatchObject({ state: "ready" });
  });
  it("push: needs VAPID keys and a device, never confirms", () => {
    expect(pushChannelStatus(host({ pushDevices: 1 }), CODESPACE)).toMatchObject({ state: "not_configured" });
    expect(pushChannelStatus(host(), ALL)).toMatchObject({ state: "not_linked" });
    expect(pushChannelStatus(host({ pushDevices: 1 }), ALL)).toMatchObject({ state: "ready", confirms: false });
    expect(pushChannelStatus(host({ pushDevices: 1, prefs: withChannelEnabled(null, "push", false) }), ALL)).toMatchObject({ state: "off" });
  });
});

describe("alertAccepted and hostNotifiedVia", () => {
  it("needs a confirming channel that accepted the alert", () => {
    expect(alertAccepted([{ channel: "email", accepted: true, providerId: "re_1" }])).toBe(true);
    expect(alertAccepted([{ channel: "telegram", accepted: true }])).toBe(true);
    expect(alertAccepted([{ channel: "email", accepted: false, error: "failed" }])).toBe(false);
    expect(alertAccepted([{ channel: "push", accepted: true }])).toBe(false);
    expect(alertAccepted([])).toBe(false);
  });
  it("records the confirming channels that accepted, and reads them back", () => {
    expect(
      notifiedVia([
        { channel: "email", accepted: true },
        { channel: "telegram", accepted: true },
        { channel: "push", accepted: true },
      ]),
    ).toBe("email,telegram");
    expect(notifiedVia([{ channel: "telegram", accepted: true }, { channel: "email", accepted: false }])).toBe("telegram");
    expect(notifiedVia([{ channel: "push", accepted: true }])).toBeNull();
    expect(parseNotifiedVia("email, telegram,sms,email")).toEqual(["email", "telegram"]);
    expect(parseNotifiedVia(null)).toEqual([]);
  });
});

describe("pause and resume rules", () => {
  const both = () => hostAlertChannels(host({ telegramChatId: "1001", pushDevices: 1 }), ALL);

  it("a bounced email pauses only email: bookings continue while Telegram works", () => {
    expect(afterChannelFailure(both(), "email")).toEqual({ stillInstant: true, tellVia: ["telegram", "push"] });
  });
  it("with only notifications left, the host goes to Ask the host (told by notification)", () => {
    const emailAndPush = hostAlertChannels(host({ pushDevices: 1 }), ALL);
    expect(afterChannelFailure(emailAndPush, "email")).toEqual({ stillInstant: false, tellVia: ["push"] });
    const telegramAndPush = hostAlertChannels(host({ prefs: emailOff, telegramChatId: "1001", pushDevices: 1 }), ALL);
    expect(afterChannelFailure(telegramAndPush, "telegram")).toEqual({ stillInstant: false, tellVia: ["push"] });
  });
  it("a blocked bot is told by email when email still works", () => {
    expect(afterChannelFailure(both(), "telegram")).toEqual({ stillInstant: true, tellVia: ["email", "push"] });
  });
  it("a booking is affected only when no other confirming channel delivered its alert", () => {
    expect(bookingAffectedByFailure("email", "email")).toBe(true);
    expect(bookingAffectedByFailure("email,telegram", "email")).toBe(false);
    expect(bookingAffectedByFailure("telegram", "email")).toBe(false);
    // Bookings from before round 3 have no record: the guest is told (the safe side).
    expect(bookingAffectedByFailure(null, "email")).toBe(true);
  });
  it("only a later delivery or send to the same address / chat clears a pause", () => {
    const email = { reason: "bounced" as const, since: SINCE, address: "yossi@example.com" };
    const later = new Date("2026-11-03T11:00:00Z");
    const earlier = new Date("2026-11-03T09:00:00Z");
    expect(resumesFailure(email, { channel: "email", sentAt: later, address: "Yossi@example.com" })).toBe(true);
    expect(resumesFailure(email, { channel: "email", sentAt: earlier, address: "yossi@example.com" })).toBe(false);
    expect(resumesFailure(email, { channel: "email", sentAt: later, address: "other@example.com" })).toBe(false);
    const telegram = { reason: "blocked" as const, since: SINCE, chatId: "1001" };
    expect(resumesFailure(telegram, { channel: "telegram", sentAt: later, chatId: "1001" })).toBe(true);
    expect(resumesFailure(telegram, { channel: "telegram", sentAt: later, chatId: "2002" })).toBe(false);
    expect(resumesFailure(null, { channel: "telegram", sentAt: later, chatId: "1001" })).toBe(false);
  });
});

describe("notificationPrefs.alerts", () => {
  const settings = { email: { listing: true, tickets: false, messages: true, marketing: false }, whatsapp: false };

  it("defaults: every channel on, nothing failing", () => {
    expect(parseAlertPrefs(null)).toEqual({ channels: { email: true, telegram: true, push: true }, email: { failing: null }, telegram: { failing: null } });
  });
  it("switches channels and marks failures without touching the account settings", () => {
    const off = withChannelEnabled(settings, "email", false);
    expect(off).toMatchObject(settings);
    expect(parseAlertPrefs(off).channels).toEqual({ email: false, telegram: true, push: true });
    const failing = withChannelFailing(off, "email", { address: "A@example.com", reason: "complained", since: SINCE });
    expect(parseAlertPrefs(failing).email.failing).toEqual({ address: "a@example.com", reason: "complained", since: SINCE });
    expect(parseAlertPrefs(failing).channels.email).toBe(false);
    expect(alertsPart(failing)).toMatchObject({ channels: { email: false }, email: { failing: { address: "a@example.com" } } });
    const cleared = withChannelFailing(failing, "email", null);
    expect(cleared).toMatchObject(settings);
    expect(parseAlertPrefs(cleared).email.failing).toBeNull();
  });
  it("reads broken values as on and nothing failing", () => {
    expect(parseAlertPrefs("x").channels.email).toBe(true);
    expect(parseAlertPrefs({ alerts: { email: { failing: { address: "a@b.c", reason: "nope" } } } }).email.failing).toBeNull();
    expect(parseAlertPrefs({ alerts: { telegram: { failing: { reason: "blocked" } } } }).telegram.failing).toBeNull();
    expect(parseAlertPrefs({ alerts: { channels: { email: "no" } } }).channels.email).toBe(true);
    expect(alertsPart({ alerts: [] })).toBeUndefined();
  });
});

describe("bookingCodeIn", () => {
  it("finds the booking number in an email's text", () => {
    expect(bookingCodeIn("Booking number: BT-7K3Q9\nPlace: …")).toBe("BT-7K3Q9");
    expect(bookingCodeIn("BT-0OI1Z")).toBeNull();
    expect(bookingCodeIn(null)).toBeNull();
  });
});
