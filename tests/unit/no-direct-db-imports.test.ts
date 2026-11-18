/**
 * SECURITY_REPORT 4.1.a: pages, layouts, route handlers, components and hooks never import the
 * database client. They call a server-only function in src/lib/<feature>/ that checks who is
 * asking. The ESLint rule in eslint.config.mjs says the same; this test catches it when lint is
 * skipped. The few thin files that keep a direct import are listed, with a reason, in
 * DIRECT_DB_ALLOWED (eslint.config.mjs).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DIRECT_DB_ALLOWED } from "../../eslint.config.mjs";

const ROOT = path.resolve(__dirname, "../..");
const SCANNED = ["src/app", "src/components", "src/hooks", "src/proxy.ts"];
/** A value import of the db client (a type-only import is fine). */
const DB_IMPORT = /^\s*import\s+(?!type\b)[^;]*?from\s+["'](?:@\/lib\/db|(?:\.\.\/)+(?:lib\/)?db)["']/m;
const DYNAMIC_DB_IMPORT = /import\(\s*["']@\/lib\/db["']\s*\)/;

function sourceFiles(entry: string): string[] {
  const full = path.join(ROOT, entry);
  const stat = statSync(full, { throwIfNoEntry: false });
  if (!stat) return [];
  if (stat.isFile()) return /\.(ts|tsx|mts)$/.test(entry) ? [entry] : [];
  return readdirSync(full).flatMap((name) => sourceFiles(path.posix.join(entry, name)));
}

const files = SCANNED.flatMap(sourceFiles).filter((file) => !/\.test\.tsx?$/.test(file));

describe("no direct database imports outside src/lib (4.1.a)", () => {
  it("finds the source files", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("only the allow-listed thin files import @/lib/db", () => {
    const allowed = new Set(Object.keys(DIRECT_DB_ALLOWED));
    const offenders = files.filter((file) => {
      const text = readFileSync(path.join(ROOT, file), "utf8");
      return (DB_IMPORT.test(text) || DYNAMIC_DB_IMPORT.test(text)) && !allowed.has(file);
    });
    expect(offenders).toEqual([]);
  });

  it("every allow-list entry exists, still needs it and has a reason", () => {
    for (const [file, reason] of Object.entries(DIRECT_DB_ALLOWED)) {
      const full = path.join(ROOT, file);
      expect(statSync(full, { throwIfNoEntry: false })?.isFile(), file).toBe(true);
      expect(DB_IMPORT.test(readFileSync(full, "utf8")), `${file} no longer imports the db: remove it from DIRECT_DB_ALLOWED`).toBe(true);
      expect(String(reason).length, file).toBeGreaterThan(20);
    }
  });

  it("the pattern catches the import forms and skips type-only imports", () => {
    expect(DB_IMPORT.test('import { db } from "@/lib/db";')).toBe(true);
    expect(DB_IMPORT.test("import { db as client } from '@/lib/db'")).toBe(true);
    expect(DB_IMPORT.test('import type { DbClient } from "@/lib/db";')).toBe(false);
    expect(DYNAMIC_DB_IMPORT.test('const { db } = await import("@/lib/db");')).toBe(true);
  });
});
