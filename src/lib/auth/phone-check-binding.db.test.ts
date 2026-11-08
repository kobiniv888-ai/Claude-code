/**
 * A phone-check code works only in the session that asked for it (SECURITY_REPORT 3.6.a, 3.5.e),
 * against the local database with the REAL Better Auth phone plugin, our hooks, the real
 * phone-check actions, the real fresh proof and the real "phone changed" side effects (other
 * sessions end). Test mode, codes on screen (no SMS). Fake accounts and numbers only; every row
 * is removed afterwards.
 *
 * The attack this stops: with a stolen session of V (verified phone M), the attacker asks for a
 * code to his own number N from his own account A (no verified phone, so no fresh proof needed),
 * then confirms it in V's session — V's verified phone became N, and V's real sessions ended.
 */
import "dotenv/config";
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const ipHash = `vitest-phone-bind-${randomUUID()}`;
const state = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000" }),
  cookies: async () => ({ get: () => undefined, set: () => undefined }),
}));
vi.mock("@/lib/request", () => ({
  getIpHash: async () => ipHash,
  getDeviceHash: async () => null,
  getClientIp: async () => null,
  getCountryCode: async () => null,
  getUserAgent: async () => null,
}));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: async () => true }));
vi.mock("@/lib/auth/session", () => ({ requireUserForAction: async () => state.current }));
vi.mock("@/lib/email", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/email")>();
  return { ...original, sendEmail: vi.fn(async () => ({ ok: true, delivery: "logged" })) };
});

process.env.SITE_ENV = "development";
process.env.AUTH_TEST_MODE = "true";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
process.env.BETTER_AUTH_URL = "http://localhost:3000";

const { db } = await import("@/lib/db");
const { sendPhoneCheckCode, confirmPhoneCheckCode } = await import("@/lib/auth/phone-check-actions");
const { phoneOtpIdentifier } = await import("@/lib/auth/phone-code");
const { markFreshProof } = await import("@/lib/auth/fresh-proof");
const { freshProofKey } = await import("@/lib/auth/fresh-proof-rules");

const tag = randomInt(1e9);
const fakeNumber = (prefix: string) => `+9725000${prefix}${String(randomInt(10_000)).padStart(4, "0")}`;
const M = fakeNumber("1"); // V's verified number
const N = fakeNumber("2"); // the attacker's number
const N2 = fakeNumber("3"); // V's own new number (the honest replacement)
const A = { id: `pbind-a-${tag}`, sessionId: `pbind-sa-${tag}` };
const V = { id: `pbind-v-${tag}`, sessionId: `pbind-sv-${tag}`, otherSessionId: `pbind-sv2-${tag}` };

const asA = () => ({ id: A.id, sessionId: A.sessionId, phoneNumber: null, phoneNumberVerified: false });
const asV = async () => {
  const row = await db.user.findUniqueOrThrow({ where: { id: V.id }, select: { phoneNumber: true, phoneNumberVerified: true } });
  return { id: V.id, sessionId: V.sessionId, phoneNumber: row.phoneNumber, phoneNumberVerified: row.phoneNumberVerified };
};
const vPhone = async () => db.user.findUniqueOrThrow({ where: { id: V.id }, select: { phoneNumber: true, phoneNumberVerified: true } });
const vSessions = async () => (await db.session.findMany({ where: { userId: V.id }, select: { id: true } })).map((s) => s.id).sort();

beforeAll(async () => {
  await db.user.create({ data: { id: A.id, name: "", email: `pbind-a-${tag}@example.com`, emailVerified: true } });
  await db.user.create({
    data: { id: V.id, name: "", email: `pbind-v-${tag}@example.com`, emailVerified: true, phoneNumber: M, phoneNumberVerified: true },
  });
  const expiresAt = new Date(Date.now() + 86_400_000);
  for (const [id, userId] of [[A.sessionId, A.id], [V.sessionId, V.id], [V.otherSessionId, V.id]] as const) {
    await db.session.create({ data: { id, userId, token: `pbind-token-${id}`, expiresAt } });
  }
});

afterAll(async () => {
  await db.verification.deleteMany({
    where: {
      OR: [
        { identifier: { in: [N, N2, M].map(phoneOtpIdentifier) } },
        { identifier: { in: [A.sessionId, V.sessionId, V.otherSessionId].map(freshProofKey) } },
        { identifier: { startsWith: "phone-check:pbind-" } },
      ],
    },
  });
  await db.rateLimit.deleteMany({ where: { OR: [{ key: { contains: ipHash } }, { key: { contains: A.id } }, { key: { contains: V.id } }] } });
  await db.securityEvent.deleteMany({ where: { userId: { in: [A.id, V.id] } } });
  await db.session.deleteMany({ where: { userId: { in: [A.id, V.id] } } });
  await db.user.deleteMany({ where: { id: { in: [A.id, V.id] } } });
  await db.$disconnect();
});

describe("a phone-check code is bound to the session that asked for it", () => {
  it("V's session cannot ask for a code to replace its verified phone without a fresh proof", async () => {
    state.current = await asV();
    expect(await sendPhoneCheckCode({ phoneNumber: N, place: "account" })).toMatchObject({ ok: false });
    expect(await sendPhoneCheckCode({ phoneNumber: N, place: "post", postStepToken: null })).toMatchObject({ ok: false });
  });

  it("a code account A asked for cannot be confirmed in V's session: V's phone and V's other sessions stay", async () => {
    state.current = asA();
    const { issuePostPhoneStepToken } = await import("@/lib/auth/phone-check-token");
    const sent = await sendPhoneCheckCode({ phoneNumber: N, place: "post", postStepToken: issuePostPhoneStepToken(A.id) });
    expect(sent).toMatchObject({ ok: true, data: { status: "sent" } });
    const code = (sent as { data: { screenCode: string } }).data.screenCode;
    expect(code).toMatch(/^\d{6}$/);

    state.current = await asV();
    expect(await confirmPhoneCheckCode({ phoneNumber: N, code })).toEqual({ ok: false, error: "code_expired" });
    expect(await vPhone()).toEqual({ phoneNumber: M, phoneNumberVerified: true });
    expect(await vSessions()).toEqual([V.sessionId, V.otherSessionId].sort());

    // The refused attempt did not touch A's code: A can still use it.
    state.current = asA();
    expect(await confirmPhoneCheckCode({ phoneNumber: N, code })).toEqual({ ok: true, data: { phoneNumber: N } });
    expect((await db.user.findUniqueOrThrow({ where: { id: A.id }, select: { phoneNumber: true } })).phoneNumber).toBe(N);
  });

  it("the owner's own replacement (fresh proof, same session) works and ends the other sessions", async () => {
    await markFreshProof(V.sessionId, "email_code");
    state.current = await asV();
    const sent = await sendPhoneCheckCode({ phoneNumber: N2, place: "post", postStepToken: null });
    // V has no listing and no post-step token: the account page is for hosts only, so use a listing.
    expect(sent).toMatchObject({ ok: false, error: "phone_check_not_here" });
    const { issuePostPhoneStepToken } = await import("@/lib/auth/phone-check-token");
    const sentOk = await sendPhoneCheckCode({ phoneNumber: N2, place: "post", postStepToken: issuePostPhoneStepToken(V.id) });
    expect(sentOk).toMatchObject({ ok: true, data: { status: "sent" } });
    const code = (sentOk as { data: { screenCode: string } }).data.screenCode;

    expect(await confirmPhoneCheckCode({ phoneNumber: N2, code })).toEqual({ ok: true, data: { phoneNumber: N2 } });
    expect(await vPhone()).toEqual({ phoneNumber: N2, phoneNumberVerified: true });
    // afterPhoneChanged: every OTHER session of V ended; the fresh proof was used up.
    expect(await vSessions()).toEqual([V.sessionId]);
    expect(await db.verification.count({ where: { identifier: freshProofKey(V.sessionId) } })).toBe(0);
  });
});
