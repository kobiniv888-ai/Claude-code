import "server-only";
import { hmacHash, safeEqual } from "@/lib/crypto";

/**
 * The post form's phone step (SECURITY_REPORT 3.2.f): /verify-phone, opened from the post form,
 * gives the page a signed, short-lived token bound to the account. The phone check accepts
 * `place: "post"` from an account without any listing only with this token (and then within its
 * own tight daily limit, ./phone-check-actions.ts), so the paid SMS is not open to every signed-in
 * account calling the action directly. Keyed with HASH_SALT (src/lib/crypto.ts); nothing stored.
 */

export const POST_PHONE_STEP_TTL_MS = 2 * 60 * 60 * 1000;

const digest = (userId: string, issuedAt: string) => hmacHash(`post-phone-step:${userId}:${issuedAt}`);

export function issuePostPhoneStepToken(userId: string, now: number = Date.now()): string {
  const issuedAt = String(Math.floor(now));
  return `${issuedAt}.${digest(userId, issuedAt)}`;
}

/** True for a token this server issued to this account within the last 2 hours. */
export function isPostPhoneStepToken(userId: string, token: unknown, now: number = Date.now()): boolean {
  if (typeof token !== "string" || token.length > 200) return false;
  const match = /^(\d{10,16})\.([0-9a-f]{64})$/.exec(token);
  if (!match) return false;
  const issuedAt = Number(match[1]);
  if (!Number.isFinite(issuedAt) || issuedAt > now + 60_000 || now - issuedAt > POST_PHONE_STEP_TTL_MS) return false;
  return safeEqual(match[2]!, digest(userId, match[1]!));
}
