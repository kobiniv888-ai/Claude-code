/**
 * Phone codes at rest and their check (SECURITY_REPORT 3.1.a, 3.1.b): keyed hash only, constant-time
 * compare, single use, dead after 5 wrong tries, atomic under parallel guesses. Pure unit tests
 * with an in-memory store that behaves like Better Auth's atomic `consumeVerificationValue`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const events = vi.hoisted(() => ({ record: vi.fn(async () => true) }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/security/events", () => ({ recordSecurityEvent: events.record }));

const { checkPhoneCode, hashPhoneCodeRow, phoneCodeDigest, phoneOtpIdentifier } = await import("./phone-code");

const PHONE = "+972500000123";
const ID = phoneOtpIdentifier(PHONE);

/** One row per identifier; `consume` takes it atomically (later callers get null). */
function memoryStore(value: string, expiresAt = new Date(Date.now() + 600_000)) {
  const rows = new Map<string, { value: string; expiresAt: Date }>([[ID, { value, expiresAt }]]);
  return {
    rows,
    consumeVerificationValue: async (identifier: string) => {
      const row = rows.get(identifier) ?? null;
      rows.delete(identifier);
      // Let parallel callers interleave like real requests.
      await new Promise((resolve) => setTimeout(resolve, 1));
      return row;
    },
    createVerificationValue: async (data: { identifier: string; value: string; expiresAt: Date }) => {
      rows.set(data.identifier, { value: data.value, expiresAt: data.expiresAt });
      return data;
    },
  };
}

const stored = (code: string, attempts = 0) => hashPhoneCodeRow({ identifier: ID, value: `${code}:${attempts}` })!;

beforeEach(() => events.record.mockClear());

describe("hashPhoneCodeRow (the verification.create.before hook)", () => {
  it("replaces a plain phone code with a keyed hash bound to the number", () => {
    const value = hashPhoneCodeRow({ identifier: ID, value: "482913:0" });
    expect(value).toMatch(/^[0-9a-f]{64}:0$/);
    expect(value).not.toContain("482913");
    expect(value!.split(":")[0]).toBe(phoneCodeDigest(PHONE, "482913"));
    // Bound to the number: the same code for another number hashes differently.
    expect(phoneCodeDigest("+995555000123", "482913")).not.toBe(phoneCodeDigest(PHONE, "482913"));
  });

  it("leaves every other row alone", () => {
    expect(hashPhoneCodeRow({ identifier: "sign-in-otp-a@example.com", value: "abc:0" })).toBeNull();
    expect(hashPhoneCodeRow({ identifier: "totp-last:user1", value: "123456:0" })).toBeNull();
    expect(hashPhoneCodeRow({ identifier: ID, value: `${"a".repeat(64)}:2` })).toBeNull();
  });
});

describe("checkPhoneCode", () => {
  it("accepts the right code once (single use)", async () => {
    const store = memoryStore(stored("482913"));
    await expect(checkPhoneCode(store, PHONE, "482913")).resolves.toBe(true);
    expect(store.rows.has(ID)).toBe(false);
    await expect(checkPhoneCode(store, PHONE, "482913")).resolves.toBe(false);
  });

  it("counts wrong tries and kills the code at the 5th; then even the right code fails", async () => {
    const store = memoryStore(stored("482913"));
    for (let i = 1; i <= 4; i++) {
      await expect(checkPhoneCode(store, PHONE, "000000"), `try ${i}`).resolves.toBe(false);
      expect(store.rows.get(ID)!.value.endsWith(`:${i}`)).toBe(true);
    }
    await expect(checkPhoneCode(store, PHONE, "000000", { country: "IL" })).rejects.toMatchObject({ body: { code: "TOO_MANY_ATTEMPTS" } });
    expect(events.record).toHaveBeenCalledWith({ type: "login_code_locked", meta: { channel: "sms", country: "IL" } });
    await expect(checkPhoneCode(store, PHONE, "482913")).rejects.toMatchObject({ body: { code: "TOO_MANY_ATTEMPTS" } });
  });

  it("10 parallel wrong guesses count at most 5 attempts (atomic)", async () => {
    const store = memoryStore(stored("482913"));
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => checkPhoneCode(store, PHONE, "111111")));
    const row = store.rows.get(ID);
    const attempts = row ? Number(row.value.split(":")[1]) : 0;
    expect(attempts).toBeLessThanOrEqual(5);
    expect(results.every((r) => r.status === "rejected" || r.value === false)).toBe(true);
  });

  it("an expired code fails", async () => {
    const store = memoryStore(stored("482913"), new Date(Date.now() - 1000));
    await expect(checkPhoneCode(store, PHONE, "482913")).rejects.toMatchObject({ body: { code: "OTP_EXPIRED" } });
  });

  it("a plain-text row (from before this rule) is never accepted", async () => {
    const store = memoryStore("482913:0");
    await expect(checkPhoneCode(store, PHONE, "482913")).rejects.toMatchObject({ body: { code: "OTP_EXPIRED" } });
  });

  it("no code for the number: false", async () => {
    const store = memoryStore(stored("482913"));
    await expect(checkPhoneCode(store, "+995555000123", "482913")).resolves.toBe(false);
  });

  it("only 6 digits are compared", async () => {
    const store = memoryStore(stored("482913"));
    await expect(checkPhoneCode(store, PHONE, "482913 ")).resolves.toBe(false);
  });
});
