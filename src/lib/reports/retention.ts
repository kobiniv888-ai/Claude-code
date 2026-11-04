import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { deletePrivate } from "@/lib/storage";
import { parseReportAttachments, screenshotRetentionCutoff } from "./turned-away";

/**
 * Report screenshots are kept 180 days after the report was decided (resolved or dismissed),
 * then the daily cleanup (/api/cron/cleanup) deletes the files, empties Report.attachments and
 * sets attachmentsDeletedAt. The report itself, its text and the decision stay. A failed delete
 * keeps the list, so the next run tries again. Open reports keep their screenshots.
 */

const BATCH = 200;

export async function deleteExpiredReportScreenshots(now: Date = new Date()): Promise<{ reports: number; files: number; failed: number }> {
  const reports = await db.report.findMany({
    where: {
      status: { in: ["RESOLVED", "DISMISSED"] },
      handledAt: { lt: screenshotRetentionCutoff(now) },
      attachmentsDeletedAt: null,
      // Only reports that still have screenshots (no list, or an empty one: nothing to delete).
      NOT: [{ attachments: { equals: Prisma.AnyNull } }, { attachments: { equals: [] } }],
    },
    select: { id: true, attachments: true },
    orderBy: { handledAt: "asc" },
    take: BATCH,
  });
  let done = 0;
  let files = 0;
  let failed = 0;
  for (const report of reports) {
    const keys = parseReportAttachments(report.attachments).map((a) => a.key);
    const results = await Promise.allSettled(keys.map((key) => deletePrivate(key)));
    const errors = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    files += keys.length - errors.length;
    if (errors.length > 0) {
      failed++;
      console.error(`[cleanup] could not delete the screenshots of report ${report.id}:`, errors.map((e) => e.reason));
      continue;
    }
    await db.report.update({ where: { id: report.id }, data: { attachments: [], attachmentsDeletedAt: now } });
    done++;
  }
  return { reports: done, files, failed };
}
