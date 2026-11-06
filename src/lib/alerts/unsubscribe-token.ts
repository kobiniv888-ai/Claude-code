import "server-only";
import { hmacHash, safeEqual } from "@/lib/crypto";

/**
 * Signed "unsubscribe" links (round 3, brief 6.2): one tap on /unsubscribe?t=<token> turns an
 * email off without logging in. The token names the account and the email kind and carries an
 * HMAC (HASH_SALT) over both, so nobody can make a link for another account or another email.
 *
 *   "1.weekly_stats.<userId>.<32 hex>"
 *
 * It never expires (an unsubscribe link must keep working), and it can only switch that one email
 * of that one account off or back on. New kinds (price alerts, phase 5) are added to
 * UNSUBSCRIBE_KINDS and handled in src/lib/alerts/unsubscribe-actions.ts.
 */

export const UNSUBSCRIBE_KINDS = ["weekly_stats"] as const;
export type UnsubscribeKind = (typeof UNSUBSCRIBE_KINDS)[number];

const VERSION = "1";
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

function signature(kind: UnsubscribeKind, userId: string): string {
  return hmacHash(`unsubscribe:v${VERSION}:${kind}:${userId}`).slice(0, 32);
}

export function unsubscribeToken(userId: string, kind: UnsubscribeKind): string {
  if (!USER_ID.test(userId)) throw new Error("unsubscribeToken: unexpected user id");
  return `${VERSION}.${kind}.${userId}.${signature(kind, userId)}`;
}

/** The account and email kind of a valid token, else null. */
export function verifyUnsubscribeToken(token: unknown): { userId: string; kind: UnsubscribeKind } | null {
  if (typeof token !== "string" || token.length > 200) return null;
  const parts = token.trim().split(".");
  if (parts.length !== 4) return null;
  const [version, kind, userId, sig] = parts;
  if (version !== VERSION || !(UNSUBSCRIBE_KINDS as readonly string[]).includes(kind) || !USER_ID.test(userId)) return null;
  if (!/^[0-9a-f]{32}$/.test(sig)) return null;
  return safeEqual(sig, signature(kind as UnsubscribeKind, userId)) ? { userId, kind: kind as UnsubscribeKind } : null;
}

/** The page path (the email adds the site and the language). */
export function unsubscribePath(userId: string, kind: UnsubscribeKind): string {
  return `/unsubscribe?t=${encodeURIComponent(unsubscribeToken(userId, kind))}`;
}
