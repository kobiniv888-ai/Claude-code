/**
 * SECURITY_REPORT 12.3.b: the running site never changes the database's tables, so its role
 * (bayit_app, DATABASE_URL) has rows-only rights (scripts/sql/roles.sql) and table changes run
 * as bayit_migrate (MIGRATION_DATABASE_URL, prisma.config.ts). This test reads the source:
 *   - no app code (src/, without the generated client and tests) runs DDL: CREATE / ALTER / DROP of
 *     a table, index, trigger, function…, TRUNCATE, GRANT or REVOKE;
 *   - the two places that must (a restore, the field-encryption migration) are only reachable from
 *     scripts/, never from a page, a route or a server action;
 *   - roles.sql gives bayit_app rows only.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(__dirname, "../..");
const SRC = path.join(REPO, "src");

function files(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "generated" && entry !== "node_modules") files(full, out);
    } else if (/\.(ts|tsx|mjs|js)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const rel = (file: string) => path.relative(REPO, file).split(path.sep).join("/");

/** SQL that changes the schema or the rights (upper case, as SQL is written here; Tailwind's "truncate" is not SQL). */
const DDL =
  /\b(?:CREATE|ALTER|DROP)\s+(?:OR\s+REPLACE\s+)?(?:UNIQUE\s+)?(?:TABLE|INDEX|TRIGGER|FUNCTION|PROCEDURE|EXTENSION|SCHEMA|TYPE|VIEW|ROLE|SEQUENCE|POLICY|DATABASE|CONSTRAINT)\b|\bTRUNCATE\s+(?:TABLE\s+)?["A-Za-z]|\bGRANT\s+[A-Z, ]+\s+ON\b|\bREVOKE\s+[A-Z, ]+\s+ON\b/;

/** The only modules allowed to hold DDL, and the one function each exposes for it (scripts only). */
const ALLOWED: Record<string, { why: string; entry: string }> = {
  "src/lib/admin/maintenance/backup.ts": {
    why: "restoreBackup makes foreign keys deferrable for the length of a restore (scripts/db-restore.ts, db-restore-test.ts)",
    entry: "restoreBackup",
  },
  "src/lib/field-crypto-migrate.ts": {
    why: "adds the database guard after moving plain values into the encrypted columns (scripts/encrypt-fields.ts)",
    entry: "field-crypto-migrate",
  },
};

describe("the running site never needs DDL (12.3.b)", () => {
  const sources = files(SRC).map((file) => ({ file: rel(file), text: readFileSync(file, "utf8") }));

  it("no DDL outside the two script-only modules", () => {
    const offenders = sources.filter(({ file, text }) => DDL.test(text) && !(file in ALLOWED)).map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("the DDL helpers are used from scripts only", () => {
    for (const [file, { entry }] of Object.entries(ALLOWED)) {
      const users = sources
        .filter(({ file: other, text }) => other !== file && (entry === "restoreBackup" ? /\brestoreBackup\b/.test(text) : /field-crypto-migrate/.test(text)))
        .map(({ file: other }) => other);
      expect(users, `${file} (${entry})`).toEqual([]);
    }
  });

  it("no raw unsafe SQL in app code outside those modules", () => {
    const offenders = sources
      .filter(({ file, text }) => /\$(?:executeRawUnsafe|queryRawUnsafe)\s*\(/.test(text) && !(file in ALLOWED))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("the pattern catches DDL and ignores CSS", () => {
    for (const sql of ['ALTER TABLE "Listing" ADD CONSTRAINT x CHECK (true)', "CREATE INDEX i ON t(a)", "DROP TABLE x", "TRUNCATE \"User\"", "GRANT SELECT ON t TO r", "CREATE OR REPLACE FUNCTION f()"]) {
      expect(DDL.test(sql), sql).toBe(true);
    }
    for (const text of ['className="truncate text-sm"', "SELECT * FROM \"User\"", "UPDATE \"Listing\" SET status = 'LIVE'", "createTable()"]) {
      expect(DDL.test(text), text).toBe(false);
    }
  });
});

describe("scripts/sql/roles.sql", () => {
  const sql = readFileSync(path.join(REPO, "scripts/sql/roles.sql"), "utf8");
  const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  it("gives bayit_app rows only", () => {
    expect(statements).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bayit_app");
    expect(statements).toContain("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    const appGrants = statements.split(";").filter((s) => /\bGRANT\b/.test(s) && /\bTO\s+bayit_app\b/.test(s));
    for (const grant of appGrants) expect(grant, grant.trim()).not.toMatch(/\b(?:CREATE|TRUNCATE|TRIGGER|REFERENCES|ALL PRIVILEGES)\b/);
  });

  it("never writes a password into the file", () => {
    expect(statements).not.toMatch(/PASSWORD\s+'/i);
    expect(statements).toMatch(/PASSWORD :'app_password'/);
  });
});
