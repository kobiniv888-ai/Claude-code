/**
 * The login-code send hooks with the REAL Better Auth plugins and our hooks (./server.ts), against
 * the local database, with email and SMS delivery switched ON (mocked senders) so the server takes
 * the real route: the waits and caps of `limitCodeSend` must refuse a second code (SECURITY_REPORT
 * 3.1.b/c/f; S1 review login-codes-5/6/9/12/15). Fake addresses and numbers only; every row is removed.
 */
import "dotenv/config";
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const run = randomUUID().slice(0, 8);
const mocks = vi.hoisted(() => ({
  ipHash: "",
  emails: [] as { to: string; code?: string }[],
  texts: [] as string[],
  smsOk: true,
  budgetAvailable: true,
}));
mocks.ipHash = `vitest-hooks-${run}`;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/request", () => ({
  getIpHash: async () => mocks.ipHash,
  getDeviceHash: async () => null,
  getClientIp: async () => null,
  getCountryCode: async () => null,
  getUserAgent: async () => null,
}));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: async () => true }));
// The SMS text (auth.sms.code) is not what this test checks.
vi.mock("next-intl/server", () => ({ getTranslations: async () => (_key: string, values?: { code?: string }) => `code ${values?.code ?? ""}` }));
vi.mock("@/lib/email", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...original,
    isEmailDeliveryConfigured: () => true,
    sendEmail: async (input: { to: string; data?: { code?: string } }) => {
      mocks.emails.push({ to: input.to, code: input.data?.code });
      return { ok: true, delivery: "logged" };
    },
  };
});
vi.mock("@/lib/sms", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/sms")>();
  return {
    ...original,
    isSmsConfigured: () => true,
    sendSms: async (input: { to: string }) => {
      mocks.texts.push(input.to);
      return mocks.smsOk ? { ok: true, delivered: false } : { ok: false };
    },
  };
});
// The shared database's real SMS budget is never touched by this test.
vi.mock("./sms-guard", async (importOriginal) => {
  const original = await importOriginal<typeof import("./sms-guard")>();
  return {
    ...original,
    smsPausedFor: async () => false,
    smsBudgetAvailable: async () => mocks.budgetAvailable,
    reserveSmsSend: async () => ({ ok: true, budgetUsed: 1 }),
    releaseSmsSend: async () => {},
    recordSmsCodeSent: async () => {},
  };
});

process.env.SITE_ENV = "development";
process.env.AUTH_TEST_MODE = "true";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
process.env.BETTER_AUTH_URL = "http://localhost:3000";

const { auth } = await import("./server");
const { db } = await import("@/lib/db");
const { codeSendKeys } = await import("./login-rate-limit");
const { hmacHash } = await import("@/lib/crypto");

const headers = new Headers({ host: "localhost:3000" });
const startedAt = new Date();
const emails: string[] = [];
const phones: string[] = [];
const email = () => {
  const address = `vitest-hooks-${run}-${emails.length}@example.com`;
  emails.push(address);
  return address;
};
const phone = () => {
  const number = `+97250000${String(randomInt(10_000)).padStart(4, "0")}`;
  phones.push(number);
  return number;
};

type Failure = { ok: false; status?: number; code?: string; retryAfter?: number };
const failure = (e: { statusCode?: number; body?: { code?: string; retryAfter?: number } }): Failure => ({
  ok: false,
  status: e.statusCode,
  code: e.body?.code,
  retryAfter: e.body?.retryAfter,
});
const sendEmailCode = (address: string) =>
  auth.api.sendVerificationOTP({ body: { email: address, type: "sign-in" }, headers }).then(() => ({ ok: true as const }), failure);
const signIn = (address: string, otp: string) => auth.api.signInEmailOTP({ body: { email: address, otp }, headers }).then(() => ({ ok: true as const }), failure);
const sendPhoneCode = (number: string) => auth.api.sendPhoneNumberOTP({ body: { phoneNumber: number }, headers }).then(() => ({ ok: true as const }), failure);
const counter = async (key: string | null) => (key ? ((await db.rateLimit.findUnique({ where: { key } }))?.count ?? 0) : 0);

beforeEach(() => {
  mocks.emails = [];
  mocks.texts = [];
  mocks.smsOk = true;
  mocks.budgetAvailable = true;
});

afterAll(async () => {
  const keys = [
    ...emails.flatMap((address) => [
      ...Object.values(codeSendKeys({ channel: "email", target: address, ipHash: mocks.ipHash, deviceHash: null })),
      `auth:email-otp-send:email:${hmacHash(`email:${address}`)}`,
    ]),
    ...phones.flatMap((number) => [
      ...Object.values(codeSendKeys({ channel: "phone", target: number, ipHash: mocks.ipHash, deviceHash: null })),
      `auth:otp-send:phone:${hmacHash(`phone:${number}`)}`,
    ]),
  ].filter((key): key is string => !!key);
  await db.rateLimit.deleteMany({ where: { OR: [{ key: { in: keys } }, { key: { contains: mocks.ipHash } }] } });
  await db.verification.deleteMany({ where: { OR: emails.map((address) => ({ identifier: { contains: address } })).concat(phones.map((number) => ({ identifier: { contains: number } }))) } });
  await db.securityEvent.deleteMany({ where: { type: { in: ["login_failed", "login_code_locked", "email_code_sent", "rate_limited"] }, createdAt: { gte: startedAt } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.$disconnect();
});

describe("email codes through the real hooks", () => {
  it("a second code within 60 s is refused by the server with the wait (CODE_RESEND_WAIT)", async () => {
    const address = email();
    expect(await sendEmailCode(address)).toEqual({ ok: true });
    const second = await sendEmailCode(address);
    expect(second).toMatchObject({ ok: false, status: 429, code: "CODE_RESEND_WAIT" });
    expect((second as Failure).retryAfter).toBeGreaterThanOrEqual(58);
    expect((second as Failure).retryAfter).toBeLessThanOrEqual(60);
    expect(mocks.emails).toHaveLength(1);
  });

  it("refused requests during the wait do not use up the address's hourly allowance", async () => {
    const address = email();
    expect(await sendEmailCode(address)).toEqual({ ok: true });
    for (let i = 0; i < 4; i++) expect(await sendEmailCode(address)).toMatchObject({ ok: false, code: "CODE_RESEND_WAIT" });
    const keys = codeSendKeys({ channel: "email", target: address, ipHash: mocks.ipHash, deviceHash: null });
    expect(await counter(keys.targetHour)).toBe(1);
    expect(await counter(keys.targetDay)).toBe(1);
    // The old per-request hourly counter of the address is not charged for real sends any more.
    expect(await counter(`auth:email-otp-send:email:${hmacHash(`email:${address}`)}`)).toBe(0);
  });

  it("a padded or invalid address is refused BEFORE any limit of the real address is charged", async () => {
    const address = email();
    for (const padded of [` ${address}`, `${address} `, "a..b@example.com"]) {
      expect(await sendEmailCode(padded)).toMatchObject({ ok: false, status: 400, code: "INVALID_EMAIL" });
    }
    const keys = codeSendKeys({ channel: "email", target: address, ipHash: mocks.ipHash, deviceHash: null });
    expect(await db.rateLimit.count({ where: { key: { in: [keys.targetDay, keys.targetNext, keys.targetHour] } } })).toBe(0);
    expect(mocks.emails).toHaveLength(0);
    // The owner still gets a code.
    expect(await sendEmailCode(address)).toEqual({ ok: true });
  });

  it("wrong codes are login_failed events, and the 5th wrong try of an email code is login_code_locked", async () => {
    const address = email();
    expect(await sendEmailCode(address)).toEqual({ ok: true });
    const code = mocks.emails[0]?.code ?? "";
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect(await signIn(address, wrong)).toMatchObject({ ok: false });
    const failed = await db.securityEvent.count({ where: { type: "login_failed", createdAt: { gte: startedAt }, meta: { path: ["channel"], equals: "email" } } });
    expect(failed).toBeGreaterThanOrEqual(5);
    const locked = await db.securityEvent.findMany({ where: { type: "login_code_locked", createdAt: { gte: startedAt }, meta: { path: ["channel"], equals: "email" } } });
    expect(locked).toHaveLength(1);
    expect(JSON.stringify(locked)).not.toContain(address);
  });
});

describe("phone codes through the real hooks (SMS route)", () => {
  it("a second text within 60 s is refused with the wait (CODE_RESEND_WAIT)", async () => {
    const number = phone();
    expect(await sendPhoneCode(number)).toEqual({ ok: true });
    expect(await sendPhoneCode(number)).toMatchObject({ ok: false, status: 429, code: "CODE_RESEND_WAIT" });
    expect(mocks.texts).toEqual([number]);
  });

  it("with the SMS budget used up, retries are refused before anything is counted", async () => {
    const number = phone();
    mocks.budgetAvailable = false;
    for (let i = 0; i < 3; i++) expect(await sendPhoneCode(number)).toMatchObject({ ok: false, code: "SMS_PAUSED" });
    const keys = codeSendKeys({ channel: "phone", target: number, ipHash: mocks.ipHash, deviceHash: null });
    expect(await counter(keys.targetDay)).toBe(0);
    expect(mocks.texts).toEqual([]);
  });

  it("a text Twilio refused gives its counts back: an immediate retry is allowed", async () => {
    const number = phone();
    mocks.smsOk = false;
    expect(await sendPhoneCode(number)).toMatchObject({ ok: false, code: "SMS_UNAVAILABLE" });
    const keys = codeSendKeys({ channel: "phone", target: number, ipHash: mocks.ipHash, deviceHash: null });
    expect(await counter(keys.targetDay)).toBe(0);
    mocks.smsOk = true;
    expect(await sendPhoneCode(number)).toEqual({ ok: true });
  });
});
