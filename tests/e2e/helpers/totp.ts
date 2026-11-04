/**
 * The pure part of the e2e staff login (helpers/staff.ts): what an authenticator app computes, and
 * how the server stores the secret. No database, no browser, so `tests/unit/e2e-totp.test.ts`
 * checks it against the app's own code (src/lib/auth/totp.ts, src/lib/crypto.ts).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import * as OTPAuth from "otpauth";

/** RFC 6238 as src/lib/auth/totp.ts uses it: SHA-1, 6 digits, 30-second steps. */
export const TOTP_PERIOD_MS = 30_000;
const DIGITS = 6;
/** Closer than this to the end of a step, use the next step (the server accepts one step ahead). */
const STEP_MARGIN_MS = 3_000;

export type KeyEnv = { APP_ENCRYPTION_KEY?: string; BETTER_AUTH_SECRET?: string };

/** The server's key (src/lib/crypto.ts): APP_ENCRYPTION_KEY, or its development fallback. */
export function encryptionKey(env: KeyEnv = process.env as KeyEnv): Buffer {
  const raw = env.APP_ENCRYPTION_KEY?.trim();
  if (raw) {
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes encoded as base64");
    return key;
  }
  const seed = env.BETTER_AUTH_SECRET || "bayit-development-only";
  return createHash("sha256").update(`bayit:encryption:${seed}`).digest();
}

/** encryptString() of src/lib/crypto.ts: base64(iv 12 + tag 16 + ciphertext), AES-256-GCM. */
export function encryptSecret(text: string, env?: KeyEnv): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(env), iv);
  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

/** decryptString() of src/lib/crypto.ts. */
export function decryptSecret(encoded: string, env?: KeyEnv): string {
  const payload = Buffer.from(encoded, "base64");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(env), payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString("utf8");
}

/** A new random secret (160 bits, base32), like an enrolment makes. */
export function newTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

/** The code an authenticator app shows for one 30-second time step. */
export function totpCodeAt(secretBase32: string, counter: number): string {
  const totp = new OTPAuth.TOTP({ algorithm: "SHA1", digits: DIGITS, period: TOTP_PERIOD_MS / 1000, secret: OTPAuth.Secret.fromBase32(secretBase32) });
  return totp.generate({ timestamp: counter * TOTP_PERIOD_MS });
}

/**
 * Which time step to send a code for, and how long to wait first. The server accepts the current
 * step and one step either side, and never a step at or before the last one it accepted
 * (`lastUsed`, the Verification row "totp-last:<user>"), so:
 * - the current step, unless it was used, then the step after the last used one;
 * - near the end of a step, the next one (the code must still be valid when it arrives);
 * - more than one step ahead is refused: wait until the clock is one step behind it.
 */
export function nextCodeStep(nowMs: number, lastUsed: number | null): { counter: number; waitMs: number } {
  const current = Math.floor(nowMs / TOTP_PERIOD_MS);
  let counter = Math.max(current, (lastUsed ?? -1) + 1);
  if (counter === current && nowMs % TOTP_PERIOD_MS > TOTP_PERIOD_MS - STEP_MARGIN_MS) counter += 1;
  const waitMs = counter > current + 1 ? (counter - 1) * TOTP_PERIOD_MS - nowMs : 0;
  return { counter, waitMs };
}
