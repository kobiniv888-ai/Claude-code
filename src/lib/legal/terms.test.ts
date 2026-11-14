import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MIN_AGE, TERMS_CONSENT, TERMS_VERSION, hasCurrentAcceptance, termsConsentGiven, termsNeeded } from "./terms";

/** SECURITY_REPORT 15.11.b/c: when the "18 or older + Terms" box is needed, and what counts as ticked. */
describe("Terms acceptance rules", () => {
  it("names a dated version that is not in the future, and the 18+ age", () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Date.parse(`${TERMS_VERSION}T00:00:00Z`)).toBeLessThanOrEqual(Date.now());
    expect(MIN_AGE).toBe(18);
  });

  it("asks at sign-up only an account that never accepted any version", () => {
    expect(termsNeeded({ purpose: "signup", latest: null, first: true })).toBe(true);
    expect(termsNeeded({ purpose: "signup", latest: { version: "2000-01-01", ageConfirmed: true }, first: true })).toBe(false);
  });

  it("asks at the first booking and the first publish, even right after the sign-up acceptance", () => {
    const current = { version: TERMS_VERSION, ageConfirmed: true };
    for (const purpose of ["booking", "publish"] as const) {
      expect(termsNeeded({ purpose, latest: current, first: true })).toBe(true);
      expect(termsNeeded({ purpose, latest: current, first: false })).toBe(false);
    }
  });

  it("asks again before the next booking or publish once the version changed (or without the 18+ confirmation)", () => {
    for (const purpose of ["booking", "publish"] as const) {
      expect(termsNeeded({ purpose, latest: { version: "2026-01-01", ageConfirmed: true }, first: false })).toBe(true);
      expect(termsNeeded({ purpose, latest: { version: TERMS_VERSION, ageConfirmed: false }, first: false })).toBe(true);
      expect(termsNeeded({ purpose, latest: null, first: false })).toBe(true);
      expect(termsNeeded({ purpose, latest: { version: "2026-01-01", ageConfirmed: true }, first: false, version: "2026-01-01" })).toBe(false);
    }
    expect(hasCurrentAcceptance({ version: TERMS_VERSION, ageConfirmed: true })).toBe(true);
    expect(hasCurrentAcceptance(null)).toBe(false);
  });

  it("counts only an exact true for BOTH the acceptance and the age", () => {
    expect(termsConsentGiven(TERMS_CONSENT)).toBe(true);
    expect(termsConsentGiven({ termsAccepted: true })).toBe(false);
    expect(termsConsentGiven({ ageConfirmed: true })).toBe(false);
    expect(termsConsentGiven({ termsAccepted: "true", ageConfirmed: "true" })).toBe(false);
    expect(termsConsentGiven({ termsAccepted: 1, ageConfirmed: 1 })).toBe(false);
    expect(termsConsentGiven({ termsAccepted: true, ageConfirmed: false })).toBe(false);
    expect(termsConsentGiven(null)).toBe(false);
    expect(termsConsentGiven("yes")).toBe(false);
  });
});

/**
 * The rule is enforced by the server actions themselves (a hidden box is no fix): the booking and
 * the publish action call requireTermsFor before anything is booked or submitted.
 */
describe("the actions enforce it on the server", () => {
  const source = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
  const body = (text: string, start: string) => {
    const from = text.indexOf(start);
    expect(from, start).toBeGreaterThan(-1);
    const next = text.indexOf("\nexport async function", from + start.length);
    return text.slice(from, next === -1 ? undefined : next);
  };

  it("createBookingAction checks the Terms before createBooking", () => {
    const fn = body(source("src/lib/booking/actions.ts"), "export async function createBookingAction");
    const check = fn.indexOf('requireTermsFor(user.id, "booking", input)');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(fn.indexOf("createBooking({"));
  });

  it("acceptRulesAndPublish checks the Terms before the listing is submitted", () => {
    const fn = body(source("src/lib/wizard/actions.ts"), "export async function acceptRulesAndPublish");
    const check = fn.indexOf('requireTermsFor(user.id, "publish", input)');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(fn.indexOf("finalizeListing("));
    expect(check).toBeLessThan(fn.indexOf("submitForPublication("));
  });
});
