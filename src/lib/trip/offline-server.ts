import "server-only";
import { createHash } from "node:crypto";
import { hmacHash } from "@/lib/crypto";

/**
 * Server side of "שמירה לשימוש בלי אינטרנט" (round 3, brief 7.1; rules in ./offline.ts).
 *
 * - offlineOwnerKey: who a saved copy belongs to. A keyed hash (HASH_SALT) of the account id,
 *   shortened: the browser can tell "same account" apart from "another account" without ever
 *   seeing the id itself. Every page passes it to <PrivateCacheGuard> (src/app/[locale]/layout.tsx)
 *   and the trip page stores it with the copy.
 * - offlineTripVersion: a short content key of what the trip page shows (status, times, address,
 *   host contacts, rules, price…). The page re-saves its copy when the key changes.
 */

const OWNER_KEY_LENGTH = 24;
const VERSION_LENGTH = 16;

/** The owner key of an account's saved copies (24 hex characters; never the account id). */
export function offlineOwnerKey(userId: string): string {
  return hmacHash(`offline-trips:${userId}`).slice(0, OWNER_KEY_LENGTH);
}

/** The owner key for the root layout: null when signed out, undefined when it can't be told (an error). */
export function offlineOwnerKeyFor(user: { id: string } | null | undefined): string | null | undefined {
  if (user === undefined) return undefined;
  if (user === null) return null;
  try {
    return offlineOwnerKey(user.id);
  } catch (error) {
    // No HASH_SALT in production: never clear a guest's copies because of a configuration error.
    console.error("[trip] offline owner key unavailable", error);
    return undefined;
  }
}

/** Objects with sorted keys, so the same content always gives the same key. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, stable((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** A short content key (16 hex characters) of what the saved copy shows. */
export function offlineTripVersion(content: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stable(content)) ?? "null")
    .digest("hex")
    .slice(0, VERSION_LENGTH);
}
