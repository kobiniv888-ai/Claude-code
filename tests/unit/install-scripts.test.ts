/**
 * Supply chain (SECURITY_REPORT 2.3.g, L5): `.npmrc` turns every package install script off and
 * scripts/allowed-install-scripts.mjs runs the reviewed few. A package that gains an install
 * script (a new dependency, or an update) fails this test until someone reviews the script and
 * puts the package in ALLOWED_INSTALL_SCRIPTS or SKIPPED_INSTALL_SCRIPTS.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALLOWED_INSTALL_SCRIPTS, SKIPPED_INSTALL_SCRIPTS } from "../../scripts/allowed-install-scripts.mjs";

const root = path.resolve(__dirname, "../..");
const lock = JSON.parse(readFileSync(path.join(root, "package-lock.json"), "utf8")) as {
  packages: Record<string, { hasInstallScript?: boolean; name?: string }>;
};
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { scripts: Record<string, string> };

/** "node_modules/a/node_modules/@b/c" → "@b/c" */
const nameOf = (key: string) => key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);

describe("install scripts", () => {
  it("are switched off for every package by the committed .npmrc", () => {
    const npmrc = readFileSync(path.join(root, ".npmrc"), "utf8");
    expect(npmrc.split("\n").map((line) => line.trim())).toContain("ignore-scripts=true");
  });

  it("every package with an install script in the lockfile was reviewed (allowed or skipped)", () => {
    const withScripts = new Set(
      Object.entries(lock.packages)
        .filter(([key, entry]) => key !== "" && entry.hasInstallScript)
        .map(([key]) => nameOf(key)),
    );
    const reviewed = new Set<string>([...ALLOWED_INSTALL_SCRIPTS, ...Object.keys(SKIPPED_INSTALL_SCRIPTS)]);
    expect([...withScripts].filter((name) => !reviewed.has(name))).toEqual([]);
  });

  it("the allow-list is small and every skipped package says why", () => {
    expect(ALLOWED_INSTALL_SCRIPTS).toEqual(["@prisma/engines"]);
    for (const reason of Object.values(SKIPPED_INSTALL_SCRIPTS) as string[]) expect(reason.length).toBeGreaterThan(20);
  });

  it("our own postinstall still exists and deps:scripts runs the allow-list", () => {
    expect(pkg.scripts.postinstall).toBe("prisma generate");
    expect(pkg.scripts["deps:scripts"]).toBe("node scripts/allowed-install-scripts.mjs");
  });
});
