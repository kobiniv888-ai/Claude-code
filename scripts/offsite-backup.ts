/**
 * The weekly encrypted off-site backup by hand (SECURITY_REPORT 12.4.b; docs/BACKUPS.md). The same
 * job as /api/cron/offsite-backup, for a first test or a copy before a risky change.
 *
 *   npm run backup:offsite                          make, encrypt, upload and verify one copy now
 *   npm run backup:offsite -- list                  the stored copies, newest first
 *   npm run backup:offsite -- download <name> [--out <file>]   one copy, still encrypted
 *
 * Reads OFFSITE_S3_* and BACKUP_ENCRYPTION_KEY from the environment (src/lib/admin/maintenance/
 * offsite-config.ts). Restore a downloaded copy with `npm run db:restore -- <file>.bkenc …`.
 */
import "../prisma/seed/esm-interop";
import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import {
  downloadOffsiteBackup,
  listOffsiteBackups,
  offsiteFailureReason,
  offsiteS3Client,
  requireOffsiteConfig,
  runAndRecordOffsiteBackup,
} from "@/lib/admin/maintenance/offsite";

const USAGE = "Usage: npm run backup:offsite [-- list | -- download <name> [--out <file>]]";

async function main() {
  const [command = "run", ...rest] = process.argv.slice(2);
  const config = requireOffsiteConfig();
  if (command === "run") {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
    const started = Date.now();
    const result = await runAndRecordOffsiteBackup("cli");
    console.log(`Off-site backup done in ${((Date.now() - started) / 1000).toFixed(1)} s: ${result.key}`);
    console.log(`  ${result.tables} tables, ${result.rows} rows, ${(result.bytes / 1024 / 1024).toFixed(2)} MB encrypted (key id ${result.keyId})`);
    console.log(`  locked (COMPLIANCE) until ${result.retainUntil}; downloaded again and checked.`);
    return;
  }
  const client = offsiteS3Client(config);
  if (command === "list") {
    const items = await listOffsiteBackups(client, config);
    if (!items.length) console.log(`No copies under ${config.prefix} yet.`);
    for (const item of items) console.log(`${item.key}  ${(item.bytes / 1024 / 1024).toFixed(2)} MB  ${item.lastModified ?? ""}`);
    return;
  }
  if (command === "download") {
    const name = rest.find((arg) => !arg.startsWith("--"));
    const outIndex = rest.indexOf("--out");
    if (!name) throw new Error(USAGE);
    const objectKey = name.includes("/") ? name : `${config.prefix}${name.endsWith(".bkenc") ? name : `${name}.bkenc`}`;
    const out = path.resolve(outIndex >= 0 && rest[outIndex + 1] ? rest[outIndex + 1]! : path.basename(objectKey));
    if (existsSync(out)) throw new Error(`${out} exists already.`);
    const bytes = await downloadOffsiteBackup(client, config, objectKey, out);
    console.log(`Downloaded ${objectKey} (${(bytes / 1024 / 1024).toFixed(2)} MB, still encrypted) to ${out}`);
    console.log("Restore it with: npm run db:restore -- <that file> --create-schema (BACKUP_ENCRYPTION_KEY and RESTORE_TARGET_URL set).");
    return;
  }
  throw new Error(USAGE);
}

main()
  .catch((error) => {
    const { step, reason } = offsiteFailureReason(error);
    console.error(`Off-site backup failed (${step}: ${reason}):`, error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect().catch(() => undefined);
    setTimeout(() => process.exit(process.exitCode ?? 0), 100).unref();
  });
