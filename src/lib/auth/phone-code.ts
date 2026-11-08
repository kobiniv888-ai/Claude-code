import "server-only";
import { APIError } from "better-auth/api";
import { hmacHash, safeEqual } from "@/lib/crypto";
import { recordSecurityEvent } from "@/lib/security/events";
import { LOGIN_CODE_MAX_ATTEMPTS } from "./code-rules";

/**
 * Phone codes at rest (SECURITY_REPORT 3.1.a, 3.1.b). Better Auth's phone-number plugin makes the
 * 6-digit code (secure random) and would store it in plain text ("<code>:<attempts>"). We never
 * let that reach the database:
 *
 * - `hashPhoneCodeRow` runs in the `verification.create.before` database hook (./server.ts) and
 *   replaces the code with an HMAC-SHA256 keyed with HASH_SALT and bound to the number, before the
 *   row is written: "<64 hex>:<attempts>". Someone who reads the database cannot get the code
 *   back (and cannot try the 10^6 codes without the key).
 * - `checkPhoneCode` is the plugin's `verifyOTP` (always set): it takes the row atomically (only
 *   one request at a time can compare a guess; parallel guesses are refused without a compare), compares
 *   in constant time, puts the row back with one more attempt after a wrong guess, and lets the
 *   code die after LOGIN_CODE_MAX_ATTEMPTS wrong tries. A right code is used up (single use).
 *
 * Email codes are hashed the same way by Better Auth's email-OTP plugin with our keyed hash
 * (`hashEmailCode` in ./email-code.ts).
 */

/** Where Better Auth's phone-number plugin keeps a phone code (namespaced since better-auth 1.7.16). */
export const PHONE_CODE_PREFIX = "phone-number-otp-";
export const phoneOtpIdentifier = (phone: string) => `${PHONE_CODE_PREFIX}${phone}`;

const PLAIN_CODE = /^(\d{4,10}):(\d+)$/;
const HASHED_CODE = /^([0-9a-f]{64}):(\d+)$/;

/** The keyed hash of a phone code, bound to its number. */
export function phoneCodeDigest(phone: string, code: string): string {
  return hmacHash(`login-code:phone:${phone}:${code}`);
}

/**
 * The value to store for a new Verification row: a phone code row in plain text becomes
 * "<hash>:<attempts>"; every other row (email codes, 2-step login, rows already hashed) is left
 * alone (null).
 */
export function hashPhoneCodeRow(row: { identifier?: unknown; value?: unknown }): string | null {
  if (typeof row.identifier !== "string" || !row.identifier.startsWith(PHONE_CODE_PREFIX)) return null;
  if (typeof row.value !== "string") return null;
  const plain = PLAIN_CODE.exec(row.value);
  if (!plain) return null;
  const phone = row.identifier.slice(PHONE_CODE_PREFIX.length);
  return `${phoneCodeDigest(phone, plain[1]!)}:${plain[2]}`;
}

/** The part of Better Auth's internal adapter this check uses (a test can pass a fake). */
export type PhoneCodeStore = {
  consumeVerificationValue(identifier: string): Promise<{ value: string; expiresAt: Date } | null>;
  createVerificationValue(data: { identifier: string; value: string; expiresAt: Date }): Promise<unknown>;
};

function codeError(status: "BAD_REQUEST" | "FORBIDDEN", code: string, message: string) {
  return new APIError(status, { code, message });
}

/**
 * Checks a phone code. True for the right code (now used up); false for a wrong one (counted);
 * throws OTP_EXPIRED / TOO_MANY_ATTEMPTS. "No code" and "another request is checking right now"
 * both answer false (the plugin then says "invalid code"), so parallel guesses gain nothing.
 */
export async function checkPhoneCode(
  store: PhoneCodeStore,
  phone: string,
  code: string,
  { country }: { country?: string | null } = {},
): Promise<boolean> {
  const identifier = phoneOtpIdentifier(phone);
  // Atomic: the first caller gets the row (and it is gone for everyone else until we put it back).
  const row = await store.consumeVerificationValue(identifier);
  if (!row) return false;
  if (row.expiresAt.getTime() < Date.now()) {
    throw codeError("BAD_REQUEST", "OTP_EXPIRED", "The code has expired");
  }
  const stored = HASHED_CODE.exec(row.value);
  // A row we cannot read (plain text from before this rule, or damaged): fail closed, the code is dead.
  if (!stored) throw codeError("BAD_REQUEST", "OTP_EXPIRED", "The code has expired");
  const attempts = Number.parseInt(stored[2]!, 10) || 0;
  if (attempts >= LOGIN_CODE_MAX_ATTEMPTS) {
    throw codeError("FORBIDDEN", "TOO_MANY_ATTEMPTS", "Too many attempts");
  }
  const right = /^\d{6}$/.test(code) && safeEqual(phoneCodeDigest(phone, code), stored[1]!);
  if (right) return true; // consumed above: single use
  const used = attempts + 1;
  // Put it back with the attempt counted (a dead code stays dead: the next try, even with the right
  // code, answers "too many attempts, ask for a new code").
  await store.createVerificationValue({ identifier, value: `${stored[1]}:${used}`, expiresAt: row.expiresAt });
  if (used >= LOGIN_CODE_MAX_ATTEMPTS) {
    void recordSecurityEvent({ type: "login_code_locked", meta: { channel: "sms", ...(country ? { country } : {}) } });
    throw codeError("FORBIDDEN", "TOO_MANY_ATTEMPTS", "Too many attempts");
  }
  return false;
}
