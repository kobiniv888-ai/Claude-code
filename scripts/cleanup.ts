/**
 * The data clean-ups (the same as Admin → Maintenance). A dry run changes nothing; a run needs a
 * full backup from the last hour (`npm run db:backup`), is written to the audit log and can be
 * repeated safely (a second run finds nothing left).
 *
 *   npm run cleanup -- phones --dry-run
 *   npm run cleanup -- all --dry-run
 *   npm run cleanup -- phones --run
 *
 * Names: phones, title-emoji, contact-taps, verification-files. Rules:
 * src/lib/admin/maintenance/plan.ts and cleanups.ts.
 */
import "../prisma/seed/esm-interop";
import "dotenv/config";
import { db } from "@/lib/db";
import { dryRunCleanup, runCleanup, type CleanupReport } from "@/lib/admin/maintenance/cleanups";
import { CLEANUP_NAMES, isCleanupName, type CleanupName } from "@/lib/admin/maintenance/plan";

const USAGE = `Usage: npm run cleanup -- <${CLEANUP_NAMES.join("|")}|all> --dry-run | --run`;

function print(report: CleanupReport) {
  console.log(`\n${report.name} (${report.mode === "run" ? "RUN" : "dry run"}): ${report.changes} ${report.mode === "run" ? "changed" : "to change"}`);
  for (const line of report.lines) console.log(`  ${line.warn ? "!" : " "} ${line.key.padEnd(26)} ${line.count}`);
  if (report.examples.length) {
    console.log("  examples:");
    for (const example of report.examples) console.log(`    ${example.from}${example.to === null ? "" : `  →  ${example.to}`}`);
  }
  if (report.backupId) console.log(`  backup: ${report.backupId}`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (copy .env.example to .env).");
  const args = process.argv.slice(2);
  const name = args.find((a) => !a.startsWith("--"));
  const dry = args.includes("--dry-run");
  const run = args.includes("--run");
  if (!name || dry === run) throw new Error(USAGE);
  if (name === "all") {
    if (run) throw new Error("Run the clean-ups one at a time (all works with --dry-run only).");
    for (const n of CLEANUP_NAMES) print(await dryRunCleanup(n));
    return;
  }
  if (!isCleanupName(name)) throw new Error(`Unknown clean-up "${name}".\n${USAGE}`);
  const report = run ? await runCleanup(name as CleanupName, { userId: null, via: "cli" }) : await dryRunCleanup(name as CleanupName);
  print(report);
}

main()
  .catch((error) => {
    const code = (error as { code?: string })?.code;
    if (code === "backup_required") console.error("Refused: make a full backup first (npm run db:backup); a run needs one from the last hour.");
    else if (code === "cleanup_running") console.error("Refused: this clean-up is already running.");
    else console.error("Clean-up failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
    setTimeout(() => process.exit(process.exitCode ?? 0), 100).unref();
  });
