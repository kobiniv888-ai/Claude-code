import { describe, expect, it } from "vitest";
import { isTwoFactorPending, needsTwoFactorSession } from "./two-factor-gate";

describe("needsTwoFactorSession", () => {
  it("gates signing out other devices, social accounts and their tokens", () => {
    for (const path of ["/revoke-other-sessions", "/revoke-sessions", "/revoke-session", "/link-social", "/unlink-account", "/get-access-token", "/list-accounts"]) {
      expect(needsTwoFactorSession(path, {})).toBe(true);
    }
  });

  it("gates a phone number change but not a phone login", () => {
    expect(needsTwoFactorSession("/phone-number/verify", { phoneNumber: "+995555000001", code: "123456", updatePhoneNumber: true })).toBe(true);
    expect(needsTwoFactorSession("/phone-number/verify", { phoneNumber: "+995555000001", code: "123456" })).toBe(false);
    expect(needsTwoFactorSession("/phone-number/verify", null)).toBe(false);
    expect(needsTwoFactorSession("/phone-number/send-otp", { phoneNumber: "+995555000001" })).toBe(false);
  });

  it("leaves reading the session and signing out alone", () => {
    expect(needsTwoFactorSession("/get-session", undefined)).toBe(false);
    expect(needsTwoFactorSession("/sign-out", {})).toBe(false);
  });
});

describe("isTwoFactorPending", () => {
  it("is pending only for accounts with 2-step login before the code was entered", () => {
    expect(isTwoFactorPending({ twoFactorEnabled: true, twoFactorVerifiedAt: null })).toBe(true);
    expect(isTwoFactorPending({ twoFactorEnabled: true, twoFactorVerifiedAt: new Date() })).toBe(false);
    expect(isTwoFactorPending({ twoFactorEnabled: false, twoFactorVerifiedAt: null })).toBe(false);
  });
});
