/**
 * "Verify your phone" (hardening A1): the "number taken" answer reveals whether some account has a
 * number, so the action must charge its rate limits and check the CAPTCHA before it looks.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  limitsOk: true,
  captchaOk: true,
  otherAccount: true as boolean,
  findFirst: vi.fn(),
  send: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/monitoring", () => ({ reportError: async () => {} }));
vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findFirst: (...args: unknown[]) => {
        state.findFirst(...args);
        return Promise.resolve(state.otherAccount ? { id: "someone-else" } : null);
      },
    },
  },
}));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: async () => state.captchaOk }));
vi.mock("./login-rate-limit", () => ({
  limitLoginCodeChecks: async () => true,
  limitPhoneCheckRequests: async (userId: string) => {
    state.limit(userId);
    return state.limitsOk;
  },
}));
vi.mock("./session", () => ({
  requireUserForAction: async () => ({ id: "me", phoneNumber: "+995555000099", phoneNumberVerified: true }),
}));
vi.mock("./server", () => ({
  auth: {
    api: {
      sendPhoneNumberOTP: (...args: unknown[]) => {
        state.send(...args);
        return Promise.resolve({});
      },
    },
  },
}));
vi.mock("./sms", () => ({
  phoneCodeRoute: async () => "screen",
  phoneCodeKey: (phone: string) => phone,
  readScreenCode: () => "123456",
  forgetScreenCode: () => {},
}));
vi.mock("./code-display", () => ({ codeDisplayForHeaders: () => "screen" }));

const { sendPhoneCheckCode } = await import("./phone-check-actions");

const NUMBER = "+995555000123";

describe("sendPhoneCheckCode", () => {
  beforeEach(() => {
    state.limitsOk = true;
    state.captchaOk = true;
    state.otherAccount = true;
    state.findFirst.mockClear();
    state.send.mockClear();
    state.limit.mockClear();
  });

  it("does not say whether a number has an account when the CAPTCHA fails", async () => {
    state.captchaOk = false;
    const result = await sendPhoneCheckCode({ phoneNumber: NUMBER });
    expect(result).toEqual({ ok: false, error: "captcha_failed" });
    expect(state.findFirst).not.toHaveBeenCalled();
  });

  it("does not say whether a number has an account once the account or IP is over the limit", async () => {
    state.limitsOk = false;
    const result = await sendPhoneCheckCode({ phoneNumber: NUMBER });
    expect(result).toEqual({ ok: false, error: "rate_limited" });
    expect(state.findFirst).not.toHaveBeenCalled();
    expect(state.limit).toHaveBeenCalledWith("me");
  });

  it("answers phone_taken only after the limits and the CAPTCHA, and sends no code", async () => {
    const result = await sendPhoneCheckCode({ phoneNumber: NUMBER });
    expect(result).toEqual({ ok: false, error: "phone_taken" });
    expect(state.limit).toHaveBeenCalledTimes(1);
    expect(state.send).not.toHaveBeenCalled();
  });

  it("sends a code for a free number", async () => {
    state.otherAccount = false;
    const result = await sendPhoneCheckCode({ phoneNumber: NUMBER });
    expect(result).toMatchObject({ ok: true, data: { status: "sent", phoneNumber: NUMBER } });
    expect(state.send).toHaveBeenCalledTimes(1);
  });

  it("answers already_verified for the account's own number without charging a limit", async () => {
    state.captchaOk = false;
    const result = await sendPhoneCheckCode({ phoneNumber: "+995555000099" });
    expect(result).toMatchObject({ ok: true, data: { status: "already_verified" } });
    expect(state.limit).not.toHaveBeenCalled();
  });
});
