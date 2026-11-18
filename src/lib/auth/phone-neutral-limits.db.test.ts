/**
 * S2 review FC-1 (SECURITY_REPORT 3.1.d, founder's answer (5)): the neutral phone-check send (a
 * number another account holds: no text) must meet the SAME per-source SMS share (6 a day) and
 * brake (3 codes nobody entered) as a real text. Otherwise a braked source got "rate_limited" for a
 * free number and "sent" for a taken one, which told which numbers have an account.
 *
 * The real phone-check action, the real Better Auth plugin and our hooks (./server.ts), the real
 * brakes (./sms-guard.ts) against the local database, with Twilio mocked (SMS route) and the daily
 * budget on a counter of its own (the shared budget is never touched). Fake numbers and
 * @example.com accounts only; every row is removed afterwards.
 */
import "dotenv/config";
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const run = randomUUID().slice(0, 8);
const mocks = vi.hoisted(() => ({
  ipHash: "",
  budgetKey: "",
  texts: [] as string[],
  user: null as null | Record<string, unknown>,
}));
mocks.ipHash = `vitest-neutral-${run}`;
mocks.budgetKey = `sms:budget:vitest-neutral-${run}`;

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3000" }) }));
vi.mock("@/lib/request", () => ({
  getIpHash: async () => mocks.ipHash,
  getDeviceHash: async () => null,
  getClientIp: async () => null,
  getCountryCode: async () => null,
  getUserAgent: async () => null,
}));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: async () => true }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (_key: string, values?: { code?: string }) => `code ${values?.code ?? ""}` }));
vi.mock("@/lib/sms", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/sms")>();
  return {
    ...original,
    isSmsConfigured: () => true,
    sendSms: async (input: { to: string }) => {
      mocks.texts.push(input.to);
      return { ok: true, delivered: false };
    },
  };
});
// The real brakes and shares; only the daily budget counter is this file's own.
vi.mock("./sms-guard", async (importOriginal) => {
  const original = await importOriginal<typeof import("./sms-guard")>();
  return {
    ...original,
    smsPausedFor: async () => false,
    smsBudgetAvailable: (trusted: boolean) => original.smsBudgetAvailable(trusted, { budgetKey: mocks.budgetKey }),
    reserveSmsSend: (source: Parameters<typeof original.reserveSmsSend>[0]) => original.reserveSmsSend(source, { budgetKey: mocks.budgetKey }),
    releaseSmsSend: (source: Parameters<typeof original.releaseSmsSend>[0]) => original.releaseSmsSend(source, { budgetKey: mocks.budgetKey }),
    recordSmsCodeSent: async () => {},
  };
});
vi.mock("./session", () => ({
  requireUserForAction: async () => {
    if (!mocks.user) throw new Error("no user");
    return mocks.user;
  },
}));
// Where the check happens is not what this file tests (phone-check-actions.test.ts does).
vi.mock("./phone-check-policy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./phone-check-policy")>()),
  phoneCheckAllowedAt: () => true,
}));

process.env.SITE_ENV = "development";
process.env.AUTH_TEST_MODE = "true";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.NEUTRAL_SEND_DELAY = "0";

const { sendPhoneCheckCode } = await import("./phone-check-actions");
const { db } = await import("@/lib/db");
const { codeSendKeys } = await import("./login-rate-limit");
const { SMS_SOURCE_LIMITS } = await import("./sms-guard");

const userIds: string[] = [];
const phones: string[] = [];
const startedAt = new Date();
/** Fake Georgian mobile numbers (+995 555 …), one range of 1000 each. */
const phone = () => {
  const number = `+995555${String(randomInt(1000)).padStart(3, "0")}${String(phones.length).padStart(3, "0")}`;
  phones.push(number);
  return number;
};

async function fakeUser(name: string, phoneNumber: string | null = null) {
  const id = `vitest-neutral-${run}-${name}`;
  userIds.push(id);
  await db.user.create({
    data: { id, name: "", email: `${id}@example.com`, emailVerified: true, ...(phoneNumber ? { phoneNumber, phoneNumberVerified: true } : {}) },
  });
  return id;
}

/** Signs in as `id` (the action's session check is mocked; everything after it is real). */
function signInAs(id: string) {
  mocks.user = {
    id,
    sessionId: `${id}-session`,
    email: `${id}@example.com`,
    emailIsPlaceholder: false,
    phoneNumber: null,
    phoneNumberVerified: false,
    twoFactorVerified: true,
  };
}

async function setCounter(key: string, count: number) {
  const resetAt = new Date(Date.now() + 24 * 3600 * 1000);
  await db.rateLimit.upsert({ where: { key }, create: { key, count, resetAt }, update: { count, resetAt } });
}

/** The resend wait of a number is over (as if the person waited). */
async function waitOutResend(number: string) {
  const { targetNext } = codeSendKeys({ channel: "phone", target: number, ipHash: mocks.ipHash, deviceHash: null });
  await db.rateLimit.updateMany({ where: { key: targetNext }, data: { resetAt: new Date(0) } });
}

/** The answer with the number itself taken out (the two numbers differ by design). */
const shape = (result: unknown, number: string) => JSON.stringify(result).replaceAll(number, "<number>");
const ask = (number: string) => sendPhoneCheckCode({ phoneNumber: number, place: "account" });

beforeEach(() => {
  mocks.texts = [];
});

afterAll(async () => {
  const codeKeys = phones.flatMap((number) => Object.values(codeSendKeys({ channel: "phone", target: number, ipHash: mocks.ipHash, deviceHash: null })));
  await db.rateLimit.deleteMany({
    where: {
      OR: [
        { key: { in: codeKeys.filter((key): key is string => !!key) } },
        { key: { contains: mocks.ipHash } },
        { key: mocks.budgetKey },
        ...userIds.map((id) => ({ key: { contains: id } })),
      ],
    },
  });
  await db.verification.deleteMany({ where: { OR: phones.map((number) => ({ identifier: { contains: number } })) } });
  await db.securityEvent.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { type: "rate_limited", createdAt: { gte: startedAt } }] } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe("the neutral phone-check send meets the same SMS brakes (FC-1)", () => {
  it("a braked source (3 unconfirmed codes) gets byte-identical answers for a free and a taken number", async () => {
    const taken = phone();
    await fakeUser("holder-a", taken);
    const asker = await fakeUser("asker-a");
    signInAs(asker);
    await setCounter(`sms:unconfirmed:user:${asker}`, SMS_SOURCE_LIMITS.unconfirmedMax);

    const free = phone();
    const freeAnswer = await ask(free);
    const takenAnswer = await ask(taken);
    expect(freeAnswer).toEqual({ ok: false, error: "rate_limited" });
    expect(JSON.stringify(takenAnswer)).toBe(JSON.stringify(freeAnswer));
    expect(mocks.texts).toEqual([]);
  });

  it("a source over its daily share (6 texts) gets byte-identical answers for a free and a taken number", async () => {
    const taken = phone();
    await fakeUser("holder-b", taken);
    const asker = await fakeUser("asker-b");
    signInAs(asker);
    await setCounter(`sms:share:user:${asker}`, SMS_SOURCE_LIMITS.sharePerSource);

    const freeAnswer = await ask(phone());
    const takenAnswer = await ask(taken);
    expect(freeAnswer).toEqual({ ok: false, error: "rate_limited" });
    expect(JSON.stringify(takenAnswer)).toBe(JSON.stringify(freeAnswer));
  });

  it("4 requests for one taken number (waits respected) answer like 4 for one free number: the brake engages on the 4th", async () => {
    const taken = phone();
    await fakeUser("holder-c", taken);
    const free = phone();

    const answers = async (asker: string, number: string) => {
      signInAs(asker);
      const out: string[] = [];
      for (let i = 0; i < 4; i++) {
        out.push(shape(await ask(number), number));
        await waitOutResend(number);
      }
      return out;
    };
    const forTaken = await answers(await fakeUser("asker-c1"), taken);
    const forFree = await answers(await fakeUser("asker-c2"), free);
    expect(forTaken).toEqual(forFree);
    expect(forFree.slice(0, 3).every((answer) => answer.includes('"status":"sent"'))).toBe(true);
    expect(JSON.parse(forFree[3]!)).toEqual({ ok: false, error: "rate_limited" });
    // Only the free number got texts; the taken number's owner was never texted.
    expect(mocks.texts).toEqual([free, free, free]);
  });
});
