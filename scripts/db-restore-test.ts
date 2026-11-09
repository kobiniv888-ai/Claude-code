/**
 * The restore TEST (SECURITY_REPORT 12.4.d; procedure in docs/BACKUPS.md "Restore test"): restores
 * a backup into a SCRATCH database and checks that every table came back with the same number of
 * rows as the backup lists, then drops the scratch database. Run it before launch and once a month.
 *
 *   npm run db:restore-test                       a fresh backup of DATABASE_URL, restored and checked
 *   npm run db:restore-test -- backups/<time>     a backup folder (or its name)
 *   npm run db:restore-test -- <copy>.bkenc       an encrypted off-site copy (BACKUP_ENCRYPTION_KEY)
 *   npm run db:restore-test -- --latest-offsite   the newest off-site copy, downloaded first
 *
 *   RESTORE_TARGET_URL  optional: an EMPTY database to use (e.g. a new database on a Neon branch);
 *                       it is kept afterwards. Without it a scratch database named
 *                       bayit_restore_test_<time> is created next to DATABASE_URL (the user needs
 *                       the CREATEDB right; locally it has it) and dropped at the end.
 *   --keep              keep the scratch database (to look at it), print its name
 *
 * The output (tables, rows, minutes) is what goes into the monthly restore-test note (docs/BACKUPS.md).
 * A real-site backup is never restored into a codespace or a local database (scripts/db-restore.ts).
 */
import "../prisma/seed/esm-interop";
import "dotenv/config";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { backupRoot, createBackup, readBackupMeta, restoreBackup } from "@/lib/admin/maintenance/backup";
import { quoteIdent } from "@/lib/admin/maintenance/backup-format";
import { downloadOffsiteBackup, listOffsiteBackups, offsiteS3Client, requireOffsiteConfig } from "@/lib/admin/maintenance/offsite";
import { assertSafeTarget, createSchema, openBackup } from "./db-restore";

type Args = { backup?: string; latestOffsite: boolean; keep: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { latestOffsite: false, keep: false };
  for (const arg of argv) {
    if (arg === "--latest-offsite") args.latestOffsite = true;
    else if (arg === "--keep") args.keep = true;
    else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}`);
    else args.backup = arg;
  }
  return args;
}

/** The scratch database's URL: DATABASE_URL with another database name. */
function scratchUrl(base: string, name: string): string {
  const url = new URL(base);
  url.pathname = `/${name}`;
  return url.toString();
}

async function withAdmin<T>(base: string, run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: base });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = process.env.DATABASE_URL;
  const started = Date.now();
  const temp: string[] = [];

  // 1. Which backup.
  let backup = args.backup;
  if (args.latestOffsite) {
    const config = requireOffsiteConfig();
    const client = offsiteS3Client(config);
    const [latest] = await listOffsiteBackups(client, config, 1);
    if (!latest) throw new Error("No off-site copy found.");
    const work = await fs.mkdtemp(path.join(os.tmpdir(), "bayit-restore-test-"));
    temp.push(work);
    backup = path.join(work, path.basename(latest.key));
    await downloadOffsiteBackup(client, config, latest.key, backup);
    console.log(`Downloaded the newest off-site copy: ${latest.key}`);
  }
  if (!backup) {
    if (!source) throw new Error("DATABASE_URL is not set (copy .env.example to .env).");
    const meta = await createBackup({ userId: null, via: "cli" });
    // The dump holds every row: who made it goes to the audit log, as with npm run db:backup.
    await audit({ actorId: null, action: "maintenance.backup", targetType: "Backup", targetId: meta.id, details: { via: "cli", purpose: "restore_test", tables: meta.tables.length, rows: meta.totalRows } });
    backup = path.join(backupRoot(), meta.id);
    console.log(`Made a fresh backup: ${meta.id}`);
  }

  const opened = await openBackup(backup);
  let target = process.env.RESTORE_TARGET_URL?.trim() || "";
  let scratch: string | null = null;
  try {
    const meta = await readBackupMeta(opened.dir);
    if (!meta) throw new Error("Not a complete backup.");
    console.log(`Backup ${meta.id}: ${meta.tables.length} tables, ${meta.totalRows} rows, made ${meta.createdAt}${opened.encrypted ? " (decrypted)" : ""}`);

    // 2. Where to.
    if (!target) {
      if (!source) throw new Error("Set RESTORE_TARGET_URL (an empty database) or DATABASE_URL (a scratch database is made next to it).");
      scratch = `bayit_restore_test_${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}_${randomBytes(2).toString("hex")}`;
      await withAdmin(source, (client) => client.query(`CREATE DATABASE ${quoteIdent(scratch!)}`));
      target = scratchUrl(source, scratch);
      console.log(`Created the scratch database ${scratch}`);
    }
    await assertSafeTarget(opened.dir, target);

    // 3. Restore (tables from the backup's own schema).
    createSchema(opened.dir, target);
    const report = await restoreBackup(opened.dir, target, () => {});

    // 4. Check: every table's row count, read back from the restored database.
    const mismatches: string[] = [];
    await withAdmin(target, async (client) => {
      for (const table of meta.tables) {
        const { rows } = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${quoteIdent(table.name)}`);
        const count = Number(rows[0]?.n ?? -1);
        if (count !== table.rows) mismatches.push(`${table.name}: ${count} rows, the backup lists ${table.rows}`);
      }
    });
    const minutes = ((Date.now() - started) / 60000).toFixed(1);
    if (source) {
      await audit({
        actorId: null,
        action: "maintenance.restore_test",
        targetType: "Backup",
        targetId: meta.id,
        details: { passed: mismatches.length === 0, tables: report.tables, rows: report.rows, mismatches: mismatches.length, minutes: Number(minutes), encrypted: opened.encrypted },
      });
    }
    if (mismatches.length) {
      console.error(`RESTORE TEST FAILED: ${mismatches.length} table(s) differ:\n  ${mismatches.join("\n  ")}`);
      process.exitCode = 1;
    } else {
      console.log(`RESTORE TEST PASSED: ${report.tables} tables, ${report.rows} rows, every count matches (${minutes} min in all).`);
    }
  } finally {
    await opened.cleanup();
    for (const dir of temp) await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    if (scratch && source) {
      if (args.keep) console.log(`Kept the scratch database ${scratch} (drop it with: DROP DATABASE "${scratch}").`);
      else {
        await withAdmin(source, (client) => client.query(`DROP DATABASE IF EXISTS ${quoteIdent(scratch!)} WITH (FORCE)`)).catch((error) =>
          console.error(`Could not drop the scratch database ${scratch}:`, (error as Error).message),
        );
        console.log(`Dropped the scratch database ${scratch}.`);
      }
    }
  }
}

main()
  .catch((error) => {
    console.error("Restore test failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect().catch(() => undefined);
    setTimeout(() => process.exit(process.exitCode ?? 0), 100).unref();
  });
