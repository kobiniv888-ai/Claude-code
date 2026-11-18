import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, hasStaffRights } from "@/lib/auth/session";
import { getPrivate } from "@/lib/storage";
import { isValidStorageKey } from "@/lib/storage/keys";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { canAccessTicketAttachment, isInlineImage, safeDownloadName } from "@/lib/tickets";

/**
 * GET /api/tickets/attachment?key=… — a ticket screenshot, decrypted from private storage.
 * Only the ticket's owner (files on public messages) and staff with the "tickets" permission
 * may download it. Everyone else gets 404, so the endpoint does not reveal which keys exist.
 */

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  // Even a mislabelled file can never run as a page.
  "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  "Cross-Origin-Resource-Policy": "same-origin",
} as const;

function notFound() {
  return new NextResponse("Not found", { status: 404, headers: PRIVATE_HEADERS });
}

const DOWNLOAD_LIMIT = { limit: 120, windowSeconds: 60 };

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key") ?? "";
  if (!isValidStorageKey(key)) return notFound();

  const user = await getCurrentUser();
  if (!user || !user.twoFactorVerified) {
    return new NextResponse("Sign-in required", { status: 401, headers: PRIVATE_HEADERS });
  }

  const limit = await rateLimit(`ticket:attachment:${user.id}`, DOWNLOAD_LIMIT);
  if (!limit.ok) {
    return new NextResponse("Too many requests", {
      status: 429,
      headers: { ...PRIVATE_HEADERS, ...rateLimitHeaders(limit, DOWNLOAD_LIMIT.limit) },
    });
  }

  // Staff rights count only with 2-step login, as in the admin panel (src/lib/auth/staff-access.ts).
  const staffReady = hasStaffRights(user);
  const attachment = await canAccessTicketAttachment(key, { id: user.id, role: staffReady ? user.role : "USER" });
  if (!attachment) return notFound();

  let file: { body: Buffer; contentType: string };
  try {
    file = await getPrivate(key);
  } catch {
    return notFound();
  }

  const contentType = (file.contentType || attachment.mime || "application/octet-stream").toLowerCase();
  const inline = isInlineImage(contentType);
  const name = safeDownloadName(attachment.name, key.slice(key.lastIndexOf("/") + 1));
  const asciiName = name.replace(/[^\x20-\x7e]/g, "_");
  const disposition = `${inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`;

  return new NextResponse(new Uint8Array(file.body), {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": inline ? contentType : "application/octet-stream",
      "Content-Length": String(file.body.length),
      "Content-Disposition": disposition,
    },
  });
}
