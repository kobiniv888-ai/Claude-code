/**
 * Email codes through the real Better Auth email-OTP plugin, against the local database
 * (SECURITY_REPORT 3.1.a, 3.1.d): only our keyed hash is stored, and the answer is byte-identical
 * whether or not an account exists. Test mode (codes on screen, no email service); @example.com
 * addresses only; every row it writes is removed afterwards.
 */
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

const ipHash = `vitest-email-code-${randomUUID()}`;
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
delete process.env.RESEND_API_KEY;

const { auth } = await import("./server");
const { db } = await import("@/lib/db");
const { emailCodeKey, readScreenCode } = await import("./sms");

const headers = new Headers({ host: "localhost:3000" });
const run = randomUUID().slice(0, 8);
const KNOWN = `vitest-known-${run}@example.com`;
const UNKNOWN = `vitest-unknown-${run}@example.com`;
const startedAt = new Date();
let userId: string | null = null;

afterAll(async () => {
  await db.verification.deleteMany({ where: { identifier: { in: [`sign-in-otp-${KNOWN}`, `sign-in-otp-${UNKNOWN}`] } } });
  await db.emailOutbox.deleteMany({ where: { to: { in: [KNOWN, UNKNOWN] }, createdAt: { gte: startedAt } } }).catch(() => null);
  if (userId) await db.user.delete({ where: { id: userId } }).catch(() => null);
  await db.rateLimit.deleteMany({ where: { key: { contains: ipHash } } });
  await db.$disconnect();
});

const send = (email: string) => auth.api.sendVerificationOTP({ body: { email, type: "sign-in" }, headers });

describe("email codes", () => {
  it("the same answer whether or not an account exists", async () => {
    const user = await db.user.create({
      data: { id: `vitest-${run}`, email: KNOWN, name: "", emailVerified: true },
      select: { id: true },
    });
    userId = user.id;
    const known = await send(KNOWN);
    const unknown = await send(UNKNOWN);
    expect(JSON.stringify(known)).toBe(JSON.stringify(unknown));
  });

  it("only a keyed hash of the code is stored (not the code, not a plain SHA-256)", async () => {
    const code = readScreenCode(emailCodeKey(UNKNOWN), "test");
    expect(code).toMatch(/^\d{6}$/);
    const row = await db.verification.findFirst({ where: { identifier: `sign-in-otp-${UNKNOWN}` }, orderBy: { createdAt: "desc" } });
    expect(row?.value).toMatch(/^[0-9a-f]{64}:0$/);
    expect(row!.value).not.toContain(code!);
    const plainSha = createHash("sha256").update(code!).digest("base64url");
    expect(row!.value).not.toContain(plainSha);
  });
});
