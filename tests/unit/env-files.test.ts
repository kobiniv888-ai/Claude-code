/**
 * SECURITY_REPORT 2.3.h: git never tracks a .env file except the example. `git add -f .env`, or a
 * .gitignore edit such as `!.env.production`, would commit keys; the ignore rule and the gitleaks
 * scan in CI are the other layers, this fails the unit suite before a push. Skipped where git or
 * the repository is not available (a tarball, a container without git).
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(__dirname, "../..");

function trackedFiles(): string[] | null {
  if (!existsSync(path.join(REPO, ".git"))) return null;
  try {
    return execFileSync("git", ["ls-files", "-z"], { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean);
  } catch {
    return null;
  }
}

/** A dotenv file anywhere in the tree: .env, .env.local, .env.production, apps/x/.env… */
export function isEnvFile(file: string): boolean {
  return /(^|\/)\.env(\.|$)/.test(file);
}

describe("no .env file in git but the example (2.3.h)", () => {
  it("recognises dotenv files", () => {
    for (const file of [".env", ".env.local", ".env.production", "apps/web/.env", "x/.env.test"]) expect(isEnvFile(file), file).toBe(true);
    for (const file of [".envrc.md", "src/lib/env.ts", "docs/.environment.md", "environment.ts"]) expect(isEnvFile(file), file).toBe(false);
  });

  const files = trackedFiles();
  it.skipIf(files === null)("git tracks only .env.example", () => {
    expect((files ?? []).filter(isEnvFile)).toEqual([".env.example"]);
  });
});
