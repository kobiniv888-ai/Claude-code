/**
 * speed-3 (round 3, phase 5 hardening): the results page asks "is this search saved?" (a database
 * read for signed-in visitors) together with the results, not after them: one round trip less
 * before any HTML on every signed-in results page and filter tap.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC } from "./module-graph";

const page = fs.readFileSync(path.join(SRC, "app/[locale]/(site)/search/page.tsx"), "utf8");

describe("the search page's saved-search check", () => {
  it("runs inside the page's Promise.all with the results", () => {
    const blocks = [...page.matchAll(/await Promise\.all\(\[([\s\S]*?)\n\s*\]\);/g)].map((m) => m[1]);
    const results = blocks.find((block) => block.includes("searchListings("));
    expect(results).toBeDefined();
    expect(results).toContain("isSearchSaved(");
  });

  it("is not awaited again after the results", () => {
    expect(page).not.toMatch(/await getSaveSearchState\(/);
  });
});
