/**
 * Field encryption, the pure part (SECURITY_REPORT 12.3.c; founder's decision D7 (a), 8 November
 * 2026): the listing's EXACT address and EXACT pin and the guest's phone on a booking are stored
 * encrypted with AES-256-GCM under their own key, FIELD_ENCRYPTION_KEY (32 random bytes, base64),
 * never under APP_ENCRYPTION_KEY or any other secret. The public, moved map point
 * (Listing.approxLat / approxLng) stays plain for search and maps.
 *
 * Stored format (a text column):   fe1:<key id>:<base64url(iv ‖ tag ‖ ciphertext)>
 *   fe1       format version (a new format gets a new prefix; old rows keep reading)
 *   key id    8 hex characters derived from the key (SHA-256, not secret): which key sealed it, so
 *             the key can be rotated (FIELD_ENCRYPTION_KEY_PREVIOUS still opens old rows while
 *             scripts/encrypt-fields.ts re-seals them; docs/security/field-encryption.md)
 *   payload   a fresh random 12-byte IV, the 16-byte GCM tag and the ciphertext. The purpose
 *             ("listing.address", "listing.pin", "booking.guestPhone") and the key id are bound in
 *             as associated data: a value copied into another column, or given another key id,
 *             does not open.
 * Lookups:  fl1:<key id>:<base64url HMAC-SHA256>, for "find the bookings made with this phone"
 *           (the 2-bookings-per-phone cap) without storing the number in plain text. One per key in
 *           the keyring, so a lookup still matches during a rotation.
 * The encryption and lookup keys are separate HKDF-SHA256 subkeys of the configured key.
 *
 * Pure (node:crypto only, no "@/" or server imports) so scripts, the e2e helpers and tests use the
 * very same code. The server's entry point is src/lib/field-crypto.ts (keyring from the settings,
 * fail-closed reads, security events, React taint).
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from "node:crypto";

export const FIELD_PURPOSES = ["listing.address", "listing.pin", "booking.guestPhone"] as const;
export type FieldPurpose = (typeof FIELD_PURPOSES)[number];

export const FIELD_FORMAT = "fe1";
export const LOOKUP_FORMAT = "fl1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const SEALED = /^fe1:([0-9a-f]{8}):([A-Za-z0-9_-]+)$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Why a value could not be sealed or opened (for the security event; never the value itself). */
export type FieldCryptoReason = "no_key" | "bad_key" | "malformed" | "unknown_key" | "tampered" | "bad_value";

export class FieldCryptoError extends Error {
  constructor(
    readonly reason: FieldCryptoReason,
    message: string,
  ) {
    super(message);
    this.name = "FieldCryptoError";
  }
}

export function isFieldCryptoError(error: unknown): error is FieldCryptoError {
  return error instanceof FieldCryptoError;
}

export type FieldKeySource = "current" | "previous" | "development";

export type FieldKey = {
  /** 8 hex characters, written into every value this key seals. */
  id: string;
  source: FieldKeySource;
  encKey: Buffer;
  lookupKey: Buffer;
};

/** `current` seals; every key in `keys` (current first) opens. */
export type FieldKeyring = { current: FieldKey; keys: readonly FieldKey[] };

export type FieldKeyEnv = Partial<Record<string, string | undefined>>;

/** 32 bytes from standard base64, or null (empty, not base64, another length). */
export function parseFieldKey(raw: string | null | undefined): Buffer | null {
  const text = raw?.trim() ?? "";
  if (!text || !BASE64.test(text)) return null;
  const key = Buffer.from(text, "base64");
  return key.length === 32 ? key : null;
}

/** The key id of a 32-byte key: public, the same on every server. */
export function fieldKeyIdOf(master: Buffer): string {
  return createHash("sha256").update("bayit/field-key-id/v1\u0000").update(master).digest("hex").slice(0, 8);
}

function subkey(master: Buffer, info: string): Buffer {
  return Buffer.from(hkdfSync("sha256", master, Buffer.from("bayit/field-encryption"), Buffer.from(info), 32));
}

export function fieldKeyFrom(master: Buffer, source: FieldKeySource): FieldKey {
  return { id: fieldKeyIdOf(master), source, encKey: subkey(master, "aes-256-gcm/v1"), lookupKey: subkey(master, "lookup/v1") };
}

/**
 * The development site's key when FIELD_ENCRYPTION_KEY is not set (a laptop, the unit tests):
 * derived from BETTER_AUTH_SECRET like the other development fallbacks in src/lib/crypto.ts. Fake
 * data only: a staging or production server never starts without its own key
 * (src/lib/startup-check.ts).
 */
export function developmentFieldMaster(env: FieldKeyEnv): Buffer {
  const seed = env.BETTER_AUTH_SECRET?.trim() || "bayit-development-only";
  return createHash("sha256").update(`bayit:field-encryption:${seed}`).digest();
}

/** FIELD_ENCRYPTION_KEY_PREVIOUS: one key, or several separated by commas or spaces (oldest last). */
export function previousFieldKeys(env: FieldKeyEnv): string[] {
  return (env.FIELD_ENCRYPTION_KEY_PREVIOUS ?? "")
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * The keyring from the settings:
 * - FIELD_ENCRYPTION_KEY seals and opens; malformed → an error (fail closed, never a weaker key);
 * - FIELD_ENCRYPTION_KEY_PREVIOUS only opens (during a rotation);
 * - a development site (`development: true`) without FIELD_ENCRYPTION_KEY seals with the
 *   development key, and always also opens values sealed with it (rows written before the
 *   codespace got its own key; scripts/encrypt-fields.ts re-seals them).
 * Anywhere else a missing key is an error.
 */
export function buildFieldKeyring(env: FieldKeyEnv, options: { development: boolean }): FieldKeyring {
  const raw = env.FIELD_ENCRYPTION_KEY?.trim() ?? "";
  let current: FieldKey;
  if (raw) {
    const master = parseFieldKey(raw);
    if (!master) throw new FieldCryptoError("bad_key", "FIELD_ENCRYPTION_KEY must be 32 bytes encoded as base64 (generate it with: openssl rand -base64 32).");
    current = fieldKeyFrom(master, "current");
  } else if (options.development) {
    current = fieldKeyFrom(developmentFieldMaster(env), "development");
  } else {
    throw new FieldCryptoError("no_key", "FIELD_ENCRYPTION_KEY is not set (generate it with: openssl rand -base64 32).");
  }
  const keys: FieldKey[] = [current];
  for (const text of previousFieldKeys(env)) {
    const master = parseFieldKey(text);
    if (!master) throw new FieldCryptoError("bad_key", "FIELD_ENCRYPTION_KEY_PREVIOUS must be 32-byte base64 keys (comma-separated).");
    const key = fieldKeyFrom(master, "previous");
    if (!keys.some((k) => k.id === key.id)) keys.push(key);
  }
  if (options.development) {
    const key = fieldKeyFrom(developmentFieldMaster(env), "development");
    if (!keys.some((k) => k.id === key.id)) keys.push(key);
  }
  return { current, keys };
}

function associatedData(purpose: FieldPurpose, keyId: string): Buffer {
  return Buffer.from(`bayit:${FIELD_FORMAT}:${purpose}:${keyId}`, "utf8");
}

function assertPurpose(purpose: string): asserts purpose is FieldPurpose {
  if (!(FIELD_PURPOSES as readonly string[]).includes(purpose)) throw new FieldCryptoError("bad_value", `Unknown field purpose "${purpose}".`);
}

/** Seals `plaintext` for `purpose` with the current key. */
export function sealField(ring: FieldKeyring, purpose: FieldPurpose, plaintext: string): string {
  assertPurpose(purpose);
  if (typeof plaintext !== "string") throw new FieldCryptoError("bad_value", "Only text can be sealed.");
  const key = ring.current;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key.encKey, iv);
  cipher.setAAD(associatedData(purpose, key.id));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${FIELD_FORMAT}:${key.id}:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url")}`;
}

/** The key id a sealed value names, or null when it is not a sealed value. */
export function sealedKeyId(stored: string | null | undefined): string | null {
  return typeof stored === "string" ? (SEALED.exec(stored)?.[1] ?? null) : null;
}

/** A sealed value that the current key did not seal (scripts/encrypt-fields.ts re-seals it). */
export function sealedWithOldKey(ring: FieldKeyring, stored: string | null | undefined): boolean {
  const id = sealedKeyId(stored);
  return id !== null && id !== ring.current.id;
}

/** Opens a sealed value. Throws FieldCryptoError (malformed, unknown_key, tampered): never a partial value. */
export function openField(ring: FieldKeyring, purpose: FieldPurpose, stored: string): string {
  assertPurpose(purpose);
  const match = typeof stored === "string" ? SEALED.exec(stored) : null;
  if (!match) throw new FieldCryptoError("malformed", "Not a sealed field value.");
  const key = ring.keys.find((k) => k.id === match[1]);
  if (!key) throw new FieldCryptoError("unknown_key", "The value was sealed with a key this server does not have.");
  const payload = Buffer.from(match[2]!, "base64url");
  if (payload.length < IV_BYTES + TAG_BYTES) throw new FieldCryptoError("malformed", "The sealed value is too short.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key.encKey, payload.subarray(0, IV_BYTES));
    decipher.setAAD(associatedData(purpose, key.id));
    decipher.setAuthTag(payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([decipher.update(payload.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    throw new FieldCryptoError("tampered", "The sealed value was changed, or belongs to another field.");
  }
}

/** The lookup value of `value` under one key. */
export function fieldLookupWith(key: FieldKey, purpose: FieldPurpose, value: string): string {
  assertPurpose(purpose);
  const mac = createHmac("sha256", key.lookupKey).update(`${purpose}\u0000${value}`, "utf8").digest("base64url");
  return `${LOOKUP_FORMAT}:${key.id}:${mac}`;
}

/** The lookup value to store (current key). */
export function fieldLookup(ring: FieldKeyring, purpose: FieldPurpose, value: string): string {
  return fieldLookupWith(ring.current, purpose, value);
}

/** Every lookup value `value` may be stored under (each key of the ring): for `in` queries. */
export function fieldLookups(ring: FieldKeyring, purpose: FieldPurpose, value: string): string[] {
  return ring.keys.map((key) => fieldLookupWith(key, purpose, value));
}

// ─── The exact pin ────────────────────────────────────────────

export type Pin = { lat: number; lng: number };

const PIN_TEXT = /^(-?\d{1,3}(?:\.\d{1,6})?),(-?\d{1,3}(?:\.\d{1,6})?)$/;

const validPin = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** "41.715138,44.827096" (6 decimals, the precision the post form saves). */
export function encodePin(pin: Pin): string {
  if (!pin || !validPin(pin.lat, pin.lng)) throw new FieldCryptoError("bad_value", "A pin needs a valid latitude and longitude.");
  return `${pin.lat.toFixed(6)},${pin.lng.toFixed(6)}`;
}

/** Reverses encodePin; anything else is an error (never a half pin). */
export function decodePin(text: string): Pin {
  const match = PIN_TEXT.exec(text);
  const lat = match ? Number(match[1]) : NaN;
  const lng = match ? Number(match[2]) : NaN;
  if (!validPin(lat, lng)) throw new FieldCryptoError("bad_value", "The opened pin is not a valid point.");
  return { lat, lng };
}
