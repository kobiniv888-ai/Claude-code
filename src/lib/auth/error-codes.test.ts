import { describe, expect, it } from "vitest";
import { authErrorKey, oauthErrorKey } from "./error-codes";

describe("authErrorKey", () => {
  it("maps Better Auth phone-number codes", () => {
    expect(authErrorKey({ code: "INVALID_OTP", status: 400 })).toBe("invalid_code");
    expect(authErrorKey({ code: "OTP_EXPIRED", status: 400 })).toBe("code_expired");
    expect(authErrorKey({ code: "OTP_NOT_FOUND", status: 400 })).toBe("code_expired");
    expect(authErrorKey({ code: "TOO_MANY_ATTEMPTS", status: 403 })).toBe("too_many_attempts");
    expect(authErrorKey({ code: "INVALID_PHONE_NUMBER", status: 400 })).toBe("invalid_phone");
    expect(authErrorKey({ code: "PHONE_NUMBER_EXIST", status: 400 })).toBe("phone_taken");
  });

  it("maps our hook codes and CAPTCHA failures", () => {
    expect(authErrorKey({ code: "RATE_LIMITED", status: 429 })).toBe("rate_limited");
    expect(authErrorKey({ code: "COUNTRY_NOT_SUPPORTED", status: 400 })).toBe("country_not_supported");
    expect(authErrorKey({ code: "ACCOUNT_SUSPENDED", status: 403 })).toBe("account_suspended");
    expect(authErrorKey({ code: "ACCOUNT_BANNED", status: 403 })).toBe("account_banned");
    expect(authErrorKey({ code: "VERIFICATION_FAILED", status: 403 })).toBe("captcha_failed");
    expect(authErrorKey({ code: "SMS_UNAVAILABLE", status: 503 })).toBe("sms_unavailable");
    expect(authErrorKey({ code: "TWO_FACTOR_REQUIRED", status: 403 })).toBe("two_factor_required");
  });

  it("falls back on the status", () => {
    expect(authErrorKey({ status: 429, message: "Too many requests" })).toBe("rate_limited");
    expect(authErrorKey({ status: 0 })).toBe("network");
    expect(authErrorKey({ code: "SOMETHING_NEW", status: 500 })).toBe("unknown");
    expect(authErrorKey(null)).toBe("unknown");
  });
});

describe("oauthErrorKey", () => {
  it("maps our codes and treats the rest as a generic OAuth failure", () => {
    expect(oauthErrorKey("ACCOUNT_BANNED")).toBe("account_banned");
    expect(oauthErrorKey("account_suspended")).toBe("account_suspended");
    expect(oauthErrorKey("state_mismatch")).toBe("oauth_failed");
    expect(oauthErrorKey(null)).toBeNull();
    expect(oauthErrorKey("")).toBeNull();
  });
});
