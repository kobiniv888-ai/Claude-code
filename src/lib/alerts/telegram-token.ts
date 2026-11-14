import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The one-time link that connects a host's Telegram to their Bayit account (round 3). Pure
 * (node:crypto only), so it is unit-tested.
 *
 * The settings page opens https://t.me/<bot>?start=<token>; Telegram sends "/start <token>" to
 * the bot webhook (src/app/api/webhooks/telegram). Telegram allows 1–64 characters of
 * [A-Za-z0-9_-] there, so the token is compact:
 *
 *   <userId>_<issued at, seconds, base36>_<HMAC-SHA256 of both, first 12 bytes, base64url>
 *
 * signed with a key derived from BETTER_AUTH_SECRET. It is valid for TELEGRAM_LINK_TTL_SECONDS and
 * only once: the webhook refuses a token issued before the account's last connection
 * (User.telegramLinkedAt), so a used or replaced link can't connect another chat.
 */

export const TELEGRAM_LINK_TTL_SECONDS = 15 * 60;
/** Telegram's limit for the /start parameter. */
export const TELEGRAM_START_MAX = 64;
const SIGNATURE_BYTES = 12;
/** User ids that fit: letters, digits and "-" (Better Auth ids, "demo-user-…"); "_" separates. */
const USER_ID = /^[A-Za-z0-9-]{1,40}$/;
const TOKEN = /^([A-Za-z0-9-]{1,40})_([0-9a-z]{1,10})_([A-Za-z0-9_-]{16})$/;

function signature(secret: string, userId: string, issued: string): Buffer {
  return createHmac("sha256", `bayit:telegram-link:${secret}`).update(`${userId}.${issued}`).digest().subarray(0, SIGNATURE_BYTES);
}

/** A fresh link token for this user, or null when the user id can't be carried (never happens for real ids). */
export function telegramLinkToken(userId: string, secret: string, now: Date = new Date()): string | null {
  if (!secret || !USER_ID.test(userId)) return null;
  const issued = Math.floor(now.getTime() / 1000).toString(36);
  const token = `${userId}_${issued}_${signature(secret, userId, issued).toString("base64url")}`;
  return token.length <= TELEGRAM_START_MAX ? token : null;
}

export type TelegramLinkClaim = { userId: string; issuedAt: Date };

/** The user the token was made for, or null (bad signature, expired, from the future, malformed). */
export function verifyTelegramLinkToken(
  token: string | null | undefined,
  secret: string,
  now: Date = new Date(),
  ttlSeconds: number = TELEGRAM_LINK_TTL_SECONDS,
): TelegramLinkClaim | null {
  if (!secret || !token || token.length > TELEGRAM_START_MAX) return null;
  const match = TOKEN.exec(token.trim());
  if (!match) return null;
  const [, userId, issued, given] = match;
  const expected = signature(secret, userId, issued);
  const actual = Buffer.from(given, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  const issuedSeconds = parseInt(issued, 36);
  if (!Number.isFinite(issuedSeconds)) return null;
  const age = Math.floor(now.getTime() / 1000) - issuedSeconds;
  // A minute of clock skew is fine; older than the TTL is not.
  if (age < -60 || age > ttlSeconds) return null;
  return { userId, issuedAt: new Date(issuedSeconds * 1000) };
}

/** Single use: a token issued before the account's last connection is spent. */
export function isFreshLinkClaim(claim: TelegramLinkClaim, telegramLinkedAt: Date | null | undefined): boolean {
  return !telegramLinkedAt || claim.issuedAt.getTime() > telegramLinkedAt.getTime();
}

/** "https://t.me/BayitAlertsBot?start=<token>". */
export function telegramStartUrl(botUsername: string, token: string): string {
  return `https://t.me/${encodeURIComponent(botUsername.replace(/^@/, ""))}?start=${encodeURIComponent(token)}`;
}
