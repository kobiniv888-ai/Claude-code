import { db } from "@/lib/db";
import { deleteExpiredReportScreenshots } from "@/lib/reports/retention";
import { deletePrivate, isValidStorageKey } from "@/lib/storage";
import { deletePhotosOfDeletedListings, deleteUnattachedPrivateUploads } from "@/lib/storage/cleanup";
import { isAuthorizedCron, runCronJob, unauthorized } from "../auth";

/**
 * GET /api/cron/cleanup — daily (vercel.json).
 * - deletes ended rate-limit windows and expired login / verification codes;
 * - deletes the ID and ownership documents of verification requests that were decided
 *   (approved or rejected) more than 7 days ago, and sets documentsDeletedAt — only
 *   "verified on [date] by [staff]" is kept (BRIEF §11);
 * - deletes the photo files of listings deleted more than 30 days ago, and private uploads
 *   never attached to a ticket, verification request or listing after 48 hours
 *   (see @/lib/storage/cleanup);
 * - deletes the screenshots of reports decided more than 180 days ago and sets
 *   attachmentsDeletedAt (round 3, brief 8.2; see @/lib/reports/retention).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DOCUMENT_RETENTION_DAYS = 7;
const BATCH = 200;

function documentKeys(documents: unknown): string[] {
  if (!Array.isArray(documents)) return [];
  return documents.flatMap((doc) => {
    const key = doc && typeof doc === "object" ? (doc as { key?: unknown }).key : null;
    return typeof key === "string" && isValidStorageKey(key) ? [key] : [];
  });
}

async function deleteDecidedDocuments(now: Date): Promise<{ requests: number; files: number; failed: number }> {
  const cutoff = new Date(now.getTime() - DOCUMENT_RETENTION_DAYS * 24 * 3600 * 1000);
  const requests = await db.verificationRequest.findMany({
    where: { status: { in: ["APPROVED", "REJECTED"] }, reviewedAt: { lt: cutoff }, documentsDeletedAt: null },
    select: { id: true, documents: true },
    orderBy: { reviewedAt: "asc" },
    take: BATCH,
  });
  let files = 0;
  let failed = 0;
  let done = 0;
  for (const request of requests) {
    const keys = documentKeys(request.documents);
    const results = await Promise.allSettled(keys.map((key) => deletePrivate(key)));
    const errors = results.filter((r) => r.status === "rejected");
    files += keys.length - errors.length;
    if (errors.length > 0) {
      // Keep documentsDeletedAt empty so the next run tries again.
      failed++;
      console.error(`[cron] could not delete documents of verification ${request.id}:`, errors.map((e) => (e as PromiseRejectedResult).reason));
      continue;
    }
    await db.verificationRequest.update({ where: { id: request.id }, data: { documentsDeletedAt: now } });
    done++;
  }
  return { requests: done, files, failed };
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();
  return runCronJob("cleanup", async () => {
    const now = new Date();
    const [rateLimits, verifications] = await Promise.all([
      db.rateLimit.deleteMany({ where: { resetAt: { lt: now } } }),
      db.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
    ]);
    const documents = await deleteDecidedDocuments(now);
    const deletedListingPhotos = await deletePhotosOfDeletedListings(now);
    const unattachedUploads = await deleteUnattachedPrivateUploads(now);
    const reportScreenshots = await deleteExpiredReportScreenshots(now);
    return {
      rateLimits: rateLimits.count,
      verificationCodes: verifications.count,
      documents,
      deletedListingPhotos,
      unattachedUploads,
      reportScreenshots,
    };
  });
}
