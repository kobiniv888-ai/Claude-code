import { describe, expect, it } from "vitest";
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  backupId,
  isBackupId,
  isSafeTableName,
  parseBackupMeta,
  pgEnvFromUrl,
  quoteIdent,
  redact,
  summarize,
  type BackupMeta,
} from "./backup-format";

function meta(over: Partial<BackupMeta> = {}): BackupMeta {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    id: "2026-11-03T21-17-22Z-a1b2",
    createdAt: "2026-11-03T21:17:22.123Z",
    createdBy: { userId: "staff-1", via: "admin" },
    database: { name: "bayit", server: "16.4" },
    schemaSha256: "abc",
    tables: [{ name: "User", rows: 3, bytes: 300, sha256: "x", columns: ["id", "name"] }],
    totalRows: 3,
    totalBytes: 1000,
    pgDump: { file: "database.dump", bytes: 500 },
    complete: true,
    ...over,
  };
}

describe("backup folder names", () => {
  it("are sortable times with a short random suffix", () => {
    expect(backupId(new Date("2026-11-03T21:17:22.123Z"), "A1B2")).toBe("2026-11-03T21-17-22Z-a1b2");
    expect(backupId(new Date("2026-11-03T21:17:22.000Z"), "x")).toBe("2026-11-03T21-17-22Z-x000");
    expect(isBackupId("2026-11-03T21-17-22Z-a1b2")).toBe(true);
  });

  it("never accept a path, a partial folder or anything else", () => {
    for (const bad of ["../etc", "2026-11-03T21-17-22Z-a1b2.partial", "2026-11-03T21-17-22Z-a1b2/..", "", null, 42, "backups/2026-11-03T21-17-22Z-a1b2"]) {
      expect(isBackupId(bad), String(bad)).toBe(false);
    }
  });
});

describe("table names", () => {
  it("are safe as file names and quoted for SQL", () => {
    expect(isSafeTableName("ListingStatDaily")).toBe(true);
    expect(isSafeTableName("_prisma_migrations")).toBe(true);
    expect(isSafeTableName("../User")).toBe(false);
    expect(isSafeTableName('User"; DROP TABLE x; --')).toBe(false);
    expect(quoteIdent("User")).toBe('"User"');
    expect(quoteIdent('a"b')).toBe('"a""b"');
  });
});

describe("metadata", () => {
  it("accepts only a complete backup of this format", () => {
    expect(parseBackupMeta(meta())).not.toBeNull();
    expect(parseBackupMeta({ ...meta(), complete: false })).toBeNull();
    expect(parseBackupMeta({ ...meta(), version: 99 })).toBeNull();
    expect(parseBackupMeta({ ...meta(), id: "../x" })).toBeNull();
    expect(parseBackupMeta({ ...meta(), tables: [{ name: "../x", columns: [] }] })).toBeNull();
    expect(parseBackupMeta(null)).toBeNull();
  });

  it("summarizes with the database name, so a run only trusts a backup of its own database", () => {
    expect(summarize(meta())).toEqual({
      id: "2026-11-03T21-17-22Z-a1b2",
      createdAt: "2026-11-03T21:17:22.123Z",
      totalBytes: 1000,
      totalRows: 3,
      tables: 1,
      pgDump: true,
      via: "admin",
      database: "bayit",
    });
    expect(summarize(meta({ pgDump: { error: "x" } })).pgDump).toBe(false);
    expect(summarize(meta({ pgDump: null })).pgDump).toBe(false);
  });
});

describe("pg_dump settings", () => {
  it("go through the environment, never the command line", () => {
    expect(pgEnvFromUrl("postgresql://bayit:p%40ss@localhost:5433/bayit?sslmode=require")).toEqual({
      PGHOST: "localhost",
      PGPORT: "5433",
      PGUSER: "bayit",
      PGPASSWORD: "p@ss",
      PGDATABASE: "bayit",
      PGSSLMODE: "require",
    });
  });

  it("errors never show a connection string or a password", () => {
    const text = redact('connection to "postgresql://bayit:secret@db.example:5432/bayit" failed, password=secret');
    expect(text).not.toContain("secret");
    expect(text).toContain("postgresql://***");
  });
});
