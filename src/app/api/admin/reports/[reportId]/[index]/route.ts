import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireStaffForAction } from "@/lib/auth/session";
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
 * ("report.attachment_view", at most once per staff member, screenshot and half hour).
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
const AUDIT_DEDUPE_MS = 30 * 60 * 1000;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function plain(status: number, text: string, extra: Record<string, string> = {}) {
  return new NextResponse(text, { status, headers: { ...BASE_HEADERS, "Content-Type": "text/plain; charset=utf-8", ...extra } });
}

export async function GET(_request: Request, ctx: { params: Promise<{ reportId: string; index: string }> }) {
  let staffId: string;
  try {
    staffId = (await requireStaffForAction("reports")).id;
  } catch (error) {
    if (isAppError(error) && error.status === 401) return plain(401, "Sign-in required");
    return plain(404, "Not found");
  }

  const limit = await rateLimit(`admin:report-files:${staffId}`, LIMIT);
  if (!limit.ok) return plain(429, "Too many requests", rateLimitHeaders(limit, LIMIT.limit));

  const { reportId, index: rawIndex } = await ctx.params;
  const index = Number(rawIndex);
  if (!/^\d{1,2}$/.test(rawIndex) || !Number.isInteger(index) || reportId.length > 64) return plain(404, "Not found");

  const report = await db.report.findUnique({
    where: { id: reportId },
    select: { reporterId: true, attachments: true, attachmentsDeletedAt: true },
  });
  if (!report || report.attachmentsDeletedAt || !report.reporterId) return plain(404, "Not found");
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

  const recent = await db.auditLog.findFirst({
    where: {
      actorId: staffId,
      action: "report.attachment_view",
      targetType: "Report",
      targetId: reportId,
      createdAt: { gt: new Date(Date.now() - AUDIT_DEDUPE_MS) },
      details: { path: ["index"], equals: index },
    },
    select: { id: true },
  });
  if (!recent) await audit({ actorId: staffId, action: "report.attachment_view", targetType: "Report", targetId: reportId, details: { index } });

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
