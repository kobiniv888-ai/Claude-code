import { describe, expect, it } from "vitest";
import { isPhoneAlreadyVerified, phoneCheckStep, verifiedPhoneOf } from "./phone-once";

const PHONE = "+972501234567";

describe("once per number", () => {
  it("never sends a code to a number the account already verified", () => {
    const account = { phoneNumber: PHONE, phoneNumberVerified: true };
    expect(isPhoneAlreadyVerified(account, PHONE)).toBe(true);
    expect(phoneCheckStep(account, PHONE, { usedByAnotherAccount: false })).toBe("already_verified");
  });

  it("sends a code for a new number, or for the account's number while it is unverified", () => {
    expect(phoneCheckStep({ phoneNumber: null, phoneNumberVerified: false }, PHONE, { usedByAnotherAccount: false })).toBe("send");
    expect(phoneCheckStep({ phoneNumber: PHONE, phoneNumberVerified: false }, PHONE, { usedByAnotherAccount: false })).toBe("send");
    expect(phoneCheckStep({ phoneNumber: PHONE, phoneNumberVerified: null }, PHONE, { usedByAnotherAccount: false })).toBe("send");
    // A different number than the verified one (the person chose "use a different number").
    expect(phoneCheckStep({ phoneNumber: PHONE, phoneNumberVerified: true }, "+995555123456", { usedByAnotherAccount: false })).toBe("send");
  });

  it("does not waste an SMS on a number another account already has", () => {
    expect(phoneCheckStep({ phoneNumber: null, phoneNumberVerified: false }, PHONE, { usedByAnotherAccount: true })).toBe("phone_taken");
  });

  it("reports the verified number", () => {
    expect(verifiedPhoneOf({ phoneNumber: PHONE, phoneNumberVerified: true })).toBe(PHONE);
    expect(verifiedPhoneOf({ phoneNumber: PHONE, phoneNumberVerified: false })).toBeNull();
    expect(verifiedPhoneOf({ phoneNumber: null, phoneNumberVerified: true })).toBeNull();
  });
});
