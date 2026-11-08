import { NextResponse } from "next/server";
import { isOwnItem } from "@/lib/admin/server/common";
import { auditFileView } from "@/lib/admin/server/file-views";
import { canSeeReporter } from "@/lib/admin/staff-visibility";
import { requireStaffForAction, type CurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isAppError } from "@/lib/errors";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { isOwnReportUpload, parseReportAttachments } from "@/lib/reports/turned-away";
import { getPrivate } from "@/lib/storage";

/**
 * GET /api/admin/reports/<reportId>/<index> — one screenshot of a report, decrypted from private
 * storage, for staff with the "reports" permission only (round 3, brief 8.2). The key must be
 * listed on that report AND be the reporter's own "report" upload. Never cached; served as an
 * image in a sandboxed, script-free document. Every opening is written to the audit log
 * ("report.attachment_view", through auditFileView like a verification document: at most once per
 * staff member and screenshot every FILE_VIEW_DEDUPE_MINUTES (10) minutes; a failed audit write
 * is logged and never hides the file). Staff other than an ADMIN never open the screenshots of a
 * report about themselves or sent by them (the own-item rule of the report page and its actions,
 * SECURITY_REPORT 4.3.d): 404. The screenshots of a turned-away report are its sender's evidence
 * (the guest's chat with the host, often with their name): ADMIN only, like who sent it (Q12): 404
 * for other staff.
 */

export const dynamic = "force-dynamic";

const BASE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Robots-Tag": "noindex, nofollow",
  "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; sandbox",
} as const;

const LIMIT = { limit: 240, windowSeconds: 60 };
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function plain(status: number, text: string, extra: Record<string, string> = {}) {
  return new NextResponse(text, { status, headers: { ...BASE_HEADERS, "Content-Type": "text/plain; charset=utf-8", ...extra } });
}

export async function GET(_request: Request, ctx: { params: Promise<{ reportId: string; index: string }> }) {
  let staff: Pick<CurrentUser, "id" | "role">;
  try {
    staff = await requireStaffForAction("reports");
  } catch (error) {
    if (isAppError(error) && error.status === 401) return plain(401, "Sign-in required");
    return plain(404, "Not found");
  }

  const staffId = staff.id;
  const limit = await rateLimit(`admin:report-files:${staffId}`, LIMIT);
  if (!limit.ok) return plain(429, "Too many requests", rateLimitHeaders(limit, LIMIT.limit));

  const { reportId, index: rawIndex } = await ctx.params;
  const index = Number(rawIndex);
  if (!/^\d{1,2}$/.test(rawIndex) || !Number.isInteger(index) || reportId.length > 64) return plain(404, "Not found");

  const report = await db.report.findUnique({
    where: { id: reportId },
    select: { kind: true, reporterId: true, targetUserId: true, attachments: true, attachmentsDeletedAt: true, listing: { select: { ownerId: true } } },
  });
  if (!report || report.attachmentsDeletedAt || !report.reporterId) return plain(404, "Not found");
  if (report.kind === "TURNED_AWAY" && !canSeeReporter(staff)) return plain(404, "Not found");
  if (isOwnItem(staff, [report.reporterId, report.targetUserId, report.listing?.ownerId])) return plain(404, "Not found");
  const file = parseReportAttachments(report.attachments)[index];
  if (!file || !isOwnReportUpload(file.key, report.reporterId)) return plain(404, "Not found");

  let stored: { body: Buffer; contentType: string };
  try {
    stored = await getPrivate(file.key);
  } catch {
    return plain(404, "Not found");
  }
  const contentType = (stored.contentType || file.mime || "").toLowerCase().split(";")[0].trim();
  if (!IMAGE_TYPES.has(contentType)) return plain(404, "Not found");

  await auditFileView({ staffId, action: "report.attachment_view", targetType: "Report", targetId: reportId, index });

  return new NextResponse(new Uint8Array(stored.body), {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": contentType,
      "Content-Length": String(stored.body.length),
      "Content-Disposition": `inline; filename="report-${index + 1}.jpg"`,
    },
  });
}
