/**
 * Development keys are MARKED, so they can never pass for real ones (SECURITY_REPORT 12.2.b, 2.4.h):
 * the codespace's setup (.devcontainer/setup.sh) writes every throwaway secret it makes with a
 * marker, and the startup check (src/lib/startup-check.ts) refuses a staging or production server
 * whose secrets carry it. Copying the codespace's .env to the hosting therefore stops the start,
 * instead of running the real site on keys that sit in a development machine.
 *
 *   text secrets (BETTER_AUTH_SECRET, HASH_SALT, CRON_SECRET…):  "bayit-dev-" + random
 *   32-byte keys (APP_ENCRYPTION_KEY, FIELD_ENCRYPTION_KEY, BACKUP_ENCRYPTION_KEY): base64 of
 *     "BAYITDEV" (8 bytes) + 24 random bytes — still a valid 32-byte key for development
 *
 * No imports: the startup check and scripts read it.
 */

export const DEV_SECRET_PREFIX = "bayit-dev-";
export const DEV_KEY_MARKER = "BAYITDEV";

/** The secrets the codespace makes for itself; each must be made fresh on the real hosting. */
export const DEV_MARKED_SETTINGS = [
  "BETTER_AUTH_SECRET",
  "APP_ENCRYPTION_KEY",
  "FIELD_ENCRYPTION_KEY",
  "HASH_SALT",
  "CRON_SECRET",
  "BACKUP_ENCRYPTION_KEY",
  "TELEGRAM_WEBHOOK_SECRET",
  "RESEND_WEBHOOK_SECRET",
] as const;

/** A value made by the codespace's setup (either kind of marker). */
export function isMarkedDevKey(raw: string | undefined | null): boolean {
  const value = raw?.trim() ?? "";
  if (!value) return false;
  if (value.toLowerCase().startsWith(DEV_SECRET_PREFIX)) return true;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const bytes = Buffer.from(value, "base64");
  return bytes.length >= DEV_KEY_MARKER.length && bytes.subarray(0, DEV_KEY_MARKER.length).toString("latin1") === DEV_KEY_MARKER;
}

/** A marked text secret ("bayit-dev-…"). */
export function newDevSecret(random: string): string {
  return `${DEV_SECRET_PREFIX}${random}`;
}

/** A marked 32-byte key from 24 random bytes. */
export function newDevKey(random24: Buffer): string {
  if (random24.length !== 24) throw new Error("A development key needs 24 random bytes");
  return Buffer.concat([Buffer.from(DEV_KEY_MARKER, "latin1"), random24]).toString("base64");
}
