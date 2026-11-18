import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SCAM_FIELD_ERRORS, SCAM_REPORT_LIMITS, scamReportHref, scamReportSchema, scamReportTarget } from "./scam";

const valid = {
  kind: "asked_to_pay",
  listing: 1234,
  booking: null,
  details: "The host asked me to pay the deposit by a link before arriving.",
  site: null,
  name: "Dana",
  email: "dana@example.com",
  website: "",
  turnstileToken: "token",
  locale: "he",
};

const fieldErrors = (input: unknown) => {
  const parsed = scamReportSchema.safeParse(input);
  return parsed.success ? {} : z.flattenError(parsed.error).fieldErrors;
};

describe("scamReportHref (SECURITY_REPORT 14.2.c)", () => {
  it("pre-fills the listing and the booking", () => {
    expect(scamReportHref()).toBe("/help/report-scam");
    expect(scamReportHref({ listing: 1234 })).toBe("/help/report-scam?listing=1234");
    expect(scamReportHref({ listing: 1234, booking: "BT-7K3Q9" })).toBe("/help/report-scam?listing=1234&booking=BT-7K3Q9");
  });
});

describe("scamReportSchema", () => {
  it("accepts a visitor's report", () => {
    expect(scamReportSchema.safeParse(valid).success).toBe(true);
  });

  it("asks for a few words of what happened", () => {
    expect(fieldErrors({ ...valid, details: "scam" }).details).toEqual(["details_short"]);
    expect(fieldErrors({ ...valid, details: "x".repeat(2001) }).details).toEqual(["details_long"]);
  });

  it("asks for the fake site's address", () => {
    expect(fieldErrors({ ...valid, kind: "fake_site", site: "" }).site).toEqual(["site_required"]);
    expect(scamReportSchema.safeParse({ ...valid, kind: "fake_site", site: "bayit-pay.example" }).success).toBe(true);
  });

  it("rejects a bad email and unknown fields", () => {
    expect(fieldErrors({ ...valid, email: "not-an-email" }).email).toEqual(["email_invalid"]);
    expect(scamReportSchema.safeParse({ ...valid, priority: "LOW" }).success).toBe(false);
  });

  it("only uses error codes the form can show", () => {
    const codes = Object.values(fieldErrors({ ...valid, kind: "nope", details: "", email: "x", locale: "he" })).flat();
    for (const code of codes) expect(SCAM_FIELD_ERRORS).toContain(code);
  });
});

describe("scamReportTarget", () => {
  it("files a signed-in account's listing report as a Report", () => {
    expect(scamReportTarget({ signedIn: true, kind: "asked_to_pay", hasListing: true })).toBe("report");
    expect(scamReportTarget({ signedIn: true, kind: "card_or_code", hasListing: true })).toBe("report");
  });

  it("files visitors, fake sites and reports without a listing as a ticket", () => {
    expect(scamReportTarget({ signedIn: false, kind: "asked_to_pay", hasListing: true })).toBe("ticket");
    expect(scamReportTarget({ signedIn: true, kind: "fake_site", hasListing: true })).toBe("ticket");
    expect(scamReportTarget({ signedIn: true, kind: "other", hasListing: false })).toBe("ticket");
  });

  it("is rate-limited per IP and per account", () => {
    expect(SCAM_REPORT_LIMITS.ip.limit).toBeGreaterThan(0);
    expect(SCAM_REPORT_LIMITS.account.limit).toBeGreaterThan(0);
  });
});
