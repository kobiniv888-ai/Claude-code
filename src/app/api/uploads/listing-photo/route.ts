import { randomUUID } from "node:crypto";
import { z } from "zod";
import { siteConfig } from "@/config/site";
import { requireUserForAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { IMAGE_MIME_TYPES, processListingPhoto, removeListingPhotoFiles, scanFile, validateImage } from "@/lib/images";
import { submitForPublication } from "@/lib/listing/lifecycle";
import { listingPhotoStorageKey, photoUrl, photoVariantKey } from "@/lib/media";
import { assertRateLimit } from "@/lib/rate-limit";
import { isPhotoOfOtherAccount } from "@/lib/risk";
import { assertNotShabbatMode } from "@/lib/settings";
import { putPublic } from "@/lib/storage";
import {
  assertContentLength,
  assertSameOrigin,
  errorResponse,
  formFile,
  MULTIPART_OVERHEAD_BYTES,
  parseFields,
  readForm,
  textField,
} from "../shared";

/**
 * POST /api/uploads/listing-photo   (multipart/form-data)
 *   listingId    the owner's listing (not deleted)
 *   file         JPEG, PNG, WebP, AVIF, GIF (first frame) or HEIC where supported; ≤ 15 MB
 *   roomTypeId   optional — a hotel room type of that listing
 *
 * → 201 { id, url, thumbUrl, width, height, isCover, blurDataUrl }
 * → { error: code } with 400 invalid_input · 401 auth_required · 403 forbidden (cross-site) · 404 not_found ·
 *   409 too_many_photos · 413 file_too_large · 415 file_type_not_allowed ·
 *   422 image_too_small | image_corrupt | file_rejected · 423 shabbat_mode · 429 rate_limited
 *
 * The photo is re-encoded (EXIF/GPS removed, watermark added) by processListingPhoto and stored
 * as listings/<listingId>/<photoId>-{sm,md,lg}.webp and -og.jpg. Deleting, reordering and
 * choosing the cover are server actions of the wizard (they call removeListingPhotoFiles).
 *
 * Phones should compress big photos before uploading (browser-image-compression), because
 * serverless hosts limit request bodies (Vercel: 4.5 MB).
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const UPLOAD_LIMIT = { limit: 60, windowSeconds: 3600 };

const fieldsSchema = z.object({
  listingId: z.string().min(1).max(64),
  roomTypeId: z.string().min(1).max(64).optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUserForAction();
    await assertNotShabbatMode();
    await assertRateLimit(`upload:photo:${user.id}`, UPLOAD_LIMIT);
    assertContentLength(request, siteConfig.listings.maxPhotoBytes + MULTIPART_OVERHEAD_BYTES);

    const form = await readForm(request, siteConfig.listings.maxPhotoBytes + MULTIPART_OVERHEAD_BYTES);
    const { listingId, roomTypeId } = parseFields(fieldsSchema, {
      listingId: textField(form, "listingId"),
      roomTypeId: textField(form, "roomTypeId"),
    });
    const file = formFile(form);
    if (file.size > siteConfig.listings.maxPhotoBytes) {
      throw new AppError("file_too_large", "Photo too large", { status: 413 });
    }

    // Ownership: only the owner's own, not deleted listing (and its own room type).
    const listing = await db.listing.findFirst({
      where: { id: listingId, ownerId: user.id, status: { not: "DELETED" } },
      select: { id: true, status: true, _count: { select: { photos: true } } },
    });
    if (!listing) throw new NotFoundError("Listing not found");
    if (roomTypeId) {
      const roomType = await db.roomType.findFirst({ where: { id: roomTypeId, listingId }, select: { id: true } });
      if (!roomType) throw new NotFoundError("Room type not found");
    }
    if (listing._count.photos >= siteConfig.listings.maxPhotos) {
      throw new AppError("too_many_photos", "Photo limit reached", { status: 409 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const info = await validateImage(buffer);
    await scanFile(buffer, IMAGE_MIME_TYPES[info.format]);
    const processed = await processListingPhoto(buffer);

    const photoId = randomUUID().replace(/-/g, "");
    const storageKey = listingPhotoStorageKey(listing.id, photoId);
    const stored = { storageKey };
    let lgUrl: string;
    try {
      const [lg] = await Promise.all([
        putPublic(photoVariantKey(storageKey, "lg"), processed.lg, "image/webp"),
        putPublic(photoVariantKey(storageKey, "md"), processed.md, "image/webp"),
        putPublic(photoVariantKey(storageKey, "sm"), processed.sm, "image/webp"),
        putPublic(photoVariantKey(storageKey, "og"), processed.og, "image/jpeg"),
      ]);
      lgUrl = lg.url;
    } catch (error) {
      await removeListingPhotoFiles(stored);
      throw error;
    }

    let photo: { id: string; isCover: boolean };
    try {
      photo = await db.$transaction(async (tx) => {
        // One upload at a time per listing, so the limit, order and cover stay consistent.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`listing-photos:${listing.id}`}))`;
        const [aggregate, coverCount] = await Promise.all([
          tx.listingPhoto.aggregate({ where: { listingId: listing.id }, _max: { sortOrder: true }, _count: true }),
          tx.listingPhoto.count({ where: { listingId: listing.id, isCover: true } }),
        ]);
        if (aggregate._count >= siteConfig.listings.maxPhotos) {
          throw new AppError("too_many_photos", "Photo limit reached", { status: 409 });
        }
        return tx.listingPhoto.create({
          data: {
            id: photoId,
            listingId: listing.id,
            roomTypeId: roomTypeId ?? null,
            storageKey,
            url: lgUrl,
            width: processed.width,
            height: processed.height,
            blurDataUrl: processed.blurDataUrl,
            phash: processed.phash,
            bytes: processed.lg.length,
            sortOrder: (aggregate._max.sortOrder ?? -1) + 1,
            isCover: coverCount === 0,
          },
          select: { id: true, isCover: true },
        });
      });
    } catch (error) {
      await removeListingPhotoFiles(stored);
      throw error;
    }

    // A photo added to a live listing is public at once. When it already belongs to another
    // account's listing (the duplicate-photo check), the automatic checks run again now.
    if (listing.status === "LIVE") {
      try {
        if (await isPhotoOfOtherAccount(processed.phash, listing.id, user.id)) await submitForPublication(listing.id, user.id);
      } catch (error) {
        console.error(`[uploads:listing-photo] re-check of live listing ${listing.id} failed:`, error);
      }
    }

    return Response.json(
      {
        id: photo.id,
        url: lgUrl,
        thumbUrl: photoUrl({ url: lgUrl, storageKey }, "sm"),
        width: processed.width,
        height: processed.height,
        isCover: photo.isCover,
        blurDataUrl: processed.blurDataUrl,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, "listing-photo");
  }
}
