/**
 * Founder's answer (5), 9 Nov 2026: every account has a real EMAIL, so a phone-only user is never
 * locked out when texts are capped or paused. A phone-only account (placeholder login email) adds
 * one, verified by a code, before it continues; sensitive actions refuse it until then (server-side,
 * not only the login panel's step).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "u1", sessionId: "s1", email: "995555000099@phone.bayit.invalid", emailIsPlaceholder: true } as Record<string, unknown>,
  check: "ok" as "ok" | "wrong" | "expired" | "too_many_attempts",
  updateCount: 1,
  updateError: null as { code: string } | null,
  updates: [] as unknown[],
  sends: [] as unknown[],
  audits: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("./session", () => ({ requireUserForAction: async () => state.user }));
vi.mock("./fresh-proof", () => ({
  requireFreshProof: async () => {},
  checkSecurityCode: async () => state.check,
}));
vi.mock("./security-code-send", () => ({
  sendSecurityCodeWithLimits: async (input: unknown) => {
    state.sends.push(input);
    return { ok: true, data: { sentTo: "new@example.com", retryAfterSeconds: 60 } };
  },
}));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: async () => true }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ ok: true }) }));
vi.mock("@/lib/audit", () => ({ audit: async (entry: unknown) => void state.audits.push(entry) }));
vi.mock("@/lib/monitoring", () => ({ reportError: async () => {} }));
vi.mock("@/lib/db", () => ({
  db: {
    user: {
      updateMany: async (args: unknown) => {
        state.updates.push(args);
        if (state.updateError) throw state.updateError;
        return { count: state.updateCount };
      },
    },
  },
}));

const { needsAccountEmail } = await import("./account-email");
const { requireAccountEmail, AccountEmailRequiredError } = await import("./account-email-guard");
const { sendAccountEmailCode, confirmAccountEmail } = await import("./account-email-actions");

beforeEach(() => {
  state.user = { id: "u1", sessionId: "s1", email: "995555000099@phone.bayit.invalid", emailIsPlaceholder: true };
  state.check = "ok";
  state.updateCount = 1;
  state.updateError = null;
  state.updates.length = 0;
  state.sends.length = 0;
  state.audits.length = 0;
});

describe("needsAccountEmail / requireAccountEmail", () => {
  it("a phone-only account (placeholder login email) needs a real one; a real address does not", () => {
    expect(needsAccountEmail({ email: "995555000099@phone.bayit.invalid", emailIsPlaceholder: true })).toBe(true);
    expect(needsAccountEmail({ email: "995555000099@PHONE.bayit.invalid" })).toBe(true);
    expect(needsAccountEmail({ email: "" })).toBe(true);
    expect(needsAccountEmail({ email: "guest@example.com", emailIsPlaceholder: false })).toBe(false);
    expect(needsAccountEmail(null)).toBe(false);
  });

  it("sensitive actions throw account_email_required for such an account", () => {
    expect(() => requireAccountEmail({ email: "995555000099@phone.bayit.invalid", emailIsPlaceholder: true })).toThrow(AccountEmailRequiredError);
    expect(() => requireAccountEmail({ email: "guest@example.com", emailIsPlaceholder: false })).not.toThrow();
  });
});

describe("add your email (account-email-actions)", () => {
  it("sends a code to the NEW address, bound to it, through the emailed-code limits", async () => {
    const result = await sendAccountEmailCode({ email: " New@Example.com ", captchaToken: "t" });
    expect(result).toMatchObject({ ok: true });
    expect(state.sends).toEqual([expect.objectContaining({ purpose: "contact", to: "new@example.com", bindTo: "new@example.com" })]);
  });

  it("refuses another placeholder address and an account that already has an email", async () => {
    expect(await sendAccountEmailCode({ email: "995555000001@phone.bayit.invalid" })).toMatchObject({ ok: false, error: "invalid_input" });
    state.user = { id: "u1", sessionId: "s1", email: "guest@example.com", emailIsPlaceholder: false };
    expect(await sendAccountEmailCode({ email: "new@example.com" })).toEqual({ ok: false, error: "account_email_present" });
    expect(await confirmAccountEmail({ email: "new@example.com", code: "123456" })).toEqual({ ok: false, error: "account_email_present" });
    expect(state.sends).toEqual([]);
  });

  it("the right code makes it the LOGIN email (verified), only while the placeholder is still there, and audits it", async () => {
    expect(await confirmAccountEmail({ email: "new@example.com", code: "123456" })).toEqual({ ok: true, data: { email: "new@example.com" } });
    expect(state.updates).toEqual([{ where: { id: "u1", email: "995555000099@phone.bayit.invalid" }, data: { email: "new@example.com", emailVerified: true } }]);
    expect(state.audits).toEqual([expect.objectContaining({ action: "account.email_added", targetId: "u1" })]);
  });

  it("a wrong, expired or exhausted code changes nothing", async () => {
    for (const [check, error] of [["wrong", "invalid_code"], ["expired", "code_expired"], ["too_many_attempts", "too_many_attempts"]] as const) {
      state.check = check;
      expect(await confirmAccountEmail({ email: "new@example.com", code: "123456" })).toEqual({ ok: false, error });
    }
    expect(state.updates).toEqual([]);
  });

  it("only after the code proves the inbox does it say the address has another account", async () => {
    state.updateError = { code: "P2002" };
    expect(await confirmAccountEmail({ email: "new@example.com", code: "123456" })).toEqual({ ok: false, error: "email_in_use" });
    state.check = "wrong";
    expect(await confirmAccountEmail({ email: "new@example.com", code: "123456" })).toEqual({ ok: false, error: "invalid_code" });
  });
});
