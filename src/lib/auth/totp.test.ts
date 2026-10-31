import { describe, expect, it } from "vitest";
import * as OTPAuth from "otpauth";
import { generateTotpSecret, matchingCounter, totpUri } from "./totp";

const secret = new OTPAuth.Secret({ size: 20 });
const totp = new OTPAuth.TOTP({ secret, digits: 6, period: 30, algorithm: "SHA1" });
const now = Date.UTC(2026, 9, 31, 12, 0, 0);

describe("matchingCounter", () => {
  it("accepts the current code and returns its time step", () => {
    const code = totp.generate({ timestamp: now });
    expect(matchingCounter(secret.base32, code, now)).toBe(OTPAuth.TOTP.counter({ timestamp: now }));
  });

  it("accepts the previous and the next code (clock drift)", () => {
    const previous = totp.generate({ timestamp: now - 30_000 });
    const next = totp.generate({ timestamp: now + 30_000 });
    const counter = OTPAuth.TOTP.counter({ timestamp: now });
    expect(matchingCounter(secret.base32, previous, now)).toBe(counter - 1);
    expect(matchingCounter(secret.base32, next, now)).toBe(counter + 1);
  });

  it("rejects old codes, wrong codes and malformed input", () => {
    const old = totp.generate({ timestamp: now - 5 * 60_000 });
    expect(matchingCounter(secret.base32, old, now)).toBeNull();
    const code = totp.generate({ timestamp: now });
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
    expect(matchingCounter(secret.base32, wrong, now)).toBeNull();
    expect(matchingCounter(secret.base32, "12345", now)).toBeNull();
    expect(matchingCounter(secret.base32, "abcdef", now)).toBeNull();
  });
});

describe("secrets and URIs", () => {
  it("creates 160-bit base32 secrets", () => {
    const a = generateTotpSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateTotpSecret()).not.toBe(a);
  });

  it("builds an otpauth URI with the site name as issuer", () => {
    const uri = totpUri(secret.base32, "+995 555 12 34 56");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("issuer=Bayit");
    expect(uri).toContain(`secret=${secret.base32}`);
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});
