import "server-only";
import { inflateSync } from "node:zlib";
import sharp, { type Sharp, type SharpOptions } from "sharp";
import { siteConfig } from "@/config/site";
import { AppError } from "@/lib/errors";
import { listingPhotoVariantKeys, OG_IMAGE_SIZE, PHOTO_MAX_SIDE } from "@/lib/media";
import { deletePublic } from "@/lib/storage";

/**
 * Image pipeline (server-only, sharp/libvips).
 *
 * Every uploaded image is decoded and RE-ENCODED: nothing the visitor uploaded is served as-is.
 * Re-encoding drops all metadata (EXIF incl. GPS location, XMP, IPTC, ICC, comments) and any
 * payload hidden after the image data.
 *
 *   const info = await validateImage(buffer);           // throws ImageValidationError
 *   const photo = await processListingPhoto(buffer);    // lg/md/sm WebP + og JPEG + blur + phash
 *   const doc = await processPrivateImage(buffer);      // ID / ticket screenshots, no watermark
 *   checkPdf(buffer);                                   // cheap PDF malware defence
 *   await scanFile(buffer, mime);                       // optional external malware scanner
 */

// ─── Errors ───────────────────────────────────────────────────

export const IMAGE_ERROR_CODES = [
  "file_too_large",
  "file_type_not_allowed",
  /** An iPhone photo in HEIC: refused with a message that says how to send it as JPEG. */
  "heic_not_supported",
  "image_too_small",
  "image_corrupt",
  "file_rejected",
  "file_scan_failed",
] as const;
export type ImageErrorCode = (typeof IMAGE_ERROR_CODES)[number];

const STATUS: Record<ImageErrorCode, number> = {
  file_too_large: 413,
  file_type_not_allowed: 415,
  heic_not_supported: 415,
  image_too_small: 422,
  image_corrupt: 422,
  file_rejected: 422,
  file_scan_failed: 503,
};

/** A file was refused. `code` has a message in messages/<locale>/uploads.json (errors.<code>). */
export class ImageValidationError extends AppError {
  declare readonly code: ImageErrorCode;

  constructor(code: ImageErrorCode, message?: string) {
    super(code, message ?? code, { status: STATUS[code] });
  }
}

// ─── Validation ───────────────────────────────────────────────

/** Photos whose short side is smaller than this are refused (too blurry for a gallery). */
export const MIN_PHOTO_SHORT_SIDE = 400;
/** Decompression-bomb guard: 100 megapixels is far above any phone camera. */
const MAX_INPUT_PIXELS = 100_000_000;

/** What sniffImageFormat recognises. Only ACCEPTED_IMAGE_FORMATS are ever decoded. */
export type ImageFormat = "jpeg" | "png" | "webp" | "avif" | "heic" | "gif";

/**
 * The upload formats (SECURITY_REPORT 9.a, founder's answers L7 and Q2): JPEG, PNG and WebP.
 * HEIC is refused with "heic_not_supported" (iPhones send JPEG on their own when a site does not
 * offer HEIC: UPLOAD_IMAGE_ACCEPT in @/lib/media); AVIF and GIF with "file_type_not_allowed".
 * Refused formats never reach a decoder: the check is on the first bytes, before sharp.
 */
export const ACCEPTED_IMAGE_FORMATS = ["jpeg", "png", "webp"] as const;
export type AcceptedImageFormat = (typeof ACCEPTED_IMAGE_FORMATS)[number];

export function isAcceptedImageFormat(format: ImageFormat | null): format is AcceptedImageFormat {
  return format !== null && (ACCEPTED_IMAGE_FORMATS as readonly string[]).includes(format);
}

export const IMAGE_MIME_TYPES: Record<ImageFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  gif: "image/gif",
};

const INPUT_OPTIONS: SharpOptions = {
  failOn: "error",
  limitInputPixels: MAX_INPUT_PIXELS,
  // Animated WebP: only the first frame.
  pages: 1,
};

const HEIF_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"]);
const AVIF_BRANDS = new Set(["avif", "avis"]);

/**
 * Detects the format from the first bytes (magic numbers) — before libvips sees the file, so
 * SVG, TIFF, PDF, PSD and other loaders are never reachable from an upload.
 */
export function sniffImageFormat(buffer: Buffer): ImageFormat | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  const ascii = (start: number, end: number) => buffer.toString("latin1", start, end);
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (ascii(4, 8) === "ftyp") {
    // ISO-BMFF: major brand at 8..12, compatible brands after the minor version (16..box end).
    const boxSize = Math.min(buffer.readUInt32BE(0), buffer.length, 64);
    const brands = [ascii(8, 12)];
    for (let i = 16; i + 4 <= boxSize; i += 4) brands.push(ascii(i, i + 4));
    if (brands.some((b) => AVIF_BRANDS.has(b))) return "avif";
    if (brands.some((b) => HEIF_BRANDS.has(b))) return "heic";
  }
  return null;
}

export type ImageInfo = { format: AcceptedImageFormat; width: number; height: number };

/**
 * Checks an uploaded image: allowed type (JPEG, PNG or WebP, from its first bytes; HEIC →
 * "heic_not_supported", AVIF, GIF, SVG and anything else → "file_type_not_allowed"), size ≤
 * maxBytes, short side ≥ minShortSide, and that it actually decodes as the same type. Width/height
 * are as displayed (EXIF orientation applied). Throws ImageValidationError.
 */
export async function validateImage(
  buffer: Buffer,
  opts: { maxBytes?: number; minShortSide?: number } = {},
): Promise<ImageInfo> {
  const maxBytes = opts.maxBytes ?? siteConfig.listings.maxPhotoBytes;
  const minShortSide = opts.minShortSide ?? MIN_PHOTO_SHORT_SIDE;

  if (!buffer || buffer.length === 0) throw new ImageValidationError("image_corrupt", "Empty file");
  if (buffer.length > maxBytes) throw new ImageValidationError("file_too_large");

  const format = sniffImageFormat(buffer);
  if (format === "heic") throw new ImageValidationError("heic_not_supported", "HEIC photos are not accepted");
  if (!isAcceptedImageFormat(format)) throw new ImageValidationError("file_type_not_allowed", format ? `${format} is not accepted` : undefined);

  let width: number;
  let height: number;
  try {
    const meta = await sharp(buffer, INPUT_OPTIONS).metadata();
    // The decoder must agree with the first bytes (a JPEG header on a file libvips reads as
    // something else is refused).
    if (meta.format !== format) throw new ImageValidationError("file_type_not_allowed");
    width = meta.autoOrient?.width ?? meta.width;
    height = meta.autoOrient?.height ?? meta.height;
    // Decode a tiny version: catches truncated files.
    await sharp(buffer, INPUT_OPTIONS).resize(8, 8, { fit: "inside" }).raw().toBuffer();
  } catch (error) {
    if (error instanceof ImageValidationError) throw error;
    const message = (error as Error)?.message ?? "";
    if (/pixel limit/i.test(message)) throw new ImageValidationError("file_too_large", message);
    throw new ImageValidationError("image_corrupt", message);
  }

  if (!width || !height) throw new ImageValidationError("image_corrupt", "No dimensions");
  if (Math.min(width, height) < minShortSide) throw new ImageValidationError("image_too_small");
  return { format, width, height };
}

// ─── Perceptual hash (dHash) ──────────────────────────────────

/** The bottom band left out of the hash: our watermark lives there (see watermarkSvg). */
const HASH_IGNORED_BOTTOM = 0.12;

/**
 * 64-bit difference hash as 16 hex characters. Robust to re-encoding, resizing and small
 * colour changes; used to find the same photo in other listings (Hamming distance ≤ 6).
 * The bottom 12% is ignored so a watermarked copy downloaded from our site still matches.
 */
export async function perceptualHash(input: Buffer | Sharp): Promise<string> {
  const oriented = Buffer.isBuffer(input) ? sharp(input, INPUT_OPTIONS).rotate() : input.clone();
  const { data, info } = await oriented
    .flatten({ background: "#ffffff" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const height = Math.max(1, Math.round(info.height * (1 - HASH_IGNORED_BOTTOM)));
  const pixels = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .extract({ left: 0, top: 0, width: info.width, height })
    .resize(9, 8, { fit: "fill", kernel: "lanczos3" })
    .greyscale()
    .raw()
    .toBuffer();
  // One hex digit per 4 comparisons, row by row (most significant bit first).
  let hex = "";
  let nibble = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      nibble = (nibble << 1) | (pixels[y * 9 + x] > pixels[y * 9 + x + 1] ? 1 : 0);
      if (x % 4 === 3) {
        hex += nibble.toString(16);
        nibble = 0;
      }
    }
  }
  return hex;
}

const HASH_PATTERN = /^[0-9a-f]{16}$/i;

export function isPerceptualHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

/** Number of differing bits between two 64-bit hex hashes (64 when either is invalid). */
export function hammingDistance(a: string, b: string): number {
  if (!isPerceptualHash(a) || !isPerceptualHash(b)) return 64;
  let count = 0;
  for (let i = 0; i < 16; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      count += x & 1;
      x >>= 1;
    }
  }
  return count;
}

// ─── Listing photos ───────────────────────────────────────────

export type ProcessedListingPhoto = {
  lg: Buffer;
  md: Buffer;
  sm: Buffer;
  og: Buffer;
  /** Size of lg. */
  width: number;
  height: number;
  /** Tiny WebP as a data URL for blurred placeholders. */
  blurDataUrl: string;
  phash: string;
};

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

/**
 * A light watermark in the bottom-right corner: a small house mark (vector, needs no font) and
 * the site name, white at ~45% opacity with a soft dark outline so it shows on light photos too.
 * Images are not mirrored for right-to-left languages, so the corner is the same everywhere.
 */
function watermarkSvg(width: number, height: number): Buffer {
  const fontSize = Math.round(Math.min(56, Math.max(14, width * 0.032)));
  const margin = Math.round(fontSize * 0.75);
  const mark = fontSize * 1.05;
  const baseline = height - margin;
  const textEnd = width - margin;
  const name = escapeXml(siteConfig.name);
  // Rough text width so the mark sits just before the name (average glyph ≈ 0.6em).
  const textWidth = siteConfig.name.length * fontSize * 0.6;
  const markX = textEnd - textWidth - mark * 1.25;
  const markY = baseline - mark * 0.88;
  const stroke = Math.max(1, fontSize / 14);
  const house = [
    `M ${markX} ${markY + mark * 0.45}`,
    `L ${markX + mark / 2} ${markY}`,
    `L ${markX + mark} ${markY + mark * 0.45}`,
    `L ${markX + mark * 0.86} ${markY + mark * 0.45}`,
    `L ${markX + mark * 0.86} ${markY + mark}`,
    `L ${markX + mark * 0.14} ${markY + mark}`,
    `L ${markX + mark * 0.14} ${markY + mark * 0.45}`,
    "Z",
  ].join(" ");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<g opacity="0.45" fill="#ffffff" stroke="#000000" stroke-opacity="0.35" stroke-width="${stroke}" stroke-linejoin="round">` +
      `<path d="${house}"/>` +
      `<text x="${textEnd}" y="${baseline}" text-anchor="end" font-family="DejaVu Sans, Noto Sans, Liberation Sans, Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize}" paint-order="stroke">${name}</text>` +
      `</g></svg>`,
  );
}

type RawImage = { data: Buffer; width: number; height: number; channels: 3 };

function fromRaw(raw: RawImage): Sharp {
  return sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: raw.channels } });
}

async function resizeRaw(raw: RawImage, maxSide: number): Promise<RawImage> {
  if (Math.max(raw.width, raw.height) <= maxSide) return raw;
  const { data, info } = await fromRaw(raw)
    .resize({ width: maxSide, height: maxSide, fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: 3 };
}

async function watermarkedWebp(raw: RawImage, quality: number): Promise<Buffer> {
  return fromRaw(raw)
    .composite([{ input: watermarkSvg(raw.width, raw.height), top: 0, left: 0 }])
    .webp({ quality, effort: 4 })
    .toBuffer();
}

/**
 * Turns an uploaded photo into what we store and serve:
 * lg (≤1600 px) and md (≤800 px) WebP with a light watermark, sm (≤400 px) WebP for cards,
 * og 1200×630 JPEG (cover crop) for sharing previews, a tiny blur placeholder and a dHash.
 * EXIF orientation is applied first, then everything else is dropped (pixels are decoded to raw
 * RGB, so no EXIF/GPS/XMP/ICC block can survive). Transparent areas become white.
 */
export async function processListingPhoto(buffer: Buffer): Promise<ProcessedListingPhoto> {
  let base: RawImage;
  try {
    const { data, info } = await sharp(buffer, INPUT_OPTIONS)
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({ width: PHOTO_MAX_SIDE.lg, height: PHOTO_MAX_SIDE.lg, fit: "inside", withoutEnlargement: true })
      .toColourspace("srgb")
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    base = { data, width: info.width, height: info.height, channels: 3 };
  } catch (error) {
    throw new ImageValidationError("image_corrupt", (error as Error)?.message);
  }

  const mdRaw = await resizeRaw(base, PHOTO_MAX_SIDE.md);
  const smRaw = await resizeRaw(mdRaw, PHOTO_MAX_SIDE.sm);

  const [lg, md, sm, og, blur, phash] = await Promise.all([
    watermarkedWebp(base, 80),
    watermarkedWebp(mdRaw, 78),
    fromRaw(smRaw).webp({ quality: 74, effort: 4 }).toBuffer(),
    fromRaw(base)
      .resize(OG_IMAGE_SIZE.width, OG_IMAGE_SIZE.height, { fit: "cover", position: sharp.strategy.attention })
      .jpeg({ quality: 82, mozjpeg: true, progressive: true })
      .toBuffer(),
    fromRaw(smRaw).resize(16, 16, { fit: "inside" }).webp({ quality: 40 }).toBuffer(),
    perceptualHash(fromRaw(smRaw)),
  ]);

  return {
    lg,
    md,
    sm,
    og,
    width: base.width,
    height: base.height,
    blurDataUrl: `data:image/webp;base64,${blur.toString("base64")}`,
    phash,
  };
}

/** Deletes every stored variant of an uploaded listing photo (no-op for external demo photos). */
export async function removeListingPhotoFiles(photo: { storageKey?: string | null }): Promise<void> {
  const key = photo.storageKey;
  if (!key || !key.startsWith("listings/")) return;
  const results = await Promise.allSettled(listingPhotoVariantKeys(key).map((variant) => deletePublic(variant)));
  for (const result of results) {
    if (result.status === "rejected") console.error("[images] could not delete a photo file:", result.reason);
  }
}

// ─── Private images (ID documents, ticket screenshots) ───────

export const PRIVATE_IMAGE_MAX_SIDE = 2400;

/**
 * Re-encodes a private image (JPEG, max 2400 px, orientation applied, all metadata removed,
 * no watermark — staff must be able to read the document).
 */
export async function processPrivateImage(
  buffer: Buffer,
): Promise<{ body: Buffer; contentType: "image/jpeg"; width: number; height: number }> {
  try {
    const { data, info } = await sharp(buffer, INPUT_OPTIONS)
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({ width: PRIVATE_IMAGE_MAX_SIDE, height: PRIVATE_IMAGE_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .toColourspace("srgb")
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { body: data, contentType: "image/jpeg", width: info.width, height: info.height };
  } catch (error) {
    throw new ImageValidationError("image_corrupt", (error as Error)?.message);
  }
}

// ─── PDF ──────────────────────────────────────────────────────

/** Names that make a PDF run code or open things when viewed. */
const DANGEROUS_PDF_NAMES = new Set(["JavaScript", "JS", "Launch", "EmbeddedFile", "OpenAction", "AA", "RichMedia"]);
const PDF_NAME = /\/([^\s/<>[\]()%{}]+)/g;
const MAX_INFLATED_BYTES = 20 * 1024 * 1024;
const MAX_STREAMS_INSPECTED = 400;

function findDangerousName(text: string): string | null {
  for (const match of text.matchAll(PDF_NAME)) {
    // "#xx" escapes in names ("/J#61vaScript") are decoded before comparing.
    const name = match[1].replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    if (DANGEROUS_PDF_NAMES.has(name)) return name;
  }
  return null;
}

/**
 * Cheap malware defence for PDF uploads (ID / ownership documents): the file must start with
 * "%PDF-" and must not contain JavaScript, launch actions, embedded files, open actions or
 * rich media — also inside compressed object streams. Throws ImageValidationError:
 * "file_type_not_allowed" (not a PDF) or "file_rejected" (active content).
 * Scanned documents never need any of these features.
 */
export function checkPdf(buffer: Buffer, maxBytes = 10 * 1024 * 1024): void {
  if (buffer.length > maxBytes) throw new ImageValidationError("file_too_large");
  if (buffer.length < 8 || buffer.toString("latin1", 0, 5) !== "%PDF-") {
    throw new ImageValidationError("file_type_not_allowed", "Not a PDF");
  }
  const text = buffer.toString("latin1");
  const direct = findDangerousName(text);
  if (direct) throw new ImageValidationError("file_rejected", `PDF contains /${direct}`);

  // Dictionaries can hide inside Flate-compressed streams (object streams); inspect them too.
  const streamPattern = /stream\r?\n/g;
  let inflatedTotal = 0;
  let inspected = 0;
  for (const match of text.matchAll(streamPattern)) {
    if (inspected >= MAX_STREAMS_INSPECTED) break;
    const start = (match.index ?? 0) + match[0].length;
    const dictStart = text.lastIndexOf("<<", match.index);
    const header = dictStart >= 0 ? text.slice(dictStart, match.index) : "";
    if (!/\/FlateDecode/.test(header) || /\/DCTDecode|\/JPXDecode/.test(header)) continue;
    const end = text.indexOf("endstream", start);
    if (end < 0) break;
    inspected++;
    let inflated: Buffer;
    try {
      inflated = inflateSync(buffer.subarray(start, end), { maxOutputLength: MAX_INFLATED_BYTES - inflatedTotal });
    } catch {
      continue; // Broken or truncated stream: viewers ignore it too.
    }
    inflatedTotal += inflated.length;
    const hidden = findDangerousName(inflated.toString("latin1"));
    if (hidden) throw new ImageValidationError("file_rejected", `PDF stream contains /${hidden}`);
    if (inflatedTotal >= MAX_INFLATED_BYTES) break;
  }
}

// ─── External malware scan (optional) ─────────────────────────

/**
 * Pluggable malware scan, OFF unless MALWARE_SCAN_URL is set.
 *
 * Contract: POST <MALWARE_SCAN_URL> with the raw file as the body (Content-Type = the file's
 * type, Authorization: Bearer <MALWARE_SCAN_TOKEN> when set). The service answers JSON
 * `{ "infected": boolean, "signature"?: string }` — a thin wrapper around ClamAV (clamd) or a
 * cloud scanner is enough. A positive result throws "file_rejected"; when the scanner is set up
 * but unreachable the upload fails with "file_scan_failed" (fail closed).
 */
export async function scanFile(buffer: Buffer, mime: string): Promise<void> {
  const url = process.env.MALWARE_SCAN_URL?.trim();
  if (!url) return;
  const token = process.env.MALWARE_SCAN_TOKEN?.trim();
  let result: { infected?: unknown; signature?: unknown };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": mime || "application/octet-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: new Uint8Array(buffer),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    result = (await res.json()) as typeof result;
  } catch (error) {
    console.error("[images] malware scan unavailable:", error);
    throw new ImageValidationError("file_scan_failed");
  }
  if (result.infected === true) {
    console.warn(`[images] upload rejected by the malware scanner: ${String(result.signature ?? "unknown")}`);
    throw new ImageValidationError("file_rejected", "Malware detected");
  }
  if (result.infected !== false) throw new ImageValidationError("file_scan_failed", "Unexpected scanner answer");
}
