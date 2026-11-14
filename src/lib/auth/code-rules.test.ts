/** The founder's login-code rules (decision 3, Q7) as pure functions (SECURITY_REPORT 3.1.a/c/f, 3.2.c). */
import { describe, expect, it } from "vitest";
import {
  CODE_RESEND_WAITS_SECONDS,
  CODE_SEND_DAILY_CAPS,
  LOGIN_CODE_MAX_ATTEMPTS,
  LOGIN_CODE_TTL_SECONDS,
  decideCodeSend,
  liveCount,
  phoneRangeOf,
  resendWaitSeconds,
} from "./code-rules";

const NOW = new Date("2026-11-08T10:00:00Z");
const later = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);
const counter = (count: number, endsIn = 3600) => ({ count, resetAt: later(endsIn) });

describe("login code rules", () => {
  it("codes live 10 minutes and die after 5 wrong tries", () => {
    expect(LOGIN_CODE_TTL_SECONDS).toBe(600);
    expect(LOGIN_CODE_MAX_ATTEMPTS).toBe(5);
  });

  it("resend waits are 60, 120, 300, then 900 seconds", () => {
    expect(CODE_RESEND_WAITS_SECONDS).toEqual([60, 120, 300, 900]);
    expect([1, 2, 3, 4, 5, 9].map(resendWaitSeconds)).toEqual([60, 120, 300, 900, 900, 900]);
    expect(resendWaitSeconds(0)).toBe(0);
  });

  it("daily caps: phone 5, email 10, IP 30, device 10", () => {
    expect(CODE_SEND_DAILY_CAPS).toMatchObject({ phone: 5, email: 10, ip: 30, device: 10 });
  });

  it("a number's range drops its last 3 digits", () => {
    expect(phoneRangeOf("+972500000123")).toBe("+972500000");
    expect(phoneRangeOf("+972500000999")).toBe(phoneRangeOf("+972500000001"));
  });

  it("a day counter counts only while its day lasts", () => {
    expect(liveCount(counter(4), NOW)).toBe(4);
    expect(liveCount({ count: 4, resetAt: NOW }, NOW)).toBe(0);
    expect(liveCount(null, NOW)).toBe(0);
  });
});

describe("decideCodeSend", () => {
  const empty = { target: null, nextAllowedAt: null, ip: null, device: null, phoneRange: null };

  it("the first code goes, and the next one waits 60 s", () => {
    expect(decideCodeSend("phone", empty, NOW)).toEqual({ ok: true, nextSendInSeconds: 60, sendsLeftToday: 4 });
    expect(decideCodeSend("email", empty, NOW)).toEqual({ ok: true, nextSendInSeconds: 60, sendsLeftToday: 9 });
  });

  it("refuses inside the wait, with the seconds left", () => {
    const decision = decideCodeSend("phone", { ...empty, target: counter(1), nextAllowedAt: later(42) }, NOW);
    expect(decision).toEqual({ ok: false, reason: "wait", scope: "resend", retryAfterSeconds: 42 });
  });

  it("the waits grow with every code of the day", () => {
    expect(decideCodeSend("email", { ...empty, target: counter(1) }, NOW)).toMatchObject({ ok: true, nextSendInSeconds: 120 });
    expect(decideCodeSend("email", { ...empty, target: counter(2) }, NOW)).toMatchObject({ ok: true, nextSendInSeconds: 300 });
    expect(decideCodeSend("email", { ...empty, target: counter(3) }, NOW)).toMatchObject({ ok: true, nextSendInSeconds: 900 });
    expect(decideCodeSend("email", { ...empty, target: counter(8) }, NOW)).toMatchObject({ ok: true, nextSendInSeconds: 900 });
  });

  it("refuses the 6th code to a phone and the 11th to an email in a day, until the day ends", () => {
    expect(decideCodeSend("phone", { ...empty, target: counter(5, 7200) }, NOW)).toEqual({
      ok: false,
      reason: "daily_cap",
      scope: "phone",
      retryAfterSeconds: 7200,
    });
    expect(decideCodeSend("email", { ...empty, target: counter(9) }, NOW)).toMatchObject({ ok: true, sendsLeftToday: 0 });
    expect(decideCodeSend("email", { ...empty, target: counter(10) }, NOW)).toMatchObject({ ok: false, scope: "email" });
  });

  it("caps per IP (30), device (10) and number range (10)", () => {
    expect(decideCodeSend("email", { ...empty, ip: counter(30) }, NOW)).toMatchObject({ ok: false, reason: "daily_cap", scope: "ip" });
    expect(decideCodeSend("email", { ...empty, ip: counter(29) }, NOW)).toMatchObject({ ok: true });
    expect(decideCodeSend("phone", { ...empty, device: counter(10) }, NOW)).toMatchObject({ ok: false, scope: "device" });
    expect(decideCodeSend("phone", { ...empty, phoneRange: counter(10) }, NOW)).toMatchObject({ ok: false, scope: "phoneRange" });
    // The range applies to phones only.
    expect(decideCodeSend("email", { ...empty, phoneRange: counter(10) }, NOW)).toMatchObject({ ok: true });
  });

  it("an ended day starts again from the first wait", () => {
    const yesterday = { count: 5, resetAt: later(-1) };
    expect(decideCodeSend("phone", { ...empty, target: yesterday, ip: yesterday, device: yesterday }, NOW)).toEqual({
      ok: true,
      nextSendInSeconds: 60,
      sendsLeftToday: 4,
    });
  });
});
