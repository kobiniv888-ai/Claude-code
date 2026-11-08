/**
 * "Verify your phone" (hardening A1): the "number taken" answer reveals whether some account has a
 * number, so the action must charge its rate limits and check the CAPTCHA before it looks.
 * SECURITY_REPORT 3.2.f: the SERVER checks where the check happens (a bookable listing for a guest,
 * a host for the account page) before any SMS.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  limitsOk: true,
  captchaOk: true,
  otherAccount: true as boolean,
  findFirst: vi.fn(),
  send: vi.fn(),
  limit: vi.fn(),
  bookable: true as boolean,
  listingOwner: "host-1",
  listings: 0,
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
    listing: {
      findFirst: async () => (state.bookable ? { ownerId: state.listingOwner } : null),
      count: async () => state.listings,
    },
  },
}));
vi.mock("./fresh-proof", () => ({ requireFreshProof: async () => {} }));
vi.mock("./fresh-proof-rules", () => ({ isPhoneReplacement: () => false }));
vi.mock("./phone-change", () => ({ afterPhoneChanged: async () => {} }));
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
const BOOKING = { place: "booking", listingId: "listing-1" } as const;

describe("sendPhoneCheckCode", () => {
  beforeEach(() => {
    state.limitsOk = true;
    state.captchaOk = true;
    state.otherAccount = true;
    state.findFirst.mockClear();
    state.send.mockClear();
    state.limit.mockClear();
    state.bookable = true;
    state.listingOwner = "host-1";
    state.listings = 0;
  });

  it("does not say whether a number has an account when the CAPTCHA fails", async () => {
    state.captchaOk = false;
    const result = await sendPhoneCheckCode({ phoneNumber: NUMBER, ...BOOKING });
    expect(result).toEqual({ ok: false, error: "captcha_failed" });
    expect(state.findFirst).not.toHaveBeenCalled();
  });

  it("does not say whether a number has an account once the account or IP is over the limit", async () => {
    state.limitsOk = false;
    const result = await sendPhoneCheckCode({ phoneNumber: NUMBER, ...BOOKING });
    expect(result).toEqual({ ok: false, error: "rate_limited" });
    expect(state.findFirst).not.toHaveBeenCalled();
    expect(state.limit).toHaveBeenCalledWith("me");
  });

  it("answers phone_taken only after the limits and the CAPTCHA, and sends no code", async () => {
    const result = await sendPhoneCheckCode({ phoneNumber: NUMBER, ...BOOKING });
    expect(result).toEqual({ ok: false, error: "phone_taken" });
    expect(state.limit).toHaveBeenCalledTimes(1);
    expect(state.send).not.toHaveBeenCalled();
  });

  it("sends a code for a free number", async () => {
    state.otherAccount = false;
    const result = await sendPhoneCheckCode({ phoneNumber: NUMBER, ...BOOKING });
    expect(result).toMatchObject({ ok: true, data: { status: "sent", phoneNumber: NUMBER } });
    expect(state.send).toHaveBeenCalledTimes(1);
  });

  it("answers already_verified for the account's own number without charging a limit", async () => {
    state.captchaOk = false;
    const result = await sendPhoneCheckCode({ phoneNumber: "+995555000099", ...BOOKING });
    expect(result).toMatchObject({ ok: true, data: { status: "already_verified" } });
    expect(state.limit).not.toHaveBeenCalled();
  });
  it("refuses a request without a place (the server decides where SMS may go)", async () => {
    state.otherAccount = false;
    expect(await sendPhoneCheckCode({ phoneNumber: NUMBER })).toEqual({ ok: false, error: "invalid_phone" });
    expect(state.send).not.toHaveBeenCalled();
  });

  it("a guest without a bookable listing gets no SMS (3.2.f)", async () => {
    state.otherAccount = false;
    state.bookable = false;
    expect(await sendPhoneCheckCode({ phoneNumber: NUMBER, ...BOOKING })).toEqual({ ok: false, error: "phone_check_not_here" });
    expect(await sendPhoneCheckCode({ phoneNumber: NUMBER, place: "booking" })).toEqual({ ok: false, error: "phone_check_not_here" });
    expect(state.send).not.toHaveBeenCalled();
    expect(state.limit).not.toHaveBeenCalled();
  });

  it("booking your own listing is not a reason for an SMS", async () => {
    state.otherAccount = false;
    state.listingOwner = "me";
    expect(await sendPhoneCheckCode({ phoneNumber: NUMBER, ...BOOKING })).toEqual({ ok: false, error: "phone_check_not_here" });
    expect(state.send).not.toHaveBeenCalled();
  });

  it("the account page sends codes to hosts only; the post form to anyone signed in", async () => {
    state.otherAccount = false;
    expect(await sendPhoneCheckCode({ phoneNumber: NUMBER, place: "account" })).toEqual({ ok: false, error: "phone_check_not_here" });
    state.listings = 1;
    expect(await sendPhoneCheckCode({ phoneNumber: NUMBER, place: "account" })).toMatchObject({ ok: true, data: { status: "sent" } });
    state.listings = 0;
    expect(await sendPhoneCheckCode({ phoneNumber: NUMBER, place: "post" })).toMatchObject({ ok: true, data: { status: "sent" } });
    expect(state.send).toHaveBeenCalledTimes(2);
  });

  it("only Israeli and Georgian mobile numbers (3.2.a, 3.2.e)", async () => {
    state.otherAccount = false;
    expect(await sendPhoneCheckCode({ phoneNumber: "+12015550123", ...BOOKING })).toEqual({ ok: false, error: "country_not_supported" });
    expect(await sendPhoneCheckCode({ phoneNumber: "+995322123456", ...BOOKING })).toEqual({ ok: false, error: "not_mobile" });
    expect(state.send).not.toHaveBeenCalled();
  });
});
