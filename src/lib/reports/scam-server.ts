import "server-only";
import { db } from "@/lib/db";

/**
 * The listing a scam report is about, for the /help/report-scam page's "About listing #123" line:
 * only a listing that is or was on the site (not a draft or a deleted one), its number and title
 * (both public). Anyone may call it: it shows what the listing page shows.
 */
export async function findListingForScamReport(publicId: number): Promise<{ publicId: number; title: string } | null> {
  if (!Number.isSafeInteger(publicId) || publicId <= 0) return null;
  return db.listing.findFirst({
    where: { publicId, deletedAt: null, status: { notIn: ["DRAFT", "DELETED"] } },
    select: { publicId: true, title: true },
  });
}
