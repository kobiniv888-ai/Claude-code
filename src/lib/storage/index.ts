import "server-only";
import { absoluteUrl as siteAbsoluteUrl } from "@/lib/site-url";
import { decrypt, encrypt } from "@/lib/crypto";
import { NotFoundError } from "@/lib/errors";
import { assertValidStorageKey, encodeKeyForUrl, publicContentTypeFor } from "./keys";
import { deleteLocal, readLocal, writeLocal } from "./local";
import { deleteS3, getS3, putS3, s3Config, s3PublicUrl } from "./s3";

/**
 * File storage (server-only). Two areas:
 *
 * - public:  listing photos, avatars, city photos. Served to everyone with long caching.
 *            Images only; the key's extension must match the content type.
 * - private: ID and ownership documents. ALWAYS encrypted (AES-256-GCM, @/lib/crypto)
 *            before they leave this module, never served by a public URL.
 *
 * STORAGE_DRIVER = "local" (default: ./storage/public, ./storage/private) or "s3"
 * (Cloudflare R2, Supabase Storage, AWS S3 — see ./s3.ts for the variables).
 *
 *   const { url } = await putPublic(storageKey("listings", listing.id, `${id}.webp`), webp, "image/webp");
 *   await putPrivate(storageKey("verifications", request.id, "id-front.jpg"), file, "image/jpeg");
 */

export { storageKey, isValidStorageKey, assertValidStorageKey, InvalidStorageKeyError } from "./keys";

export type StorageDriverName = "local" | "s3";

export function storageDriver(): StorageDriverName {
  const value = process.env.STORAGE_DRIVER?.trim().toLowerCase();
  if (!value || value === "local") return "local";
  if (value === "s3") return "s3";
  throw new Error(`Unknown STORAGE_DRIVER "${value}" (use "local" or "s3")`);
}

const PUBLIC_CACHE_CONTROL = "public, max-age=31536000, immutable";

function assertPublicContentType(key: string, contentType: string) {
  const expected = publicContentTypeFor(key);
  if (!expected) throw new Error(`Public files must be images (.webp, .avif, .jpg, .png, .gif): "${key}"`);
  if (expected !== contentType.toLowerCase().split(";")[0].trim()) {
    throw new Error(`Content type ${contentType} does not match the file extension of "${key}"`);
  }
}

// ─── Public ───────────────────────────────────────────────────

/** URL of a public file: "/api/media/<key>" (local) or "<S3_PUBLIC_URL>/<key>" (s3). */
export function publicUrl(key: string): string {
  assertValidStorageKey(key);
  return storageDriver() === "s3" ? s3PublicUrl(key) : `/api/media/${encodeKeyForUrl(key)}`;
}

/** Absolute URL (for emails, sharing previews, structured data). */
export function absolutePublicUrl(key: string): string {
  const url = publicUrl(key);
  return url.startsWith("/") ? siteAbsoluteUrl(url) : url;
}

export async function putPublic(key: string, body: Buffer, contentType: string): Promise<{ key: string; url: string }> {
  assertValidStorageKey(key);
  assertPublicContentType(key, contentType);
  if (storageDriver() === "s3") {
    await putS3(s3Config().publicBucket, key, body, contentType, PUBLIC_CACHE_CONTROL);
  } else {
    await writeLocal("public", key, body);
  }
  return { key, url: publicUrl(key) };
}

export async function deletePublic(key: string): Promise<void> {
  assertValidStorageKey(key);
  if (storageDriver() === "s3") await deleteS3(s3Config().publicBucket, key);
  else await deleteLocal("public", key);
}

// ─── Private (encrypted) ──────────────────────────────────────

const ENVELOPE_VERSION = 1;

/** [version][content-type length (2 bytes)][content type][body] — the whole thing is then encrypted. */
function seal(body: Buffer, contentType: string): Buffer {
  const type = Buffer.from(contentType.slice(0, 255), "utf8");
  const header = Buffer.alloc(3);
  header.writeUInt8(ENVELOPE_VERSION, 0);
  header.writeUInt16BE(type.length, 1);
  return encrypt(Buffer.concat([header, type, body]));
}

function unseal(payload: Buffer): { body: Buffer; contentType: string } {
  const plain = decrypt(payload);
  if (plain.length < 3 || plain.readUInt8(0) !== ENVELOPE_VERSION) throw new Error("Unknown private file format");
  const typeLength = plain.readUInt16BE(1);
  const contentType = plain.subarray(3, 3 + typeLength).toString("utf8");
  return { body: plain.subarray(3 + typeLength), contentType };
}

/** Stores a private file, encrypted. */
export async function putPrivate(key: string, body: Buffer, contentType: string): Promise<{ key: string }> {
  assertValidStorageKey(key);
  const sealed = seal(body, contentType);
  if (storageDriver() === "s3") {
    await putS3(s3Config().privateBucket, key, sealed, "application/octet-stream", "private, no-store");
  } else {
    await writeLocal("private", key, sealed);
  }
  return { key };
}

/** Reads and decrypts a private file. Throws NotFoundError when it does not exist. */
export async function getPrivate(key: string): Promise<{ body: Buffer; contentType: string }> {
  assertValidStorageKey(key);
  const sealed =
    storageDriver() === "s3" ? await getS3(s3Config().privateBucket, key) : await readLocal("private", key);
  if (!sealed) throw new NotFoundError(`Private file not found: ${key}`);
  return unseal(sealed);
}

export async function deletePrivate(key: string): Promise<void> {
  assertValidStorageKey(key);
  if (storageDriver() === "s3") await deleteS3(s3Config().privateBucket, key);
  else await deleteLocal("private", key);
}
