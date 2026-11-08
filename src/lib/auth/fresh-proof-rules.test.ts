import { describe, expect, it } from "vitest";
import {
  FRESH_PROOF_TTL_MS,
  SECURITY_CODE_MAX_ATTEMPTS,
  SECURITY_CODE_TTL_MS,
  decodeSecurityCode,
  encodeSecurityCode,
  freshProofKey,
  isPhoneReplacement,
  isProofFresh,
  maskEmail,
  maskPhone,
  resendWaitSeconds,
  secondsUntilResend,
  securityCodeKey,
} from "./fresh-proof-rules";

/** SECURITY_REPORT 3.6 (fresh code before sensitive changes) and the code rules (decision 3, Q7). */
describe("fresh proof and security codes", () => {
  it("keeps a proof 5 minutes and a code 10 minutes, 5 tries", () => {
    expect(FRESH_PROOF_TTL_MS).toBe(5 * 60 * 1000);
    expect(SECURITY_CODE_TTL_MS).toBe(10 * 60 * 1000);
    expect(SECURITY_CODE_MAX_ATTEMPTS).toBe(5);
    expect(freshProofKey("s1")).toBe("fresh-proof:s1");
    expect(securityCodeKey("u1", "unlock")).toBe("security-code:unlock:u1");
    const now = new Date("2026-11-08T12:00:00Z");
    expect(isProofFresh(new Date(now.getTime() + 1), now)).toBe(true);
    expect(isProofFresh(now, now)).toBe(false);
    expect(isProofFresh(null, now)).toBe(false);
  });

  it("waits 60, 120, 300, then 900 seconds between codes", () => {
    expect([0, 1, 2, 3, 4, 9].map(resendWaitSeconds)).toEqual([0, 60, 120, 300, 900, 900]);
    const t = 1_000_000;
    expect(secondsUntilResend(null, t)).toBe(0);
    expect(secondsUntilResend({ sent: 1, lastSentAt: t }, t + 10_000)).toBe(50);
    expect(secondsUntilResend({ sent: 2, lastSentAt: t }, t + 121_000)).toBe(0);
    expect(secondsUntilResend({ sent: 4, lastSentAt: t }, t + 60_000)).toBe(840);
  });

  it("stores only a hash with the counters, and refuses anything else", () => {
    const state = { hash: "a".repeat(64), attempts: 2, sent: 3, lastSentAt: 1234 };
    expect(decodeSecurityCode(encodeSecurityCode(state))).toEqual(state);
    expect(decodeSecurityCode("123456:0")).toBeNull();
    expect(decodeSecurityCode(`${"a".repeat(64)}:x:1:2`)).toBeNull();
    expect(decodeSecurityCode(null)).toBeNull();
  });

  it("masks the new value in notices", () => {
    expect(maskEmail("dana@example.com")).toBe("da***@example.com");
    expect(maskEmail("d@example.com")).toBe("d***@example.com");
    expect(maskPhone("+972500000000")).toBe("+972 *** ** 00");
    expect(maskPhone("+995555000012")).toBe("+995 *** ** 12");
    expect(maskPhone("12")).toBe("***");
  });

  it("treats only REPLACING a verified number as a sensitive change", () => {
    expect(isPhoneReplacement({ phoneNumber: "+972500000001", phoneNumberVerified: true }, "+972500000002")).toBe(true);
    expect(isPhoneReplacement({ phoneNumber: "+972500000001", phoneNumberVerified: true }, "+972500000001")).toBe(false);
    expect(isPhoneReplacement({ phoneNumber: null, phoneNumberVerified: false }, "+972500000002")).toBe(false);
    expect(isPhoneReplacement({ phoneNumber: "+972500000001", phoneNumberVerified: false }, "+972500000002")).toBe(false);
  });
});
