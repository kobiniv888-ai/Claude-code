import { describe, expect, it } from "vitest";
import { authErrorKey, authFailure, oauthErrorKey, parseActionFailure, phoneOnlyErrorKey, timedActionError } from "./error-codes";

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
    expect(authErrorKey({ code: "SOMETHING_NEW", status: 400 })).toBe("unknown");
    expect(authErrorKey(null)).toBe("unknown");
  });

  it("explains origin checks, server errors and proxy pages instead of 'something went wrong'", () => {
    expect(authErrorKey({ code: "INVALID_ORIGIN", status: 403 })).toBe("origin_rejected");
    expect(authErrorKey({ code: "MISSING_OR_NULL_ORIGIN", status: 403 })).toBe("origin_rejected");
    expect(authErrorKey({ code: "SOMETHING_NEW", status: 500 })).toBe("server_unavailable");
    // An HTML page from the Codespaces forwarder: no JSON code.
    expect(authErrorKey({ status: 502, statusText: "Bad Gateway" })).toBe("server_unavailable");
    expect(authErrorKey({ status: 401, statusText: "Unauthorized" })).toBe("proxy_blocked");
    // better-fetch's catchAllError shape for a failed fetch.
    expect(authErrorKey({ status: 500, statusText: "Fetch Error" })).toBe("network");
  });
});

describe("phoneOnlyErrorKey", () => {
  it("swaps keys that promise Google/Apple when they are not offered", () => {
    expect(phoneOnlyErrorKey("country_not_supported", true)).toBe("country_not_supported_phone_only");
    expect(phoneOnlyErrorKey("sms_unavailable", true)).toBe("sms_unavailable_phone_only");
    expect(phoneOnlyErrorKey("sms_unavailable", false)).toBe("sms_unavailable");
    expect(phoneOnlyErrorKey("invalid_code", true)).toBe("invalid_code");
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

describe("code limits with a wait (SECURITY_REPORT 3.1.c)", () => {
  it("maps our hook codes and keeps the server's wait", () => {
    expect(authFailure({ code: "CODE_RESEND_WAIT", status: 429, retryAfter: 42 })).toEqual({ key: "code_wait", retryAfter: 42 });
    expect(authFailure({ code: "CODE_DAILY_CAP", status: 429, retryAfter: 7200 })).toEqual({ key: "code_daily_cap", retryAfter: 7200 });
    expect(authFailure({ code: "NOT_MOBILE_NUMBER", status: 400 })).toEqual({ key: "not_mobile", retryAfter: null });
    expect(authFailure({ code: "SMS_PAUSED", status: 503 })).toEqual({ key: "sms_paused", retryAfter: null });
    // A wait on any other error is ignored.
    expect(authFailure({ code: "INVALID_OTP", status: 400, retryAfter: 5 })).toEqual({ key: "invalid_code", retryAfter: null });
  });

  it("server actions carry the wait inside the error code", () => {
    expect(timedActionError("code_wait", 119.2)).toBe("code_wait:120");
    expect(parseActionFailure("code_wait:120")).toEqual({ key: "code_wait", retryAfter: 120 });
    expect(parseActionFailure("code_daily_cap:3600")).toEqual({ key: "code_daily_cap", retryAfter: 3600 });
    expect(parseActionFailure("phone_taken")).toEqual({ key: "phone_taken", retryAfter: null });
  });
});
