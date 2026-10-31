import * as OTPAuth from "otpauth";
import { siteConfig } from "@/config/site";

/**
 * TOTP (RFC 6238) as authenticator apps expect it: 6 digits, 30 seconds, SHA-1 — Google
 * Authenticator, Microsoft Authenticator, 1Password and others. Pure, no database.
 */

export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
/** Accept the previous and the next code too (clock drift). */
export const TOTP_WINDOW = 1;
export const TOTP_CODE_PATTERN = /^\d{6}$/;

function totpFor(secretBase32: string, label: string) {
  return new OTPAuth.TOTP({
    issuer: siteConfig.name,
    label,
    algorithm: "SHA1",
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

/** A new random secret (160 bits), base32-encoded. */
export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

/** otpauth://totp/… — the QR code content. */
export function totpUri(secretBase32: string, label: string): string {
  return totpFor(secretBase32, label).toString();
}

/** The time step a code belongs to, or null when the code is wrong. */
export function matchingCounter(secretBase32: string, code: string, now = Date.now()): number | null {
  if (!TOTP_CODE_PATTERN.test(code)) return null;
  const delta = totpFor(secretBase32, "check").validate({ token: code, timestamp: now, window: TOTP_WINDOW });
  if (delta === null) return null;
  return OTPAuth.TOTP.counter({ period: TOTP_PERIOD_SECONDS, timestamp: now }) + delta;
}
