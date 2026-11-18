/**
 * FE-4: the running site's database role is checked by what it can do, not only by its name.
 * The pure decision, plus the query against the local database (read-only).
 */
import "dotenv/config";
import { describe, expect, it, vi } from "vitest";
import { databaseRoleProblems, readDatabaseRoleFacts, type DatabaseRoleFacts } from "./startup-check-db-role";

vi.mock("server-only", () => ({}));

const APP: DatabaseRoleFacts = {
  role: "bayit_app",
  superuser: false,
  createRole: false,
  createDb: false,
  bypassRls: false,
  replication: false,
  schemaCreate: false,
  ownsTables: false,
  memberOf: [],
};

describe("databaseRoleProblems", () => {
  it("the least-privilege role passes", () => {
    expect(databaseRoleProblems(APP)).toEqual([]);
  });

  it("an owner role with an unknown name is refused by what it can do", () => {
    const problems = databaseRoleProblems({ ...APP, role: "bayit_owner_x", ownsTables: true, schemaCreate: true });
    expect(problems.join(" ")).toMatch(/bayit_owner_x.*owns tables/);
  });

  it("every dangerous right counts", () => {
    for (const key of ["superuser", "createRole", "createDb", "bypassRls", "replication", "schemaCreate", "ownsTables"] as const) {
      expect(databaseRoleProblems({ ...APP, [key]: true }), key).toHaveLength(1);
    }
  });

  it("membership of another role (Neon's neon_superuser) is refused", () => {
    expect(databaseRoleProblems({ ...APP, memberOf: ["neon_superuser"] }).join(" ")).toMatch(/member of "neon_superuser"/);
  });
});

describe("readDatabaseRoleFacts (local database, read only)", () => {
  it("reads the facts of current_user", async () => {
    const { db } = await import("@/lib/db");
    try {
      const facts = await readDatabaseRoleFacts(db);
      expect(typeof facts.role).toBe("string");
      expect(Array.isArray(facts.memberOf)).toBe(true);
      // The codespace connects as the owner: the check would refuse it on the real site.
      if (facts.ownsTables) expect(databaseRoleProblems(facts).length).toBeGreaterThan(0);
    } finally {
      await db.$disconnect();
    }
  });
});
