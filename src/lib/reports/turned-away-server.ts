import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { recordIdMiss } from "@/lib/security/id-guess";
import { isOwnReportUpload, type ReportAttachment, type TurnedAwayData } from "./turned-away";

/**
 * Server checks for a turned-away report (round 3, brief 8.2), used by createTurnedAwayReport.
 *
 * - From a booking: it must be the reporter's own booking; the host is the booking's host.
 * - From a listing ("…" → "Report the host"): any listing that was published (not a draft or
 *   deleted), not the reporter's own; the host is its owner. A guest without a booking can report.
 * - Screenshots: each key must be the reporter's own upload with purpose "report" (recorded in
 *   PrivateUpload by POST /api/uploads/private) and not attached to another report yet.
 */

export type TurnedAwayTarget = { hostId: string; listingId: string | null; bookingId: string | null };
export type TargetProblem = "not_found" | "own_target";

export async function resolveTurnedAwayTarget(
  reporterId: string,
  input: Pick<TurnedAwayData, "bookingId" | "listingId">,
): Promise<{ ok: true; target: TurnedAwayTarget } | { ok: false; error: TargetProblem }> {
  if (input.bookingId) {
    const booking = await db.booking.findFirst({
      where: { id: input.bookingId, guestUserId: reporterId },
      select: { id: true, listingId: true, hostUserId: true },
    });
    if (!booking) {
      // 4.7.a: a burst of booking ids that match nothing alerts the founder (src/lib/security/id-guess.ts).
      await recordIdMiss("report", reporterId);
      return { ok: false, error: "not_found" };
    }
    if (booking.hostUserId === reporterId) return { ok: false, error: "own_target" };
    return { ok: true, target: { hostId: booking.hostUserId, listingId: booking.listingId, bookingId: booking.id } };
  }
  if (!input.listingId) return { ok: false, error: "not_found" };
  const listing = await db.listing.findFirst({
    where: { id: input.listingId, deletedAt: null, status: { notIn: ["DRAFT", "DELETED"] }, owner: { deletedAt: null } },
    select: { id: true, ownerId: true },
  });
  if (!listing) return { ok: false, error: "not_found" };
  if (listing.ownerId === reporterId) return { ok: false, error: "own_target" };
  return { ok: true, target: { hostId: listing.ownerId, listingId: listing.id, bookingId: null } };
}

/**
 * The screenshots to store, or null when one of them is not the reporter's own, unused report
 * upload. The stored type is the re-encoded one (JPEG), whatever the browser sent.
 */
export async function checkReportAttachments(
  reporterId: string,
  attachments: readonly ReportAttachment[],
  /** The transaction that will store the report (createTurnedAwayReport), so the check sees what it writes. */
  client: Prisma.TransactionClient | typeof db = db,
): Promise<ReportAttachment[] | null> {
  if (attachments.length === 0) return [];
  if (!attachments.every((a) => isOwnReportUpload(a.key, reporterId))) return null;
  const keys = attachments.map((a) => a.key);
  // One after the other: an interactive transaction runs one query at a time anyway.
  const uploads = await client.privateUpload.findMany({ where: { key: { in: keys }, userId: reporterId, purpose: "report" }, select: { key: true } });
  const used = await client.report.count({ where: { reporterId, OR: keys.map((key) => ({ attachments: { array_contains: [{ key }] } })) } });
  if (uploads.length !== keys.length || used > 0) return null;
  return attachments.map((a) => ({
    key: a.key,
    mime: a.key.endsWith(".webp") ? "image/webp" : "image/jpeg",
    bytes: a.bytes,
    name: a.name.slice(0, 200),
  }));
}
