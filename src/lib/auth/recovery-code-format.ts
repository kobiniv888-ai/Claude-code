/**
 * 2-step recovery codes (SECURITY_REPORT 3.7.c, D1): their look and how a typed code is read.
 * Pure (no server imports): the server side is ./recovery-codes.ts.
 *
 * - RECOVERY_CODE_COUNT (10) codes are made when 2-step login is turned on, and again on request
 *   (the old set stops working). They are shown ONCE, to copy or download.
 * - Each code: 10 characters from Crockford's base32 (digits and capitals without I, L, O, U),
 *   written "XXXXX-XXXXX": 50 random bits. Only an HMAC is stored; each works once.
 * - Typing is forgiving: lower case, spaces and dashes are fine, and O/I/L read as 0/1/1.
 */

export const RECOVERY_CODE_COUNT = 10;
export const RECOVERY_CODE_LENGTH = 10;
export const RECOVERY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Turns random bytes (at least RECOVERY_CODE_LENGTH) into one code, "XXXXX-XXXXX". */
export function formatRecoveryCode(bytes: Uint8Array): string {
  if (bytes.length < RECOVERY_CODE_LENGTH) throw new Error("formatRecoveryCode: not enough random bytes");
  let raw = "";
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) raw += RECOVERY_ALPHABET[bytes[i]! & 31];
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

/** The canonical form of a typed code ("abcde fghjk" → "ABCDEFGHJK"), or null when it cannot be one. */
export function normalizeRecoveryCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input
    .toUpperCase()
    .replace(/[\s\-–—_.]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (cleaned.length !== RECOVERY_CODE_LENGTH) return null;
  for (const char of cleaned) if (!RECOVERY_ALPHABET.includes(char)) return null;
  return cleaned;
}

/** Looks like a recovery code rather than a 6-digit authenticator code. */
export function looksLikeRecoveryCode(input: unknown): boolean {
  return normalizeRecoveryCode(input) !== null;
}

/** The text file offered for download: the codes and how to use them (labels from the caller). */
export function recoveryCodesFile(codes: readonly string[], lines: { title: string; intro: string; footer: string }): string {
  return [lines.title, "", lines.intro, "", ...codes.map((code, i) => `${String(i + 1).padStart(2, " ")}. ${code}`), "", lines.footer, ""].join("\n");
}
