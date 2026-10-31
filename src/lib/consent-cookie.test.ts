import { describe, expect, it } from "vitest";
import {
  ALL_CONSENT,
  CONSENT_MAX_AGE_SECONDS,
  NECESSARY_ONLY,
  consentCookieString,
  makeConsent,
  parseConsent,
  readCookie,
  serializeConsent,
} from "./consent-cookie";

describe("consent cookie", () => {
  it("round-trips a choice", () => {
    const consent = makeConsent({ preferences: true, analytics: false });
    expect(parseConsent(serializeConsent(consent))).toEqual({
      necessary: true,
      preferences: true,
      analytics: false,
      v: 1,
    });
  });

  it("accepts an already-decoded value (as Next.js cookies() returns it)", () => {
    expect(parseConsent(JSON.stringify(ALL_CONSENT))).toEqual(ALL_CONSENT);
  });

  it("rejects missing, malformed and old-version values", () => {
    expect(parseConsent(undefined)).toBeNull();
    expect(parseConsent("")).toBeNull();
    expect(parseConsent("not-json")).toBeNull();
    expect(parseConsent("%E0%A4%A")).toBeNull();
    expect(parseConsent(JSON.stringify({ ...ALL_CONSENT, v: 0 }))).toBeNull();
    expect(parseConsent(JSON.stringify({ v: 1, preferences: "yes", analytics: false }))).toBeNull();
    expect(parseConsent("null")).toBeNull();
  });

  it("always keeps necessary on", () => {
    const parsed = parseConsent(JSON.stringify({ necessary: false, preferences: false, analytics: false, v: 1 }));
    expect(parsed).toEqual(NECESSARY_ONLY);
  });

  it("builds a cookie string for 180 days", () => {
    const value = consentCookieString(NECESSARY_ONLY, { secure: true });
    expect(value).toMatch(/^bayit_consent=%7B/);
    expect(value).toContain(`Max-Age=${CONSENT_MAX_AGE_SECONDS}`);
    expect(CONSENT_MAX_AGE_SECONDS).toBe(15_552_000);
    expect(value).toContain("Path=/");
    expect(value).toContain("SameSite=Lax");
    expect(value.endsWith("; Secure")).toBe(true);
    expect(consentCookieString(NECESSARY_ONLY, { secure: false })).not.toContain("Secure");
  });

  it("reads one cookie from a cookie header", () => {
    const header = `a=1; bayit_consent=${serializeConsent(ALL_CONSENT)}; b=2`;
    expect(parseConsent(readCookie(header, "bayit_consent"))).toEqual(ALL_CONSENT);
    expect(readCookie(header, "missing")).toBeNull();
    expect(readCookie("", "a")).toBeNull();
  });
});
