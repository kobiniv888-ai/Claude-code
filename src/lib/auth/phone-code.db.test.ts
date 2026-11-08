/**
 * The real Better Auth phone-number plugin + our hooks, against the local database (SECURITY_REPORT
 * 3.1.a/b, the report's "DB test: no Verification.value matches ^\d{6}:"). Test mode (codes on
 * screen) so no SMS goes anywhere. A fake test number; every row it writes is removed afterwards.
 */
import "dotenv/config";
import { randomInt } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const ipHash = `vitest-phone-code-${randomInt(1e9)}`;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/request", () => ({
  getIpHash: async () => ipHash,
  getDeviceHash: async () => null,
  getClientIp: async () => null,
}));

process.env.SITE_ENV = "development";
process.env.AUTH_TEST_MODE = "true";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
process.env.BETTER_AUTH_URL = "http://localhost:3000";

const { auth } = await import("./server");
const { db } = await import("@/lib/db");
const { phoneOtpIdentifier } = await import("./phone-code");
const { phoneCodeKey, readScreenCode } = await import("./sms");

// +972 50 000 xxxx: a fake test number.
const PHONE = `+97250000${String(randomInt(10_000)).padStart(4, "0")}`;
const headers = new Headers({ host: "localhost:3000" });
const startedAt = new Date();

async function sendCode() {
  await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: PHONE }, headers });
  const code = readScreenCode(phoneCodeKey(PHONE), "test");
  expect(code).toMatch(/^\d{6}$/);
  return code!;
}

const consume = (code: string) => auth.api.consumePhoneNumberOTP({ body: { phoneNumber: PHONE, code }, headers });
const wrong = (code: string) => (code === "000000" ? "111111" : "000000");
const rows = () => db.verification.findMany({ where: { identifier: phoneOtpIdentifier(PHONE) }, select: { value: true } });

beforeAll(async () => {
  await db.verification.deleteMany({ where: { identifier: phoneOtpIdentifier(PHONE) } });
});

afterAll(async () => {
  await db.verification.deleteMany({ where: { identifier: phoneOtpIdentifier(PHONE) } });
  await db.rateLimit.deleteMany({ where: { key: { contains: ipHash } } });
  await db.$disconnect();
});

describe("phone codes in the database", () => {
  it("are stored only as a keyed hash, never the 6 digits", async () => {
    const code = await sendCode();
    const stored = await rows();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.value).toMatch(/^[0-9a-f]{64}:0$/);
    expect(stored[0]!.value).not.toContain(code);
    const plain = await db.verification.count({
      where: { identifier: { startsWith: "phone-number-otp-" }, createdAt: { gte: startedAt }, value: { contains: code } },
    });
    expect(plain).toBe(0);
  });

  it("a wrong code is refused and counted; the right one works once", async () => {
    const code = await sendCode();
    await expect(consume(wrong(code))).rejects.toMatchObject({ body: { code: "INVALID_OTP" } });
    expect((await rows())[0]!.value).toMatch(/:1$/);
    await expect(consume(code)).resolves.toMatchObject({ status: true });
    // Single use.
    await expect(consume(code)).rejects.toBeTruthy();
  });

  it("10 parallel wrong guesses count at most 5 attempts, and the code is then dead", async () => {
    const code = await sendCode();
    await Promise.allSettled(Array.from({ length: 10 }, () => consume(wrong(code))));
    const left = await rows();
    const attempts = left.length ? Number(left[0]!.value.split(":")[1]) : 0;
    expect(attempts).toBeLessThanOrEqual(5);
    // Wrong guesses until it dies, then the right code no longer works.
    for (let i = attempts; i < 5; i++) await consume(wrong(code)).catch(() => null);
    await expect(consume(code)).rejects.toBeTruthy();
  });
});
