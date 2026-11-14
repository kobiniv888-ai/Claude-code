/**
 * "Verify your phone" (hardening A1, founder's answer (5) of 9 Nov 2026): the answer is the SAME
 * whether or not another account has the number (no "number already used"): the limits and the
 * CAPTCHA are charged first, and a number another account has gets the neutral send (the code is
 * stored and every limit charged, but no text goes out: ./phone-neutral.ts), so the confirm fails
 * like a wrong code. Every account needs a real email first (./account-email-guard.ts).
 * SECURITY_REPORT 3.2.f: the SERVER checks where the check happens (a bookable listing for a guest,
 * a host for the account page) before any SMS.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  limitsOk: true,
  newHostOk: true,
  captchaOk: true,
  otherAccount: true as boolean,
  findFirst: vi.fn(),
  send: vi.fn(),
  consume: vi.fn(),
  update: vi.fn(),
  limit: vi.fn(),
  newHostLimit: vi.fn(),
  freshProof: vi.fn(),
  replacement: false,
  bookable: true as boolean,
  listingOwner: "host-1",
  listings: 0,
  user: { id: "me", sessionId: "session-me", email: "me@example.com", phoneNumber: "+995555000099", phoneNumberVerified: true } as Record<string, unknown>,
  /** Whether each send ran inside the neutral context (no text). */
  neutralSends: [] as boolean[],
  screenCodes: true,
  /** Verification rows by identifier (the session bindings). */
  verifications: new Map<string, { value: string; expiresAt: Date; createdAt: Date }>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/monitoring", () => ({ reportError: async () => {} }));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    verification: {
      deleteMany: async ({ where }: { where: { identifier: string } }) => {
        state.verifications.delete(where.identifier);
        return { count: 1 };
      },
      create: async ({ data }: { data: { identifier: string; value: string; expiresAt: Date } }) => {
        state.verifications.set(data.identifier, { value: data.value, expiresAt: data.expiresAt, createdAt: new Date() });
        return data;
      },
      findFirst: async ({ where }: { where: { identifier: string } }) => state.verifications.get(where.identifier) ?? null,
    },
    user: {
      findFirst: (...args: unknown[]) => {
        state.findFirst(...args);
        return Promise.resolve(state.otherAccount ? { id: "someone-else" } : null);
      },
      update: async (...args: unknown[]) => {
        state.update(...args);
        return {};
      },
    },
    listing: {
      findFirst: async () => (state.bookable ? { ownerId: state.listingOwner } : null),
      count: async () => state.listings,
    },
  },
}));
vi.mock("./fresh-proof", async () => {
  const { FreshProofRequiredError } = await vi.importActual<typeof import("./fresh-proof")>("./fresh-proof");
  return {
    FreshProofRequiredError,
    requireFreshProof: async (user: unknown) => {
      state.freshProof(user);
      throw new FreshProofRequiredError();
    },
  };
});
vi.mock("./fresh-proof-rules", () => ({ isPhoneReplacement: () => state.replacement }));
vi.mock("./phone-change", () => ({ afterPhoneChanged: async () => {} }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: async () => state.captchaOk }));
vi.mock("./login-rate-limit", () => ({
  limitLoginCodeChecks: async () => true,
  limitPhoneCheckRequests: async (userId: string) => {
    state.limit(userId);
    return state.limitsOk;
  },
  limitNewHostPhoneChecks: async (userId: string) => {
    state.newHostLimit(userId);
    return state.newHostOk;
  },
}));
vi.mock("./session", () => ({
  requireUserForAction: async () => state.user,
}));
vi.mock("./server", () => ({
  auth: {
    api: {
      sendPhoneNumberOTP: async (...args: unknown[]) => {
        state.send(...args);
        const { isNeutralPhoneSend } = await import("./phone-neutral");
        state.neutralSends.push(isNeutralPhoneSend());
        return {};
      },
      consumePhoneNumberOTP: (...args: unknown[]) => {
        state.consume(...args);
        return Promise.resolve({ status: true });
      },
    },
  },
}));
vi.mock("./sms", () => ({
  phoneCodeRoute: async () => "screen",
  phoneCodeKey: (phone: string) => phone,
  readScreenCode: () => (state.screenCodes ? "123456" : null),
  forgetScreenCode: () => {},
}));
vi.mock("./code-display", () => ({ codeDisplayForHeaders: () => "screen" }));
vi.mock("./sms-guard", () => ({
  requestSmsSource: async (userId: string) => ({ userId, ipBlock: null, trusted: false }),
  withSmsSource: (_source: unknown, fn: () => Promise<unknown>) => fn(),
}));

const { sendPhoneCheckCode, confirmPhoneCheckCode } = await import("./phone-check-actions");
const { issuePostPhoneStepToken } = await import("./phone-check-token");
const { phoneCheckBindingKey } = await import("./phone-check-policy");

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
    state.newHostOk = true;
    state.newHostLimit.mockClear();
    state.verifications.clear();
    state.neutralSends.length = 0;
    state.screenCodes = true;
    state.user = { id: "me", sessionId: "session-me", email: "me@example.com", phoneNumber: "+995555000099", phoneNumberVerified: true };
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

  it("a number another account has: the same answer as a free number, every limit charged, but no text (answer (5))", async () => {
    // Production: no codes on screen, so both answers are byte-identical.
    state.screenCodes = false;
    const taken = await sendPhoneCheckCode({ phoneNumber: NUMBER, ...BOOKING });
    state.otherAccount = false;
    const free = await sendPhoneCheckCode({ phoneNumber: NUMBER, ...BOOKING });
    expect(JSON.stringify(taken)).toBe(JSON.stringify(free));
    expect(taken).toEqual({ ok: true, data: { status: "sent", phoneNumber: NUMBER, screenCode: null } });
    // Both went through the library's send (number rules, waits, daily caps); the first one inside
    // the neutral context, where sendOTP sends nothing (./server.ts).
    expect(state.limit).toHaveBeenCalledTimes(2);
    expect(state.send).toHaveBeenCalledTimes(2);
    expect(state.neutralSends).toEqual([true, false]);
    // The session may confirm either one (the confirm then fails like a wrong code for the taken one).
    expect(state.verifications.has(phoneCheckBindingKey("session-me", NUMBER))).toBe(true);
  });

  it("test mode never shows a code for a number another account has", async () => {
    const taken = await sendPhoneCheckCode({ phoneNumber: NUMBER, ...BOOKING });
    expect(taken).toMatchObject({ ok: true, data: { status: "sent", screenCode: null } });
  });

  it("an account without a real email adds one first (account_email_required), before any limit or text", async () => {
    state.otherAccount = false;
    state.user = { ...state.user, email: "995555000099@phone.bayit.invalid", emailIsPlaceholder: true };
    expect(await sendPhoneCheckCode({ phoneNumber: NUMBER, ...BOOKING })).toEqual({ ok: false, error: "account_email_required" });
    expect(state.limit).not.toHaveBeenCalled();
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

  it("the account page sends codes to hosts only", async () => {
    state.otherAccount = false;
    expect(await sendPhoneCheckCode({ phoneNumber: NUMBER, place: "account" })).toEqual({ ok: false, error: "phone_check_not_here" });
    state.listings = 1;
    expect(await sendPhoneCheckCode({ phoneNumber: NUMBER, place: "account" })).toMatchObject({ ok: true, data: { status: "sent" } });
    expect(state.send).toHaveBeenCalledTimes(1);
  });

  it("the post form: only an account really starting a listing (a draft, or the signed phone-step token) — 3.2.f", async () => {
    state.otherAccount = false;
    // Any signed-in account calling the action directly: no SMS.
    expect(await sendPhoneCheckCode({ phoneNumber: NUMBER, place: "post" })).toEqual({ ok: false, error: "phone_check_not_here" });
    expect(await sendPhoneCheckCode({ phoneNumber: NUMBER, place: "post", postStepToken: "123.abc" })).toEqual({ ok: false, error: "phone_check_not_here" });
    // Another account's token, or an old one, does not count.
    expect(await sendPhoneCheckCode({ phoneNumber: NUMBER, place: "post", postStepToken: issuePostPhoneStepToken("someone-else") })).toEqual({ ok: false, error: "phone_check_not_here" });
    expect(await sendPhoneCheckCode({ phoneNumber: NUMBER, place: "post", postStepToken: issuePostPhoneStepToken("me", Date.now() - 3 * 60 * 60 * 1000) })).toEqual({ ok: false, error: "phone_check_not_here" });
    expect(state.send).not.toHaveBeenCalled();
    expect(state.limit).not.toHaveBeenCalled();

    // The post form's phone step (no draft yet): sent, within the tight new-host limit.
    expect(await sendPhoneCheckCode({ phoneNumber: NUMBER, place: "post", postStepToken: issuePostPhoneStepToken("me") })).toMatchObject({ ok: true, data: { status: "sent" } });
    expect(state.newHostLimit).toHaveBeenCalledWith("me");
    state.newHostOk = false;
    expect(await sendPhoneCheckCode({ phoneNumber: NUMBER, place: "post", postStepToken: issuePostPhoneStepToken("me") })).toEqual({ ok: false, error: "rate_limited" });
    expect(state.send).toHaveBeenCalledTimes(1);

    // A host with a draft: no token needed, and not the new-host limit.
    state.newHostLimit.mockClear();
    state.listings = 1;
    expect(await sendPhoneCheckCode({ phoneNumber: NUMBER, place: "post" })).toMatchObject({ ok: true, data: { status: "sent" } });
    expect(state.newHostLimit).not.toHaveBeenCalled();
    expect(state.send).toHaveBeenCalledTimes(2);
  });

  it("only Israeli and Georgian mobile numbers (3.2.a, 3.2.e)", async () => {
    state.otherAccount = false;
    expect(await sendPhoneCheckCode({ phoneNumber: "+12015550123", ...BOOKING })).toEqual({ ok: false, error: "country_not_supported" });
    expect(await sendPhoneCheckCode({ phoneNumber: "+995322123456", ...BOOKING })).toEqual({ ok: false, error: "not_mobile" });
    expect(state.send).not.toHaveBeenCalled();
  });
});

describe("confirmPhoneCheckCode: the code belongs to the session that asked for it (3.6.a, 3.5.e)", () => {
  const OTHER = "+995555000124";
  beforeEach(() => {
    state.otherAccount = false;
    state.replacement = false;
    state.consume.mockClear();
    state.update.mockClear();
    state.freshProof.mockClear();
    state.send.mockClear();
    state.verifications.clear();
    state.listings = 1;
    state.user = { id: "me", sessionId: "session-me", email: "me@example.com", phoneNumber: null, phoneNumberVerified: false };
  });

  it("a send writes this session's binding; the confirm then uses up the code and saves the number", async () => {
    expect(await sendPhoneCheckCode({ phoneNumber: OTHER, place: "account" })).toMatchObject({ ok: true });
    expect(state.verifications.get(phoneCheckBindingKey("session-me", OTHER))?.value).toBe("first:me");
    expect(await confirmPhoneCheckCode({ phoneNumber: OTHER, code: "123456" })).toEqual({ ok: true, data: { phoneNumber: OTHER } });
    expect(state.consume).toHaveBeenCalledTimes(1);
    expect(state.update).toHaveBeenCalledTimes(1);
    expect(state.verifications.has(phoneCheckBindingKey("session-me", OTHER))).toBe(false);
  });

  it("no binding for this session: refused before the code is touched (another session's code, or griefing)", async () => {
    expect(await confirmPhoneCheckCode({ phoneNumber: OTHER, code: "123456" })).toEqual({ ok: false, error: "code_expired" });
    expect(state.consume).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });

  it("a binding made in session A does not work in session V, even for the same account", async () => {
    await sendPhoneCheckCode({ phoneNumber: OTHER, place: "account" });
    state.user = { id: "me", sessionId: "session-other", email: "me@example.com", phoneNumber: null, phoneNumberVerified: false };
    expect(await confirmPhoneCheckCode({ phoneNumber: OTHER, code: "123456" })).toEqual({ ok: false, error: "code_expired" });
    expect(state.consume).not.toHaveBeenCalled();
  });

  it("another account's binding row (same session id) is refused", async () => {
    state.verifications.set(phoneCheckBindingKey("session-me", OTHER), { value: "replace:someone-else", expiresAt: new Date(Date.now() + 60_000), createdAt: new Date() });
    expect(await confirmPhoneCheckCode({ phoneNumber: OTHER, code: "123456" })).toEqual({ ok: false, error: "code_expired" });
    expect(state.consume).not.toHaveBeenCalled();
  });

  it("an expired binding is refused", async () => {
    state.verifications.set(phoneCheckBindingKey("session-me", OTHER), { value: "first:me", expiresAt: new Date(Date.now() - 1000), createdAt: new Date() });
    expect(await confirmPhoneCheckCode({ phoneNumber: OTHER, code: "123456" })).toEqual({ ok: false, error: "code_expired" });
    expect(state.consume).not.toHaveBeenCalled();
  });

  it("a replacement whose binding is 'first' (the number became verified after the send) asks for a fresh proof", async () => {
    await sendPhoneCheckCode({ phoneNumber: OTHER, place: "account" });
    state.replacement = true;
    state.user = { id: "me", sessionId: "session-me", email: "me@example.com", phoneNumber: "+995555000099", phoneNumberVerified: true };
    expect(await confirmPhoneCheckCode({ phoneNumber: OTHER, code: "123456" })).toEqual({ ok: false, error: "fresh_proof_required" });
    expect(state.freshProof).toHaveBeenCalledTimes(1);
    expect(state.consume).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });

  it("a replacement bound as 'replace' (fresh proof at send time) goes through without asking again", async () => {
    state.verifications.set(phoneCheckBindingKey("session-me", OTHER), { value: "replace:me", expiresAt: new Date(Date.now() + 60_000), createdAt: new Date() });
    state.replacement = true;
    state.user = { id: "me", sessionId: "session-me", email: "me@example.com", phoneNumber: "+995555000099", phoneNumberVerified: true };
    expect(await confirmPhoneCheckCode({ phoneNumber: OTHER, code: "123456" })).toEqual({ ok: true, data: { phoneNumber: OTHER } });
    expect(state.freshProof).not.toHaveBeenCalled();
  });
});
