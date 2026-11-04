import "server-only";
import { db } from "@/lib/db";
import { listingPhotoVariantKeys } from "@/lib/media";
import { deletePrivate, deletePublic } from "@/lib/storage";

/**
 * Storage hygiene for the daily cleanup job (/api/cron/cleanup).
 *
 * - Photos of listings that were deleted (soft delete, status DELETED) more than 30 days ago:
 *   every stored variant is removed and the photo row keeps no storage key. The row itself and
 *   its perceptual hash stay, so a scammer re-posting the same photos is still detected.
 * - Private uploads (ID documents, ticket and report screenshots, kosher certificates) that were never
 *   attached: POST /api/uploads/private records each key in PrivateUpload *before* storing the
 *   file. After 48 hours the job looks the key up where it can be attached — a ticket message
 *   of that user, a verification request of that user, a report of that user, or a listing's kosher certificate.
 *   Attached → the row is dropped (the file follows its ticket / request / listing from then
 *   on). Not attached → the file is deleted, then the row. A failed delete keeps the row, so
 *   the next run tries again.
 */

const DAY_MS = 24 * 3600 * 1000;
export const DELETED_LISTING_PHOTO_DAYS = 30;
export const UNATTACHED_UPLOAD_HOURS = 48;
const BATCH = 500;

export async function deletePhotosOfDeletedListings(now: Date = new Date()): Promise<{ photos: number; failed: number }> {
  const cutoff = new Date(now.getTime() - DELETED_LISTING_PHOTO_DAYS * DAY_MS);
  const photos = await db.listingPhoto.findMany({
    // Only our own uploads ("listings/…"); demo photos are external links.
    where: { storageKey: { startsWith: "listings/" }, listing: { status: "DELETED", deletedAt: { lt: cutoff } } },
    select: { id: true, storageKey: true },
    take: BATCH,
  });
  const done: string[] = [];
  let failed = 0;
  for (const photo of photos) {
    const results = await Promise.allSettled(listingPhotoVariantKeys(photo.storageKey!).map((key) => deletePublic(key)));
    const errors = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (errors.length > 0) {
      failed++;
      console.error(`[cleanup] could not delete the files of photo ${photo.id}:`, errors.map((e) => e.reason));
      continue;
    }
    done.push(photo.id);
  }
  if (done.length > 0) await db.listingPhoto.updateMany({ where: { id: { in: done } }, data: { storageKey: null } });
  return { photos: done.length, failed };
}

/** True when a ticket message, a verification request, a listing or a report uses this private upload. */
async function isAttached(upload: { key: string; userId: string; purpose: string }): Promise<boolean> {
  const byKey = [{ key: upload.key }];
  if (upload.purpose === "ticket") {
    return (await db.ticketMessage.count({ where: { authorId: upload.userId, attachments: { array_contains: byKey } } })) > 0;
  }
  if (upload.purpose === "verification") {
    const [requests, listings] = await Promise.all([
      db.verificationRequest.count({ where: { userId: upload.userId, documents: { array_contains: byKey } } }),
      db.listing.count({ where: { kosherCertPhotoKey: upload.key } }),
    ]);
    return requests + listings > 0;
  }
  if (upload.purpose === "report") {
    // Turned-away report screenshots (round 3): they follow the report from then on, and the
    // report's own retention deletes them (src/lib/reports/retention.ts).
    return (await db.report.count({ where: { reporterId: upload.userId, attachments: { array_contains: byKey } } })) > 0;
  }
  return true; // Unknown purpose: never delete what we cannot check.
}

export async function deleteUnattachedPrivateUploads(
  now: Date = new Date(),
): Promise<{ deleted: number; attached: number; failed: number }> {
  const cutoff = new Date(now.getTime() - UNATTACHED_UPLOAD_HOURS * 3600 * 1000);
  const uploads = await db.privateUpload.findMany({
    where: { createdAt: { lt: cutoff } },
    orderBy: { createdAt: "asc" },
    take: BATCH,
  });
  let deleted = 0;
  let attached = 0;
  let failed = 0;
  for (const upload of uploads) {
    if (await isAttached(upload)) {
      attached++;
    } else {
      try {
        await deletePrivate(upload.key);
        deleted++;
      } catch (error) {
        failed++;
        console.error(`[cleanup] could not delete unattached upload ${upload.key}:`, error);
        continue;
      }
    }
    await db.privateUpload.delete({ where: { key: upload.key } });
  }
  return { deleted, attached, failed };
}
