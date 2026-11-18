/**
 * `npm run security:check` (SECURITY_REPORT 2.1.b, 2.3.f): the pure rules of
 * scripts/security-check-lib.mjs — the audit threshold, the framework floor, and the 14-day
 * package age with its allow-list (fail closed on an unknown publish time).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  blockingAdvisories,
  FRAMEWORK_FLOORS,
  MIN_PACKAGE_AGE_DAYS,
  auditSeverities,
  belowFloor,
  lockfileEntries,
  packageAgeReport,
} from "../../scripts/security-check-lib.mjs";

const ROOT = path.resolve(__dirname, "../..");
const now = new Date("2026-11-08T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

describe("security:check rules", () => {
  it("reads high and critical counts from npm audit --json", () => {
    expect(auditSeverities({ metadata: { vulnerabilities: { high: 1, critical: 2, moderate: 3, low: 0 } } })).toEqual({ high: 1, critical: 2, moderate: 3, low: 0 });
    expect(auditSeverities({})).toEqual({ high: 0, critical: 0, moderate: 0, low: 0 });
  });

  it("the framework floor: below it, or missing, fails", () => {
    const at = { next: "16.4.5", "eslint-config-next": "16.4.5", react: "19.3.1", "react-dom": "19.3.1" };
    expect(belowFloor(at)).toEqual([]);
    expect(belowFloor({ ...at, next: "16.4.4" })).toEqual([{ name: "next", installed: "16.4.4", floor: "16.4.5" }]);
    expect(belowFloor({ ...at, react: "19.3.1-canary.2" }).map((m) => m.name)).toEqual(["react"]);
    expect(belowFloor({ ...at, "react-dom": undefined as unknown as string }).map((m) => m.name)).toEqual(["react-dom"]);
    expect(FRAMEWORK_FLOORS.next).toBe("16.4.5");
  });

  it("lists each installed name@version once from the lockfile", () => {
    const lock = {
      packages: {
        "": { name: "bayit", version: "0.1.0" },
        "node_modules/a": { version: "1.0.0" },
        "node_modules/x/node_modules/a": { version: "1.0.0" },
        "node_modules/@s/b": { version: "2.0.0" },
        "node_modules/linked": { link: true, version: "1.0.0" },
      },
    };
    expect(lockfileEntries(lock).map((e) => e.id)).toEqual(["@s/b@2.0.0", "a@1.0.0"]);
  });

  it(`a version younger than ${MIN_PACKAGE_AGE_DAYS} days fails unless allow-listed with a reason; an unknown time fails`, () => {
    const entries = lockfileEntries({
      packages: {
        "node_modules/old": { version: "1.0.0" },
        "node_modules/young": { version: "2.0.0" },
        "node_modules/fix": { version: "3.0.1" },
        "node_modules/mystery": { version: "0.0.1" },
      },
    });
    const published = { "old@1.0.0": daysAgo(30), "young@2.0.0": daysAgo(3), "fix@3.0.1": daysAgo(1) };
    const report = packageAgeReport(entries, published, { "fix@3.0.1": { reason: "security fix for an advisory" }, "gone@1.0.0": { reason: "an old upgrade" } }, now);
    expect(report.young.map((y) => y.id)).toEqual(["young@2.0.0"]);
    expect(report.allowed.map((a) => a.id)).toEqual(["fix@3.0.1"]);
    expect(report.unknown).toEqual(["mystery@0.0.1"]);
    expect(report.stale).toEqual(["gone@1.0.0"]);
    // A reason is required: an empty one does not allow.
    expect(packageAgeReport(entries, published, { "fix@3.0.1": { reason: "" } }, now).young.map((y) => y.id)).toContain("fix@3.0.1");
    expect(packageAgeReport(entries, published, { "fix@3.0.1": { reason: " " } }, now).young.map((y) => y.id)).toContain("fix@3.0.1");
  });

  it("the allow-list file holds only reasoned entries, and the script is wired in package.json", () => {
    const allow = JSON.parse(readFileSync(path.join(ROOT, "scripts/package-age-allow.json"), "utf8")) as { allow: Record<string, { reason: string }> };
    for (const [id, entry] of Object.entries(allow.allow)) {
      expect(id).toMatch(/^(@[^/]+\/)?[^@]+@\d+\.\d+\.\d+/);
      expect(entry.reason.length, id).toBeGreaterThan(30);
    }
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["security:check"]).toBe("node scripts/security-check.mjs");
  });
});

describe("advisory allow-list (scripts/audit-allow.json)", () => {
  const report = {
    vulnerabilities: {
      picomatch: { via: [{ url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc", severity: "high", title: "ReDoS" }] },
      vite: { via: ["picomatch"] },
      other: { via: [{ url: "https://github.com/advisories/GHSA-dddd-eeee-ffff", severity: "moderate", title: "minor" }] },
    },
  };
  const now = new Date("2026-11-18T12:00:00Z");

  it("blocks a high advisory that is not listed", () => {
    expect(blockingAdvisories(report, {}, now).map((a) => a.id)).toEqual(["GHSA-aaaa-bbbb-cccc"]);
  });
  it("lets a listed advisory pass until its end date", () => {
    const allow = { "GHSA-aaaa-bbbb-cccc": { reason: "no fix yet", until: "2026-12-02" } };
    expect(blockingAdvisories(report, allow, now)).toEqual([]);
  });
  it("blocks again after the end date, and without a reason (fail closed)", () => {
    expect(blockingAdvisories(report, { "GHSA-aaaa-bbbb-cccc": { reason: "x", until: "2026-11-17" } }, now)[0]?.expired).toBe(true);
    expect(blockingAdvisories(report, { "GHSA-aaaa-bbbb-cccc": { until: "2026-12-02" } }, now)).toHaveLength(1);
  });
  it("every committed entry has a reason and an end date", () => {
    const file = JSON.parse(readFileSync(path.join(process.cwd(), "scripts/audit-allow.json"), "utf8"));
    for (const entry of Object.values(file.allow ?? {}) as { reason?: string; until?: string }[]) {
      expect(entry.reason && entry.reason.length > 20).toBe(true);
      expect(entry.until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
