import { z } from "zod";
import { siteConfig } from "@/config/site";
import { documentChecksOn } from "@/config/verification";
import { requireUserForAction } from "@/lib/auth/session";
import { randomToken } from "@/lib/crypto";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { checkPdf, IMAGE_MIME_TYPES, processPrivateImage, scanFile, validateImage } from "@/lib/images";
import { PRIVATE_UPLOAD_PURPOSES, privateUploadPrefix } from "@/lib/media";
import { assertRateLimit } from "@/lib/rate-limit";
import { assertNotShabbatMode } from "@/lib/settings";
import { putPrivate } from "@/lib/storage";
import {
  assertContentLength,
  assertSameOrigin,
  errorResponse,
  formFile,
  MULTIPART_OVERHEAD_BYTES,
  parseFields,
  readForm,
  sanitizeFileName,
  textField,
} from "../shared";

/**
 * POST /api/uploads/private   (multipart/form-data)
 *   purpose  "verification" (ID, selfie, NAPR extract, business registration) | "ticket" (screenshots)
 *   file     an image (≤ 15 MB), or for "verification" also a PDF (≤ 10 MB)
 *
 * → 201 { key, mime, bytes, name }
 * → { error: code } — same codes as /api/uploads/listing-photo.
 *
 * Images are re-encoded to JPEG (≤ 2400 px, metadata removed); PDFs pass checkPdf (no
 * JavaScript, launch actions, embedded files…). Files are stored ENCRYPTED with putPrivate under
 * private/<purpose>/<userId>/<random>.<ext> and are never publicly reachable.
 * Consumers (verification requests, ticket messages) must accept only keys of the current user:
 * isOwnPrivateUpload(key, user.id, purpose) from @/lib/media. Every upload is recorded in
 * PrivateUpload; the daily cleanup deletes files that were never attached after 48 hours.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const UPLOAD_LIMIT = { limit: 30, windowSeconds: 3600 };
const MAX_PDF_BYTES = 10 * 1024 * 1024;
/** Documents and screenshots may be smaller than gallery photos, but must stay readable. */
const MIN_SHORT_SIDE = { verification: 300, ticket: 16 } as const;

const fieldsSchema = z.object({ purpose: z.enum(PRIVATE_UPLOAD_PURPOSES) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUserForAction();
    // Before the body is read: bigger requests are refused without parsing them.
    assertContentLength(request, siteConfig.listings.maxPhotoBytes + MULTIPART_OVERHEAD_BYTES);
    const form = await readForm(request, siteConfig.listings.maxPhotoBytes + MULTIPART_OVERHEAD_BYTES);
    const { purpose } = parseFields(fieldsSchema, { purpose: textField(form, "purpose") });
    // No ID / ownership documents for now (founder's answer 5, round 3; src/config/verification.ts).
    if (purpose === "verification" && !documentChecksOn()) {
      throw new AppError("documents_paused", "Verification documents are not accepted", { status: 403 });
    }
    // Support pauses for Shabbat (admin setting); verification documents can always be sent.
    if (purpose === "ticket") await assertNotShabbatMode();
    await assertRateLimit(`upload:private:${user.id}`, UPLOAD_LIMIT);

    const file = formFile(form);
    if (file.size > siteConfig.listings.maxPhotoBytes) {
      throw new AppError("file_too_large", "File too large", { status: 413 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());

    let body: Buffer;
    let mime: string;
    let extension: "jpg" | "pdf";
    if (buffer.toString("latin1", 0, 5) === "%PDF-") {
      if (purpose !== "verification") {
        throw new AppError("file_type_not_allowed", "PDFs are accepted for verification only", { status: 415 });
      }
      checkPdf(buffer, MAX_PDF_BYTES);
      await scanFile(buffer, "application/pdf");
      body = buffer;
      mime = "application/pdf";
      extension = "pdf";
    } else {
      const info = await validateImage(buffer, { minShortSide: MIN_SHORT_SIDE[purpose] });
      await scanFile(buffer, IMAGE_MIME_TYPES[info.format]);
      const processed = await processPrivateImage(buffer);
      body = processed.body;
      mime = processed.contentType;
      extension = "jpg";
    }

    const key = `${privateUploadPrefix(purpose, user.id)}${randomToken(18)}.${extension}`;
    // Tracked before the file exists, so no file escapes the cleanup job: it deletes the file
    // when nothing references it after 48 hours (see /api/cron/cleanup).
    await db.privateUpload.create({ data: { key, userId: user.id, purpose } });
    await putPrivate(key, body, mime);

    return Response.json(
      {
        key,
        mime,
        bytes: body.length,
        name: sanitizeFileName(file.name, extension, extension === "pdf" ? "document" : "image"),
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, "private");
  }
}
