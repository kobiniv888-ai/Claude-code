import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A <table> ignores the sr-only 1px width (tables can't shrink below their content), so a long
 * caption or header (Georgian) widens the page at 360px. Screen-reader tables put sr-only on a
 * wrapping <div> instead (see src/components/admin/clicks-chart.tsx).
 */

const SRC = path.resolve(__dirname, "..");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return entry === "generated" ? [] : tsxFiles(full);
    return entry.endsWith(".tsx") ? [full] : [];
  });
}

describe("screen-reader tables", () => {
  it("never put sr-only on the <table> itself", () => {
    const offenders = tsxFiles(SRC)
      .filter((file) => /<table\b[^>]*className=["'{`][^>]*\bsr-only\b/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
