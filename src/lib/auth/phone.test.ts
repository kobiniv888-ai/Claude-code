import { describe, expect, it } from "vitest";
import {
  checkLoginPhoneNumber,
  formatPhoneInternational,
  isPlaceholderEmail,
  isSmsCountryAllowed,
  placeholderEmailForPhone,
} from "./phone";

describe("checkLoginPhoneNumber", () => {
  it("accepts valid numbers in allowed countries", () => {
    expect(checkLoginPhoneNumber("+995555123456")).toEqual({ ok: true, e164: "+995555123456", country: "GE" });
    expect(checkLoginPhoneNumber("+972502345678")).toMatchObject({ ok: true, country: "IL" });
    expect(checkLoginPhoneNumber("+12015550123")).toMatchObject({ ok: true, country: "US" });
  });

  it("rejects malformed or invalid numbers", () => {
    expect(checkLoginPhoneNumber("995555123456")).toEqual({ ok: false, reason: "invalid" });
    expect(checkLoginPhoneNumber("+995 555 12 34 56")).toEqual({ ok: false, reason: "invalid" });
    expect(checkLoginPhoneNumber("+99512")).toEqual({ ok: false, reason: "invalid" });
    expect(checkLoginPhoneNumber("+995000000000")).toEqual({ ok: false, reason: "invalid" });
    expect(checkLoginPhoneNumber(undefined)).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses countries outside the SMS allow-list (anti SMS-pumping)", () => {
    // Nigeria (+234) is a valid number but not in siteConfig.phone.smsAllowedCountries.
    expect(checkLoginPhoneNumber("+2348031234567")).toEqual({ ok: false, reason: "country_not_supported" });
  });
});

describe("phone helpers", () => {
  it("builds and recognizes placeholder emails", () => {
    expect(placeholderEmailForPhone("+995555123456")).toBe("995555123456@phone.bayit.invalid");
    expect(isPlaceholderEmail("995555123456@phone.bayit.invalid")).toBe(true);
    expect(isPlaceholderEmail("995555123456@PHONE.BAYIT.INVALID")).toBe(true);
    expect(isPlaceholderEmail("someone@gmail.com")).toBe(false);
    expect(isPlaceholderEmail(null)).toBe(false);
  });

  it("checks the SMS allow-list", () => {
    expect(isSmsCountryAllowed("GE")).toBe(true);
    expect(isSmsCountryAllowed("IL")).toBe(true);
    expect(isSmsCountryAllowed("NG")).toBe(false);
    expect(isSmsCountryAllowed(undefined)).toBe(false);
  });

  it("formats numbers for display names", () => {
    expect(formatPhoneInternational("+995555123456")).toBe("+995 555 12 34 56");
    expect(formatPhoneInternational("not a number")).toBe("not a number");
  });
});
