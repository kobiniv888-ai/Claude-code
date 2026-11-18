import { describe, expect, it } from "vitest";
import { ICAL_TOKEN_BYTES, isStrongIcalToken, newIcalToken } from "./ical-token";

describe("calendar export tokens (SECURITY_REPORT 4.7.b, D3)", () => {
  it("are 256-bit, URL-safe and different every time", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newIcalToken()));
    expect(tokens.size).toBe(200);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, "base64url")).toHaveLength(ICAL_TOKEN_BYTES);
      expect(isStrongIcalToken(token)).toBe(true);
    }
  });

  it("tells old cuid tokens (time-based, guessable prefix) from strong ones", () => {
    expect(isStrongIcalToken("cmvwbte0a0001abcdxyz12345")).toBe(false);
    expect(isStrongIcalToken("")).toBe(false);
    expect(isStrongIcalToken(null)).toBe(false);
    expect(isStrongIcalToken(`${newIcalToken()}x`)).toBe(false);
  });
});
