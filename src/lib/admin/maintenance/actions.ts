"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { AdminActionError, runStaffAction } from "../server/common";
import { createBackup } from "./backup";
import { summarize, type BackupSummary } from "./backup-format";
import { backupGate, dryRunCleanup, runCleanup, type CleanupReport } from "./cleanups";
import { CLEANUP_NAMES } from "./plan";

/**
 * Admin → Maintenance (ADMIN only: the "settings" permission). Every call checks the staff session
 * with 2-step login (runStaffAction) and is rate-limited per admin; the backup and every run are
 * written to the audit log. A run also needs a backup from the last hour (./cleanups.ts).
 */

const nameInput = z.object({ name: z.enum(CLEANUP_NAMES) });
const runInput = nameInput.extend({ confirm: z.literal(true) });

/** "גיבוי מלא": a full backup to backups/<time>/. */
export async function createBackupAction(): Promise<ActionResult<{ backup: BackupSummary; backups: BackupSummary[] }>> {
  return runStaffAction(
    "settings",
    "maintenance.backup",
    async (staff) => {
      let backup: BackupSummary;
      try {
        backup = summarize(await createBackup({ userId: staff.id, via: "admin" }));
      } catch (error) {
        console.error("[maintenance] backup failed:", error);
        // A code the page explains (a status below 500 keeps the code; see toActionError).
        throw new AdminActionError("backup_failed", 409);
      }
      await audit({
        actorId: staff.id,
        action: "maintenance.backup",
        targetType: "Backup",
        targetId: backup.id,
        details: { tables: backup.tables, rows: backup.totalRows, bytes: backup.totalBytes, pgDump: backup.pgDump },
      });
      return ok({ backup, backups: (await backupGate(5)).backups });
    },
    { limit: { limit: 6, windowSeconds: 3600 }, freshProof: "window" },
  );
}

/**
 * The dry run of one clean-up: counts and a few masked examples, nothing changed. Written to the
 * audit log too (SECURITY_REPORT 12.6.d: who looked at what a clean-up would touch); it changes
 * nothing, so a failed audit write does not stop it.
 */
export async function dryRunCleanupAction(input: unknown): Promise<ActionResult<CleanupReport>> {
  return runStaffAction(
    "settings",
    "maintenance.dry_run",
    async (staff) => {
      const parsed = nameInput.safeParse(input);
      if (!parsed.success) return fail("invalid_input");
      const report = await dryRunCleanup(parsed.data.name);
      await audit({
        actorId: staff.id,
        action: "maintenance.dry_run",
        targetType: "Cleanup",
        targetId: parsed.data.name,
        details: { changes: report.changes, lines: Object.fromEntries(report.lines.map((l) => [l.key, l.count])) },
      });
      return ok(report);
    },
    { limit: 60, windowSeconds: 3600 },
  );
}

/** Runs one clean-up. Needs { confirm: true } and a backup from the last hour. */
export async function runCleanupAction(input: unknown): Promise<ActionResult<CleanupReport>> {
  return runStaffAction(
    "settings",
    "maintenance.run",
    async (staff) => {
      const parsed = runInput.safeParse(input);
      if (!parsed.success) return fail("invalid_input");
      return ok(await runCleanup(parsed.data.name, { userId: staff.id, via: "admin" }));
    },
    { limit: { limit: 12, windowSeconds: 3600 }, freshProof: "consume" },
  );
}
