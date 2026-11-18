import { describe, expect, it } from "vitest";
import { parseSearchParams } from "@/lib/listing/search-params";
import { documentChecksOn, showsDocumentBadge, verificationConfig } from "./verification";

describe("verification decision (b): no documents for now", () => {
  it("has document checks off", () => {
    expect(verificationConfig.documentChecks).toBe(false);
    expect(documentChecksOn()).toBe(false);
  });

  it("hides every badge that came from a document, even when the date is stored", () => {
    expect(showsDocumentBadge(new Date("2026-01-01"))).toBe(false);
    expect(showsDocumentBadge("2026-01-01T00:00:00.000Z")).toBe(false);
    expect(showsDocumentBadge(null)).toBe(false);
  });

  it("ignores the old 'verified owners only' search filter", () => {
    expect(parseSearchParams({ verifiedOnly: "1" }).verifiedOnly).toBe(false);
  });
});
