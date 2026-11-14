import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FRAMEWORK_FLOORS } from "../../scripts/security-check-lib.mjs";

/**
 * Version floor for the framework (SECURITY_REPORT 2.1.a): the installed Next.js and React must
 * include the November 2026 security fixes. A downgrade (an old lockfile, a careless install)
 * fails here before it can ship. Raise the floors after every security upgrade.
 */

// The same floors as `npm run security:check` (scripts/security-check-lib.mjs, SECURITY_REPORT 2.1.b).
const FLOORS: Record<string, string> = FRAMEWORK_FLOORS;

const ROOT = path.resolve(__dirname, "../..");
const installed = (name: string) =>
  (JSON.parse(readFileSync(path.join(ROOT, "node_modules", name, "package.json"), "utf8")) as { version: string }).version;

/** -1, 0 or 1 for plain x.y.z versions (a pre-release suffix counts as below its release). */
function compare(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.split("-", 2);
    return { parts: core!.split(".").map(Number), pre: pre ?? null };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i += 1) {
    if ((x.parts[i] ?? 0) !== (y.parts[i] ?? 0)) return (x.parts[i] ?? 0) > (y.parts[i] ?? 0) ? 1 : -1;
  }
  if (x.pre === y.pre) return 0;
  return x.pre === null ? 1 : -1;
}

describe("framework security floor", () => {
  it("compares versions", () => {
    expect(compare("16.4.5", "16.4.5")).toBe(0);
    expect(compare("16.4.3", "16.4.5")).toBe(-1);
    expect(compare("16.10.0", "16.4.5")).toBe(1);
    expect(compare("16.4.5-canary.1", "16.4.5")).toBe(-1);
  });

  for (const [name, floor] of Object.entries(FLOORS)) {
    it(`${name} is at least ${floor} (installed and pinned)`, () => {
      expect(compare(installed(name), floor)).toBeGreaterThanOrEqual(0);
      const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as Record<string, Record<string, string>>;
      const pinned = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
      expect(pinned, `${name} in package.json`).toBeDefined();
      expect(compare(pinned!.replace(/^[\^~]/, ""), floor)).toBeGreaterThanOrEqual(0);
    });
  }
});
