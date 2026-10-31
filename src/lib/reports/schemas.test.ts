import { describe, expect, it } from "vitest";
import { reportInputSchema } from "./schemas";

describe("reportInputSchema", () => {
  it("accepts a listing report and trims the details", () => {
    const parsed = reportInputSchema.parse({ targetType: "LISTING", targetId: "abc", reason: "FAKE_LISTING", details: "  same photos elsewhere " });
    expect(parsed.details).toBe("same photos elsewhere");
  });

  it("stores empty details as null", () => {
    expect(reportInputSchema.parse({ targetType: "USER", targetId: "u1", reason: "OFFENSIVE", details: "   " }).details).toBeNull();
  });

  it("needs a few words for Other", () => {
    expect(reportInputSchema.safeParse({ targetType: "LISTING", targetId: "abc", reason: "OTHER", details: "bad" }).success).toBe(false);
    expect(reportInputSchema.safeParse({ targetType: "LISTING", targetId: "abc", reason: "OTHER", details: "The address is a parking lot" }).success).toBe(true);
  });

  it("rejects unknown targets, reasons and extra fields", () => {
    expect(reportInputSchema.safeParse({ targetType: "MESSAGE", targetId: "abc", reason: "OTHER" }).success).toBe(false);
    expect(reportInputSchema.safeParse({ targetType: "LISTING", targetId: "abc", reason: "SPAM" }).success).toBe(false);
    expect(reportInputSchema.safeParse({ targetType: "LISTING", targetId: "abc", reason: "FAKE_LISTING", status: "RESOLVED" }).success).toBe(false);
  });
});
