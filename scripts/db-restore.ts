/**
 * Restores a backup made by `npm run db:backup` or Admin → Maintenance into an EMPTY database.
 * It refuses a database that has any rows, so it can never overwrite live data.
 *
 *   RESTORE_TARGET_URL=postgresql://user:pass@host:5432/newdb npm run db:restore -- backups/<time> --create-schema
 *
 *   <backup>         the backup folder (or just its name, looked up in backups/ or BACKUP_DIR)
 *   RESTORE_TARGET_URL  the database to fill (it must exist and be empty). `--target <url>` works
 *                    too, but npm prints its arguments, so the password would show on screen.
 *   --create-schema  first create the tables from the backup's schema.prisma (prisma db push)
 *
 * To restore the real site: create a new empty database at the host, restore into it, check it,
 * then point DATABASE_URL at it. A pg_dump file (database.dump), when present, can also be used
 * with `pg_restore --no-owner -d <url> database.dump`.
 */
import "../prisma/seed/esm-interop";
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { isBackupId } from "@/lib/admin/maintenance/backup-format";
import { backupRoot, readBackupMeta, restoreBackup } from "@/lib/admin/maintenance/backup";

const USAGE =
  "Usage: RESTORE_TARGET_URL=<empty database url> npm run db:restore -- <backup folder or name> [--create-schema]\n" +
  "   or: npm run db:restore -- <backup folder or name> --target <empty database url> [--create-schema]";

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

async function main() {
  const { backup, target, createSchema } = parseArgs(process.argv.slice(2));
  const dir = isBackupId(backup) && !existsSync(backup) ? path.join(backupRoot(), backup) : path.resolve(backup);
  const meta = await readBackupMeta(dir);
  if (!meta) throw new Error(`${dir} is not a complete backup (no valid metadata.json).`);
  console.log(`Backup ${meta.id}: ${meta.tables.length} tables, ${meta.totalRows} rows, made ${meta.createdAt}`);

  if (createSchema) {
    const schema = path.join(dir, "schema.prisma");
    if (!existsSync(schema)) throw new Error("The backup has no schema.prisma; create the tables with `npx prisma db push` first.");
    console.log("Creating the tables (prisma db push)…");
    // The target goes through the environment, never on the command line.
    const push = spawnSync("npx", ["prisma", "db", "push", `--schema=${schema}`], {
      env: { ...process.env, DATABASE_URL: target },
      stdio: "inherit",
    });
    if (push.status !== 0) throw new Error("prisma db push failed.");
  }

  console.log("Restoring…");
  const report = await restoreBackup(dir, target, (line) => console.log(line));
  console.log(`Done: ${report.tables} tables, ${report.rows} rows, ${report.sequences} counters reset.`);
}

main()
  .catch((error) => {
    console.error("Restore failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => process.exit(process.exitCode ?? 0), 100).unref();
  });
