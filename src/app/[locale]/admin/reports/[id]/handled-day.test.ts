/**
 * The report page shows when a report was decided twice (the decision bar and the facts list):
 * both must be the day in Georgia. A decision at 01:30 Tbilisi time (21:30 UTC the evening before)
 * is the next day, not the UTC one.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatDate } from "@/lib/format";

const LONG_DAY = { day: "numeric", month: "long", year: "numeric" } as const;

describe("the report's 'handled on' day", () => {
  it("is the Georgian day of the decision", () => {
    const handledAt = new Date("2026-11-04T21:30:00Z");
    expect(formatDate(handledAt, "he", LONG_DAY)).toBe("5 בנובמבר 2026");
    expect(formatDate(handledAt, "en", LONG_DAY)).toBe("November 5, 2026");
    // The old way (the UTC day as a calendar date) gave the evening before.
    expect(formatDate(handledAt.toISOString().slice(0, 10), "en", LONG_DAY)).toBe("November 4, 2026");
  });

  it("the page formats the moment itself, never its UTC day", () => {
    const source = readFileSync(path.join(__dirname, "page.tsx"), "utf8");
    expect(source).not.toMatch(/handledAt\.toISOString\(\)/);
    expect(source).toMatch(/day\(report\.handledAt\)/);
  });
});
