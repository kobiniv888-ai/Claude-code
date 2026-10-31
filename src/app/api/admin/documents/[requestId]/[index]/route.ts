import { NextResponse } from "next/server";
import { isPdf, isRequestDocumentKey, isViewableImage, parseVerificationDocuments } from "@/lib/admin/documents";
import { requireStaffForAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isAppError } from "@/lib/errors";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getPrivate } from "@/lib/storage";
import { isValidStorageKey } from "@/lib/storage/keys";

/**
 * GET /api/admin/documents/<requestId>/<index> — one verification document, decrypted from
 * private storage, for staff with the "verifications" permission only. The key must be listed on
 * that request AND be the requesting user's own verification upload. Never cached; images and
 * PDFs open inline, anything else downloads.
 */

export const dynamic = "force-dynamic";

const BASE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

// A sandboxed, script-free document for images and downloads. Browsers' PDF viewers do not run in
// a sandboxed document, so PDFs get the same lock-down without the sandbox flag.
const IMAGE_CSP = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; sandbox";
const PDF_CSP = "default-src 'none'; object-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'";

const LIMIT = { limit: 240, windowSeconds: 60 };

function plain(status: number, text: string, extra: Record<string, string> = {}) {
  return new NextResponse(text, {
    status,
    headers: { ...BASE_HEADERS, "Content-Security-Policy": IMAGE_CSP, "Content-Type": "text/plain; charset=utf-8", ...extra },
  });
}

export async function GET(_request: Request, ctx: { params: Promise<{ requestId: string; index: string }> }) {
  let staffId: string;
  try {
    staffId = (await requireStaffForAction("verifications")).id;
  } catch (error) {
    if (isAppError(error) && error.status === 401) return plain(401, "Sign-in required");
    return plain(404, "Not found");
  }

  const limit = await rateLimit(`admin:documents:${staffId}`, LIMIT);
  if (!limit.ok) return plain(429, "Too many requests", rateLimitHeaders(limit, LIMIT.limit));

  const { requestId, index: rawIndex } = await ctx.params;
  const index = Number(rawIndex);
  if (!/^\d{1,3}$/.test(rawIndex) || !Number.isInteger(index) || requestId.length > 64) return plain(404, "Not found");

  const request = await db.verificationRequest.findUnique({
    where: { id: requestId },
    select: { userId: true, documents: true, documentsDeletedAt: true },
  });
  if (!request || request.documentsDeletedAt) return plain(404, "Not found");
  const doc = parseVerificationDocuments(request.documents)[index];
  if (!doc || !isValidStorageKey(doc.key) || !isRequestDocumentKey(doc.key, request.userId)) return plain(404, "Not found");

  let file: { body: Buffer; contentType: string };
  try {
    file = await getPrivate(doc.key);
  } catch {
    return plain(404, "Not found");
  }

  const contentType = (doc.mime || file.contentType || "application/octet-stream").toLowerCase();
  const pdf = isPdf(contentType);
  const inline = pdf || isViewableImage(contentType);
  const name = (doc.name || `document-${index + 1}`).replace(/[\r\n"\\]/g, "_");
  const asciiName = name.replace(/[^\x20-\x7e]/g, "_");

  return new NextResponse(new Uint8Array(file.body), {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      "Content-Security-Policy": pdf ? PDF_CSP : IMAGE_CSP,
      "Content-Type": inline ? contentType.split(";")[0].trim() : "application/octet-stream",
      "Content-Length": String(file.body.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
