import "server-only";
import sharp from "sharp";
import { randomToken } from "@/lib/crypto";
import { prepareUploadImage } from "@/lib/images";
import { storageKey } from "@/lib/storage";

/** Profile photos: a square 400 px WebP, orientation applied, all metadata (EXIF/GPS) removed. */
export const AVATAR_SIZE = 400;
export const AVATAR_MAX_BYTES = 10 * 1024 * 1024;
const AVATAR_MIN_SIDE = 96;

/**
 * Checks (type, size, decodes) and re-encodes an uploaded photo: JPEG, PNG, WebP, or HEIC
 * converted on the server (prepareUploadImage; `userId` counts toward its decode limit). Avatars
 * are public, so no metadata may survive (proved in src/lib/images.test.ts). Throws
 * ImageValidationError.
 */
export async function processAvatar(buffer: Buffer, userId: string): Promise<Buffer> {
  const upload = await prepareUploadImage(buffer, { maxBytes: AVATAR_MAX_BYTES, minShortSide: AVATAR_MIN_SIDE, userId });
  return sharp(upload.buffer, { failOn: "error", limitInputPixels: 80_000_000, animated: false })
    .rotate()
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" })
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .webp({ quality: 82 })
    .toBuffer();
}

/** avatars/<userId>-<random>.webp — a new name each time, so caches never show the old photo. */
export function newAvatarKey(userId: string): string {
  return storageKey("avatars", `${userId}-${randomToken(9)}.webp`);
}
