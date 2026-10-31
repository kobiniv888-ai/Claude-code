import { describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";

vi.mock("server-only", () => ({}));

process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.HASH_SALT = "test-salt";

const { decrypt, decryptString, encrypt, encryptString, hmacHash, randomToken, safeEqual } = await import("./crypto");

describe("encrypt / decrypt", () => {
  it("round-trips binary data", () => {
    const data = randomBytes(5000);
    expect(decrypt(encrypt(data)).equals(data)).toBe(true);
  });

  it("round-trips text, including Hebrew and Georgian", () => {
    expect(decryptString(encryptString("JBSWY3DPEHPK3PXP שלום გამარჯობა"))).toBe("JBSWY3DPEHPK3PXP שלום გამარჯობა");
  });

  it("uses a fresh IV every time (iv + tag + ciphertext)", () => {
    const a = encrypt("same");
    const b = encrypt("same");
    expect(a.equals(b)).toBe(false);
    expect(a.length).toBe(12 + 16 + 4);
  });

  it("rejects tampered data", () => {
    const sealed = encrypt("secret document");
    sealed[sealed.length - 1] ^= 0xff;
    expect(() => decrypt(sealed)).toThrow();
    expect(() => decrypt(Buffer.alloc(10))).toThrow(/too short/);
  });
});

describe("hmacHash", () => {
  it("is stable, hex and depends on the input", () => {
    const hash = hmacHash("203.0.113.7");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hmacHash("203.0.113.7")).toBe(hash);
    expect(hmacHash("203.0.113.8")).not.toBe(hash);
  });
});

describe("randomToken / safeEqual", () => {
  it("makes URL-safe tokens of the requested size", () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken(16)).toHaveLength(22);
    expect(randomToken()).not.toBe(randomToken());
  });

  it("compares in constant time", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
