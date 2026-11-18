/** TS-15: a production server refuses to start while the legal drafts have <todo> parts. */
import { describe, expect, it } from "vitest";
import { legalStartupProblems, legalTodoKeys } from "./startup-check-legal";

const draft = { en: { terms: { company: "Run by <todo>Company name</todo>.", title: "Terms" } }, he: { terms: { company: "<todo>שם החברה</todo>" } } };
const done = { en: { terms: { company: "Run by Bayit Ltd.", title: "Terms" } } };

describe("legalStartupProblems", () => {
  it("production with a <todo> part: refused, naming keys only", () => {
    const problems = legalStartupProblems("production", draft);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/2 unfinished <todo> parts.*terms\.company/);
    expect(problems[0]).not.toMatch(/Company name|שם החברה/);
  });

  it("development and staging show the drafts; a finished text passes in production", () => {
    expect(legalStartupProblems("development", draft)).toEqual([]);
    expect(legalStartupProblems("staging", draft)).toEqual([]);
    expect(legalStartupProblems("production", done)).toEqual([]);
  });

  it("reads the real legal.json of all 5 languages", () => {
    // While the lawyer's parts are open, the real files have some; the count is the same per language.
    const keys = legalTodoKeys();
    const perLocale = new Map<string, number>();
    for (const k of keys) perLocale.set(k.split(":")[0]!, (perLocale.get(k.split(":")[0]!) ?? 0) + 1);
    expect(new Set(perLocale.values()).size).toBeLessThanOrEqual(1);
    expect(legalStartupProblems("production").length).toBe(keys.length ? 1 : 0);
  });
});

describe("wiring", () => {
  it("the deploy check (scripts/check-startup-env.ts, run by every Vercel build) includes it", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const script = fs.readFileSync(path.resolve(__dirname, "../../scripts/check-startup-env.ts"), "utf8");
    expect(script).toMatch(/legalStartupProblems\(readSiteEnv\(process\.env\)\)/);
    expect(fs.readFileSync(path.resolve(__dirname, "../../scripts/vercel-build.mjs"), "utf8")).toMatch(/check-startup-env\.ts/);
  });
});
