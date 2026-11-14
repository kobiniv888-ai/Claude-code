import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readSiteEnv } from "@/lib/site-env";

/**
 * Encryption and hashing helpers (server-only).
 *
 * - encrypt / decrypt: AES-256-GCM with APP_ENCRYPTION_KEY (base64, 32 bytes).
 *   Output layout: iv (12 bytes) + auth tag (16 bytes) + ciphertext.
 *   Used for ID documents in private storage and 2-step login secrets.
 * - hmacHash: HMAC-SHA256 with HASH_SALT, hex. Used for IPs and device ids in logs,
 *   so we can match "same device" without storing the raw value.
 *
 * On a development server of a development site (SITE_ENV=development) a key derived from
 * BETTER_AUTH_SECRET is used (with a warning) so the site runs without setup. Anywhere else
 * missing keys are an error.
 */

const IV_BYTES = 12;
const TAG_BYTES = 16;
/**
 * The development fallback keys are allowed only on a development server (`next dev`, tests,
 * scripts) of a development site (SITE_ENV=development). Everywhere else a missing key is an error
 * (the server would not even start: src/lib/startup-check.ts).
 */
const fallbackAllowed = () => process.env.NODE_ENV !== "production" && readSiteEnv() === "development";

let encryptionKey: Buffer | null = null;
let hashSalt: Buffer | null = null;
const warned = new Set<string>();

function devFallback(purpose: string, envName: string): Buffer {
  if (!warned.has(envName)) {
    warned.add(envName);
    console.warn(
      `[crypto] ${envName} is not set — using a development key derived from BETTER_AUTH_SECRET. ` +
        `Set ${envName} before going live (see .env.example).`,
    );
  }
  const seed = process.env.BETTER_AUTH_SECRET || "bayit-development-only";
  return createHash("sha256").update(`bayit:${purpose}:${seed}`).digest();
}

function getEncryptionKey(): Buffer {
  if (encryptionKey) return encryptionKey;
  const raw = process.env.APP_ENCRYPTION_KEY?.trim();
  if (raw) {
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) {
      throw new Error(
        "APP_ENCRYPTION_KEY must be 32 bytes encoded as base64. Generate one with: openssl rand -base64 32",
      );
    }
    encryptionKey = key;
  } else if (!fallbackAllowed()) {
    throw new Error("APP_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32");
  } else {
    encryptionKey = devFallback("encryption", "APP_ENCRYPTION_KEY");
  }
  return encryptionKey;
}

function getHashSalt(): Buffer {
  if (hashSalt) return hashSalt;
  const raw = process.env.HASH_SALT?.trim();
  if (raw) {
    hashSalt = Buffer.from(raw, "utf8");
  } else if (!fallbackAllowed()) {
    throw new Error("HASH_SALT is not set. Generate one with: openssl rand -hex 16");
  } else {
    hashSalt = devFallback("hash", "HASH_SALT");
  }
  return hashSalt;
}

/** AES-256-GCM. Returns iv + tag + ciphertext. */
export function encrypt(data: Buffer | string): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const plaintext = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

/** Reverses `encrypt`. Throws if the data was changed or the key is wrong. */
export function decrypt(payload: Buffer): Buffer {
  if (payload.length < IV_BYTES + TAG_BYTES) throw new Error("Encrypted payload is too short");
  const iv = payload.subarray(0, IV_BYTES);
  const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = payload.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Encrypts text and returns base64 — for values stored in text columns (TOTP secrets). */
export function encryptString(text: string): string {
  return encrypt(text).toString("base64");
}

export function decryptString(encoded: string): string {
  return decrypt(Buffer.from(encoded, "base64")).toString("utf8");
}

/** HMAC-SHA256 of `value` with HASH_SALT, hex-encoded (64 characters). */
export function hmacHash(value: string): string {
  return createHmac("sha256", getHashSalt()).update(value, "utf8").digest("hex");
}

/** A random, URL-safe token (base64url). 32 bytes → 43 characters. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Constant-time comparison of two strings (tokens, codes). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
