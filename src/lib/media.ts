/**
 * Media URLs (client-safe — no server imports).
 *
 * Uploaded listing photos are stored as four files next to each other
 * (see processListingPhoto in @/lib/images and POST /api/uploads/listing-photo):
 *
 *   listings/<listingId>/<photoId>-sm.webp    400 px   cards, thumbnails
 *   listings/<listingId>/<photoId>-md.webp    800 px   gallery on phones (watermarked)
 *   listings/<listingId>/<photoId>-lg.webp    1600 px  gallery / fullscreen (watermarked)
 *   listings/<listingId>/<photoId>-og.jpg     1200×630 WhatsApp / Facebook / Telegram previews
 *
 * `ListingPhoto.storageKey` holds the common prefix ("listings/<listingId>/<photoId>") and
 * `ListingPhoto.url` the lg URL. Demo photos have no storageKey and an external URL
 * (images.unsplash.com), which is resized by the image CDN with URL parameters instead.
 *
 *   <img src={photoUrl(photo, "md")} … />
 *
 * Public files are served from NEXT_PUBLIC_MEDIA_BASE_URL when set (production with S3/R2:
 * the same value as S3_PUBLIC_URL, e.g. "https://media.bayit.example"), otherwise from
 * "/api/media/" (local storage; with the s3 driver that route redirects to the bucket).
 */
import { absoluteUrl as siteAbsoluteUrl } from "@/lib/site-url";
import { encodeKeyForUrl } from "@/lib/storage/keys";

export const PHOTO_SIZES = ["sm", "md", "lg", "og"] as const;
export type PhotoSize = (typeof PHOTO_SIZES)[number];

/** Longest side in pixels of each WebP variant (og is a fixed 1200×630 crop). */
export const PHOTO_MAX_SIDE: Record<Exclude<PhotoSize, "og">, number> = { sm: 400, md: 800, lg: 1600 };
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

export type PhotoRef = { url: string; storageKey?: string | null };

/** Base URL for public files, always ending with "/". */
export function mediaBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_MEDIA_BASE_URL?.trim();
  if (!configured) return "/api/media/";
  return configured.endsWith("/") ? configured : `${configured}/`;
}

/** Storage key of one variant: "<storageKey>-md.webp", "<storageKey>-og.jpg". */
export function photoVariantKey(storageKey: string, size: PhotoSize): string {
  return size === "og" ? `${storageKey}-og.jpg` : `${storageKey}-${size}.webp`;
}

/** Every file stored for one uploaded photo (used to delete them). */
export function listingPhotoVariantKeys(storageKey: string): string[] {
  return PHOTO_SIZES.map((size) => photoVariantKey(storageKey, size));
}

/** Storage-key prefix of a listing photo: "listings/<listingId>/<photoId>". */
export function listingPhotoStorageKey(listingId: string, photoId: string): string {
  return `listings/${listingId}/${photoId}`;
}

const UNSPLASH_HOST = "images.unsplash.com";

function unsplashUrl(url: URL, size: PhotoSize): string {
  const params = url.searchParams;
  for (const name of ["w", "h", "q", "fit", "auto", "crop", "dpr"]) params.delete(name);
  if (size === "og") {
    params.set("w", String(OG_IMAGE_SIZE.width));
    params.set("h", String(OG_IMAGE_SIZE.height));
  } else {
    params.set("w", String(PHOTO_MAX_SIDE[size]));
  }
  params.set("q", "75");
  params.set("auto", "format");
  params.set("fit", "crop");
  return url.toString();
}

/**
 * The URL of a photo in the requested size.
 * - Uploaded photos (storageKey set): the stored variant under the public media URL.
 * - images.unsplash.com demo photos: the same image with size parameters.
 * - Anything else: the stored URL unchanged.
 */
export function photoUrl(photo: PhotoRef, size: PhotoSize): string {
  if (photo.storageKey) {
    return `${mediaBaseUrl()}${encodeKeyForUrl(photoVariantKey(photo.storageKey, size))}`;
  }
  try {
    const url = new URL(photo.url);
    if (url.protocol === "https:" && url.hostname === UNSPLASH_HOST) return unsplashUrl(url, size);
  } catch {
    // A relative URL — use it as it is.
  }
  return photo.url;
}

/** Absolute URL (for Open Graph tags, JSON-LD and emails). */
export function absoluteMediaUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return siteAbsoluteUrl(url);
}

// ─── Reverse image search (admin review) ──────────────────────

export type ReverseImageLinks = { googleLens: string; tinEye: string };

/**
 * "Search this photo online" links for the first-listing review (SECURITY_REPORT 9.m): Google Lens
 * and TinEye, both free, by the photo's public address. Nothing is uploaded by us: the staff
 * member opens the link in a new tab and the search site DOWNLOADS the photo itself and may keep
 * it, before the listing is published; Google Lens also ties the search to the staff member's
 * Google account, so the review page lists TinEye first and its hint says to use a work browser
 * profile that is not signed in to Google (reverse-image-privacy-1). Null for anything that is not
 * an absolute http(s) address (a stored URL we would not link to).
 */
export function reverseImageSearchLinks(imageUrl: string): ReverseImageLinks | null {
  // An absolute http(s) address, or a path on our own site ("/api/media/…"); nothing else.
  if (!/^https?:\/\//i.test(imageUrl) && !/^\/(?!\/)/.test(imageUrl)) return null;
  let url: URL;
  try {
    url = new URL(absoluteMediaUrl(imageUrl));
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const encoded = encodeURIComponent(url.toString());
  return {
    googleLens: `https://lens.google.com/uploadbyurl?url=${encoded}`,
    tinEye: `https://tineye.com/search?url=${encoded}`,
  };
}

// ─── Accepted uploads ─────────────────────────────────────────

/**
 * The image types every upload field offers (the file input's `accept`). JPEG, PNG and WebP only
 * (SECURITY_REPORT 9.a): leaving HEIC out makes an iPhone convert its photos to JPEG by itself
 * before sending them. A HEIC file that still arrives (dragged in, shared from Files) is converted
 * in the browser where it can be (readyForUpload in @/lib/media-client), else on the server
 * (prepareUploadImage in @/lib/images). The server checks the real bytes again (sniffImageFormat)
 * and refuses AVIF, GIF, SVG and everything else; "heic_not_supported" means a HEIC it could not
 * decode.
 */
export const UPLOAD_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

/** A picked file that is HEIC/HEIF by its type or name (converted before or after upload). */
export function isHeicFile(file: { type: string; name: string }): boolean {
  return /^image\/hei[cf](-sequence)?$/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

// ─── Private uploads ──────────────────────────────────────────

/** "report": turned-away report screenshots (round 3, brief 8.2; src/lib/reports/turned-away.ts). */
export const PRIVATE_UPLOAD_PURPOSES = ["verification", "ticket", "report"] as const;
export type PrivateUploadPurpose = (typeof PRIVATE_UPLOAD_PURPOSES)[number];

/** "private/<purpose>/<userId>/" — every private upload of that user for that purpose lives under it. */
export function privateUploadPrefix(purpose: PrivateUploadPurpose, userId: string): string {
  return `private/${purpose}/${userId}/`;
}

/**
 * True when `key` was uploaded by `userId` through POST /api/uploads/private (for `purpose`).
 * Verification requests and ticket messages MUST check this before attaching a key, so nobody
 * can attach (and later read) another user's document.
 */
export function isOwnPrivateUpload(key: unknown, userId: string, purpose: PrivateUploadPurpose): boolean {
  if (typeof key !== "string" || !userId) return false;
  const prefix = privateUploadPrefix(purpose, userId);
  if (!key.startsWith(prefix)) return false;
  const rest = key.slice(prefix.length);
  return /^[A-Za-z0-9_-]+\.(jpg|webp|pdf)$/.test(rest);
}
