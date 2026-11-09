/**
 * Restores a backup made by `npm run db:backup`, Admin → Maintenance or the weekly off-site job into
 * an EMPTY database. It refuses a database that has any rows, so it can never overwrite live data.
 *
 *   RESTORE_TARGET_URL=postgresql://user:pass@host:5432/newdb npm run db:restore -- backups/<time> --create-schema
 *   BACKUP_ENCRYPTION_KEY=… RESTORE_TARGET_URL=… npm run db:restore -- <copy>.bkenc --create-schema
 *
 *   <backup>         the backup folder (or just its name, looked up in backups/ or BACKUP_DIR), or an
 *                    encrypted off-site copy (.bkenc, from `npm run backup:offsite -- download`):
 *                    it is decrypted with BACKUP_ENCRYPTION_KEY (the copy the founder keeps offline)
 *                    into a temporary folder, deleted afterwards
 *   RESTORE_TARGET_URL  the database to fill (it must exist and be empty). `--target <url>` works
 *                    too, but npm prints its arguments, so the password would show on screen.
 *   --create-schema  first create the tables from the backup's schema.prisma (prisma db push)
 *
 * A backup of the REAL site (SITE_ENV=production, or its database marker) is never restored into a
 * codespace or a local database (SECURITY_REPORT 2.4.j; checklist 0.6: no real data in development):
 * restore it into a new database at the host (a Neon branch), from there.
 *
 * To restore the real site: create a new empty database at the host, restore into it, check it,
 * then point DATABASE_URL at it. A pg_dump file (database.dump), when present, can also be used
 * with `pg_restore --no-owner -d <url> database.dump`. Restore TEST: npm run db:restore-test.
 */
import "../prisma/seed/esm-interop";
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isBackupId, isDevelopmentRestoreTarget } from "@/lib/admin/maintenance/backup-format";
import { backupRoot, isProductionBackup, readBackupMeta, restoreBackup } from "@/lib/admin/maintenance/backup";
import { parseBackupKey } from "@/lib/admin/maintenance/backup-crypto";
import { decryptBackupInto } from "@/lib/admin/maintenance/offsite";

const USAGE =
  "Usage: RESTORE_TARGET_URL=<empty database url> npm run db:restore -- <backup folder, name or .bkenc file> [--create-schema]\n" +
  "   or: npm run db:restore -- <backup> --target <empty database url> [--create-schema]";

function parseArgs(argv: string[]) {
  let backup: string | undefined;
  let target: string | undefined = process.env.RESTORE_TARGET_URL?.trim() || undefined;
  let createSchema = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target") target = argv[++i];
    else if (arg.startsWith("--target=")) target = arg.slice("--target=".length);
    else if (arg === "--create-schema") createSchema = true;
    else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}\n${USAGE}`);
    else backup = arg;
  }
  if (!backup || !target) throw new Error(USAGE);
  return { backup, target, createSchema };
}

/**
 * The backup folder for a name, a folder or an encrypted file (decrypted into a temporary folder:
 * `cleanup` deletes it). Shared with scripts/db-restore-test.ts.
 */
export async function openBackup(backup: string): Promise<{ dir: string; cleanup: () => Promise<void>; encrypted: boolean }> {
  const resolved = isBackupId(backup) && !existsSync(backup) ? path.join(backupRoot(), backup) : path.resolve(backup);
  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat) throw new Error(`${resolved} does not exist.`);
  if (stat.isDirectory()) return { dir: resolved, cleanup: async () => {}, encrypted: false };
  const key = parseBackupKey(process.env.BACKUP_ENCRYPTION_KEY);
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "bayit-restore-"));
  await fs.chmod(work, 0o700).catch(() => undefined);
  const cleanup = () => fs.rm(work, { recursive: true, force: true }).catch(() => undefined);
  try {
    const dir = path.join(work, "backup");
    await decryptBackupInto(createReadStream(resolved), dir, key);
    return { dir, cleanup, encrypted: true };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/** Refuses a real-site backup on this machine or in a codespace (2.4.j). */
export async function assertSafeTarget(dir: string, target: string): Promise<void> {
  const meta = await readBackupMeta(dir);
  if (!meta) throw new Error(`${dir} is not a complete backup (no valid metadata.json).`);
  if (isDevelopmentRestoreTarget(target, process.env) && (await isProductionBackup(dir, meta))) {
    throw new Error(
      "This is a backup of the real site. Real data is never restored into a codespace or a local database: restore it into a new empty database at the host (a Neon branch) instead.",
    );
  }
}

/** `prisma db push` of the backup's schema into the target (both URLs point at the target). */
export function createSchema(dir: string, target: string): void {
  const schema = path.join(dir, "schema.prisma");
  if (!existsSync(schema)) throw new Error("The backup has no schema.prisma; create the tables with `npx prisma db push` (the release's schema) first.");
  console.log("Creating the tables (prisma db push)…");
  // The target goes through the environment, never on the command line. MIGRATION_DATABASE_URL too:
  // prisma.config.ts prefers it, and it must never point at another database here.
  const push = spawnSync("npx", ["prisma", "db", "push", `--schema=${schema}`], {
    env: { ...process.env, DATABASE_URL: target, MIGRATION_DATABASE_URL: target },
    stdio: "inherit",
  });
  if (push.status !== 0) throw new Error("prisma db push failed.");
}

async function main() {
  const { backup, target, createSchema: withSchema } = parseArgs(process.argv.slice(2));
  const opened = await openBackup(backup);
  try {
    const meta = await readBackupMeta(opened.dir);
    if (!meta) throw new Error(`${backup} is not a complete backup (no valid metadata.json).`);
    console.log(`Backup ${meta.id}: ${meta.tables.length} tables, ${meta.totalRows} rows, made ${meta.createdAt}${opened.encrypted ? " (decrypted)" : ""}`);
    await assertSafeTarget(opened.dir, target);
    if (withSchema) createSchema(opened.dir, target);
    console.log("Restoring…");
    const report = await restoreBackup(opened.dir, target, (line) => console.log(line));
    console.log(`Done: ${report.tables} tables, ${report.rows} rows, ${report.sequences} counters reset.`);
  } finally {
    await opened.cleanup();
  }
}

// Run only as a command (scripts/db-restore-test.ts imports the helpers above).
if (process.argv[1] && path.basename(process.argv[1]).startsWith("db-restore.")) {
  main()
    .catch((error) => {
      console.error("Restore failed:", error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => {
      setTimeout(() => process.exit(process.exitCode ?? 0), 100).unref();
    });
}
