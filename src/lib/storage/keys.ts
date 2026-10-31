/**
 * Storage key rules (pure, client-safe).
 *
 * A key is a relative path such as "listings/clx123/9f2c….webp": letters, digits,
 * ".", "_", "-" and "/" only, no leading "/", no empty, "." or ".." segments.
 */

const KEY_PATTERN = /^[A-Za-z0-9._\-/]+$/;
export const MAX_KEY_LENGTH = 512;

export class InvalidStorageKeyError extends Error {
  constructor(key: string, reason: string) {
    super(`Invalid storage key "${key.slice(0, 80)}": ${reason}`);
    this.name = "InvalidStorageKeyError";
  }
}

/** Returns the reason a key is invalid, or null when it is fine. */
export function storageKeyProblem(key: unknown): string | null {
  if (typeof key !== "string" || key.length === 0) return "empty";
  if (key.length > MAX_KEY_LENGTH) return "too long";
  if (!KEY_PATTERN.test(key)) return "unsupported characters";
  if (key.startsWith("/")) return "leading slash";
  if (key.endsWith("/")) return "trailing slash";
  const segments = key.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) return "empty or relative segment";
  if (segments.some((s) => s.startsWith("."))) return "hidden file";
  return null;
}

export function isValidStorageKey(key: unknown): key is string {
  return storageKeyProblem(key) === null;
}

export function assertValidStorageKey(key: unknown): asserts key is string {
  const problem = storageKeyProblem(key);
  if (problem) throw new InvalidStorageKeyError(String(key), problem);
}

/** Public files are images only (listing photos, avatars, city photos). */
export const PUBLIC_CONTENT_TYPES: Record<string, string> = {
  webp: "image/webp",
  avif: "image/avif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
};

export function extensionOf(key: string): string {
  const name = key.slice(key.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** The content type a public key is served with, or null when the extension is not allowed. */
export function publicContentTypeFor(key: string): string | null {
  return PUBLIC_CONTENT_TYPES[extensionOf(key)] ?? null;
}

/** Joins key parts and checks the result: storageKey("listings", id, `${uuid}.webp`). */
export function storageKey(...parts: string[]): string {
  const key = parts.map((p) => p.replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");
  assertValidStorageKey(key);
  return key;
}

/** URL-encodes each segment (keys are already URL-safe, this is belt and braces). */
export function encodeKeyForUrl(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}
