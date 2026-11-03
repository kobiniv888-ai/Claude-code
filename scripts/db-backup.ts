/**
 * Full database backup: every table as JSON lines (one consistent snapshot), the Prisma schema,
 * and a pg_dump file when pg_dump is installed. The same as Admin → Maintenance → "גיבוי מלא".
 *
 *   npm run db:backup                 writes backups/<time>/ (BACKUP_DIR to change the folder)
 *
 * Restore: npm run db:restore -- backups/<time> --target <empty database url> --create-schema
 * Format: src/lib/admin/maintenance/backup-format.ts. backups/ is git-ignored: never commit it.
 */
import "../prisma/seed/esm-interop";
import "dotenv/config";
import path from "node:path";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { backupRoot, createBackup } from "@/lib/admin/maintenance/backup";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (copy .env.example to .env).");
  const started = Date.now();
  const meta = await createBackup({ userId: null, via: "cli" });
  await audit({
    actorId: null,
    action: "maintenance.backup",
    targetType: "Backup",
    targetId: meta.id,
    details: { via: "cli", tables: meta.tables.length, rows: meta.totalRows, bytes: meta.totalBytes, pgDump: !!meta.pgDump && "file" in meta.pgDump },
  });
  const dir = path.relative(process.cwd(), path.join(backupRoot(), meta.id)) || path.join(backupRoot(), meta.id);
  console.log(`Backup done in ${((Date.now() - started) / 1000).toFixed(1)} s: ${dir}`);
  console.log(`  ${meta.tables.length} tables, ${meta.totalRows} rows, ${(meta.totalBytes / 1024 / 1024).toFixed(2)} MB`);
  if (meta.pgDump && "file" in meta.pgDump) console.log(`  pg_dump: ${meta.pgDump.file} (${(meta.pgDump.bytes / 1024 / 1024).toFixed(2)} MB)`);
  else if (meta.pgDump) console.log(`  pg_dump failed (the JSON tables are complete): ${meta.pgDump.error}`);
  else console.log("  pg_dump is not installed (the JSON tables are complete).");
}

main()
  .catch((error) => {
    console.error("Backup failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
    setTimeout(() => process.exit(process.exitCode ?? 0), 100).unref();
  });
