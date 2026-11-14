import { readOffsiteConfig } from "@/lib/admin/maintenance/offsite-config";
import { runAndRecordOffsiteBackup } from "@/lib/admin/maintenance/offsite";
import { isAuthorizedCron, runCronJob, unauthorized } from "../auth";

/**
 * GET /api/cron/offsite-backup — weekly, Sunday night (vercel.json; SECURITY_REPORT 12.4.b).
 * A full backup, encrypted with BACKUP_ENCRYPTION_KEY and uploaded to the off-site bucket
 * (Backblaze B2, Object Lock COMPLIANCE for OFFSITE_RETENTION_DAYS), then downloaded again and
 * checked (src/lib/admin/maintenance/offsite.ts). Needs `Authorization: Bearer <CRON_SECRET>`
 * (compared in constant time, ../auth.ts).
 *
 * Without the off-site settings (a codespace, a preview) it answers { skipped: "not_configured" };
 * the real site cannot start without them (src/lib/startup-check.ts). A failure answers 500, is
 * reported to Sentry, and alerts the founder within the hour (security event offsite_backup_failed,
 * src/lib/security/alerts.ts).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();
  return runCronJob("offsite-backup", async () => {
    if (!readOffsiteConfig(process.env)) return { skipped: "not_configured" };
    const result = await runAndRecordOffsiteBackup("cron");
    return { key: result.key, bytes: result.bytes, tables: result.tables, rows: result.rows, retainUntil: result.retainUntil };
  });
}
