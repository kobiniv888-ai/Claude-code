import { describe, expect, it } from "vitest";
import { siteConfig } from "@/config/site";
import {
  checkLoginPhoneNumber,
  formatPhoneInternational,
  isPlaceholderEmail,
  isSmsCountryAllowed,
  placeholderEmailForPhone,
} from "./phone";

describe("checkLoginPhoneNumber", () => {
  it("accepts mobile numbers in Israel and Georgia", () => {
    expect(checkLoginPhoneNumber("+995555123456")).toEqual({ ok: true, e164: "+995555123456", country: "GE" });
    expect(checkLoginPhoneNumber("+972502345678")).toMatchObject({ ok: true, country: "IL" });
    expect(checkLoginPhoneNumber("+972500000123")).toMatchObject({ ok: true, country: "IL" });
  });

  it("SMS goes only to Israel (+972) and Georgia (+995): other countries are refused (3.2.a)", () => {
    for (const number of ["+12015550123", "+447911123456", "+79161234567", "+971501234567", "+380501234567"]) {
      expect(checkLoginPhoneNumber(number), number).toEqual({ ok: false, reason: "country_not_supported" });
    }
  });

  it("premium-rate numbers never get a code (they are outside the allow-list too)", () => {
    expect(checkLoginPhoneNumber("+19005550123").ok).toBe(false);
    expect(checkLoginPhoneNumber("+449098790123").ok).toBe(false);
  });

  it("mobile numbers only: landlines in Israel and Georgia are refused (3.2.e)", () => {
    expect(checkLoginPhoneNumber("+995322123456")).toEqual({ ok: false, reason: "not_mobile" });
    expect(checkLoginPhoneNumber("+97221234567")).toEqual({ ok: false, reason: "not_mobile" });
    expect(checkLoginPhoneNumber("+97236123456")).toEqual({ ok: false, reason: "not_mobile" });
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

  it("checks the SMS allow-list: exactly Israel and Georgia", () => {
    expect(isSmsCountryAllowed("GE")).toBe(true);
    expect(isSmsCountryAllowed("IL")).toBe(true);
    for (const country of ["NG", "US", "GB", "RU", "AE", "UA", "TR"]) expect(isSmsCountryAllowed(country), country).toBe(false);
    expect(isSmsCountryAllowed(undefined)).toBe(false);
    expect([...siteConfig.phone.smsAllowedCountries].sort()).toEqual(["GE", "IL"]);
  });

  it("formats numbers for display names", () => {
    expect(formatPhoneInternational("+995555123456")).toBe("+995 555 12 34 56");
    expect(formatPhoneInternational("not a number")).toBe("not a number");
  });
});
