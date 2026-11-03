import { describe, expect, it } from "vitest";
import {
  alertAccepted,
  alertsPart,
  bookingCodeIn,
  emailChannelStatus,
  hostAlertChannels,
  instantBookingGate,
  parseAlertPrefs,
  withEmailFailing,
  type AlertEnvironment,
  type HostAlertTarget,
} from "./alert-rules";

const host = (extra: Partial<HostAlertTarget> = {}): HostAlertTarget => ({ email: "yossi@example.com", isDemo: false, prefs: null, ...extra });
const REAL: AlertEnvironment = { resend: true, outboxCounts: false };
const REAL_NO_RESEND: AlertEnvironment = { resend: false, outboxCounts: false };
const CODESPACE: AlertEnvironment = { resend: false, outboxCounts: true };

describe("the email channel", () => {
  it("is ready on the real site when Resend is set up and the host has a real address", () => {
    expect(emailChannelStatus(host(), REAL)).toEqual({ channel: "email", ready: true, confirms: true, transport: "resend" });
  });
  it("uses the outbox in development / test mode, and always for demo hosts", () => {
    expect(emailChannelStatus(host(), CODESPACE)).toMatchObject({ ready: true, transport: "outbox" });
    expect(emailChannelStatus(host({ isDemo: true, email: null }), REAL)).toMatchObject({ ready: true, transport: "outbox" });
    expect(emailChannelStatus(host({ isDemo: true }), REAL_NO_RESEND)).toMatchObject({ ready: true, transport: "outbox" });
  });
  it("is off on the real site without Resend, and for hosts without an address", () => {
    expect(emailChannelStatus(host(), REAL_NO_RESEND)).toEqual({ channel: "email", ready: false, reason: "email_not_configured" });
    expect(emailChannelStatus(host({ email: null }), REAL)).toEqual({ channel: "email", ready: false, reason: "no_email" });
    expect(emailChannelStatus(host({ email: null }), CODESPACE)).toMatchObject({ ready: false, reason: "no_email" });
  });
  it("is paused for the address that bounced, and only that address", () => {
    const prefs = withEmailFailing(null, { address: "Yossi@Example.com", reason: "bounced", since: "2026-11-03T10:00:00.000Z" });
    expect(emailChannelStatus(host({ prefs }), REAL)).toMatchObject({ ready: false, reason: "email_failing" });
    expect(emailChannelStatus(host({ prefs }), CODESPACE)).toMatchObject({ ready: false, reason: "email_failing" });
    expect(emailChannelStatus(host({ prefs, email: "yossi.new@example.com" }), REAL)).toMatchObject({ ready: true });
  });
});

describe("instantBookingGate", () => {
  it("opens when one confirming channel is ready", () => {
    expect(instantBookingGate(hostAlertChannels(host(), REAL))).toEqual({ ok: true, channels: ["email"] });
  });
  it("names the reason when none is", () => {
    expect(instantBookingGate(hostAlertChannels(host(), REAL_NO_RESEND))).toEqual({ ok: false, reason: "email_not_configured" });
    expect(instantBookingGate([])).toEqual({ ok: false, reason: "no_channel" });
  });
  it("never opens on browser notifications alone (they can't confirm delivery)", () => {
    expect(instantBookingGate([{ channel: "push", ready: true, confirms: false }])).toEqual({ ok: false, reason: "no_channel" });
    expect(
      instantBookingGate([
        { channel: "email", ready: false, reason: "email_failing" },
        { channel: "push", ready: true, confirms: false },
      ]),
    ).toEqual({ ok: false, reason: "email_failing" });
    expect(
      instantBookingGate([
        { channel: "email", ready: false, reason: "email_failing" },
        { channel: "telegram", ready: true, confirms: true },
      ]),
    ).toEqual({ ok: true, channels: ["telegram"] });
  });
});

describe("alertAccepted", () => {
  it("needs a confirming channel that accepted the alert", () => {
    expect(alertAccepted([{ channel: "email", accepted: true, providerId: "re_1" }])).toBe(true);
    expect(alertAccepted([{ channel: "email", accepted: false, error: "failed" }])).toBe(false);
    expect(alertAccepted([{ channel: "push", accepted: true }])).toBe(false);
    expect(alertAccepted([])).toBe(false);
  });
});

describe("notificationPrefs.alerts", () => {
  it("adds and clears the failing mark without touching the account settings", () => {
    const settings = { email: { listing: true, tickets: false, messages: true, marketing: false }, whatsapp: false };
    const failing = withEmailFailing(settings, { address: "a@example.com", reason: "complained", since: "2026-11-03T10:00:00.000Z" });
    expect(failing).toMatchObject(settings);
    expect(parseAlertPrefs(failing).email.failing).toEqual({ address: "a@example.com", reason: "complained", since: "2026-11-03T10:00:00.000Z" });
    expect(alertsPart(failing)).toEqual({ email: { failing: { address: "a@example.com", reason: "complained", since: "2026-11-03T10:00:00.000Z" } } });
    const cleared = withEmailFailing(failing, null);
    expect(cleared).toMatchObject(settings);
    expect(parseAlertPrefs(cleared).email.failing).toBeNull();
  });
  it("reads broken values as nothing failing", () => {
    expect(parseAlertPrefs(null).email.failing).toBeNull();
    expect(parseAlertPrefs("x").email.failing).toBeNull();
    expect(parseAlertPrefs({ alerts: { email: { failing: { address: "a@b.c", reason: "nope" } } } }).email.failing).toBeNull();
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
