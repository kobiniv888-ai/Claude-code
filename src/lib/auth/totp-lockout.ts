import "server-only";
import { db } from "@/lib/db";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { recordSecurityEvent } from "@/lib/security/events";

/**
 * The daily limit on wrong 2-step codes (SECURITY_REPORT 3.7.a; founder's decision 5).
 *
 * - Every wrong authenticator or recovery code counts. After TOTP_DAILY_WRONG_LIMIT (20) wrong
 *   codes within 24 hours (counted from the first one) the account is LOCKED: no code is checked,
 *   right or wrong, until the 24 hours are over.
 * - An email code to the account's login address ONLY RESETS THE COUNTER (decision 5). Logging in
 *   still needs the authenticator code or a recovery code, so an attacker who controls the email
 *   only gets 20 more guesses per reset. Resets have their own cap, TOTP_UNLOCK_RESETS_PER_DAY (2)
 *   in 24 hours, whatever the emailed-code quota: at most 20 × (1 + 2) = 60 guesses a day. Over the
 *   cap the lock stays until its 24 hours are over (or a recovery code is used).
 * - The short limit (5 tries per 10 minutes, ./actions.ts) stays in front of it.
 * - Fail closed: when the counter cannot be read, the account counts as locked.
 *
 * Locking writes a security event and tells the account (and the founder, for staff):
 * ./security-notices.ts.
 */

export const TOTP_DAILY_WRONG_LIMIT = 20;
export const TOTP_LOCK_WINDOW_SECONDS = 24 * 60 * 60;
/** Email-code resets of the counter per account in 24 hours (SECURITY_REPORT 3.7.a). */
export const TOTP_UNLOCK_RESETS_PER_DAY = 2;

export const totpUnlockKey = (userId: string) => `auth:totp-unlock:day:${userId}`;

export const totpWrongKey = (userId: string) => `auth:totp-wrong:${userId}`;

export type TotpLockState = { locked: boolean; wrong: number; resetAt: Date | null };

/** Pure: is a counter row (count, end of its window) a lock right now? */
export function isTotpLocked(row: { count: number; resetAt: Date } | null, now: Date): boolean {
  return !!row && row.resetAt.getTime() > now.getTime() && row.count >= TOTP_DAILY_WRONG_LIMIT;
}

/** The current state, without counting anything. A database error counts as locked. */
export async function totpLockState(userId: string, now = new Date()): Promise<TotpLockState> {
  try {
    const row = await db.rateLimit.findUnique({ where: { key: totpWrongKey(userId) }, select: { count: true, resetAt: true } });
    if (!row || row.resetAt.getTime() <= now.getTime()) return { locked: false, wrong: 0, resetAt: null };
    return { locked: isTotpLocked(row, now), wrong: row.count, resetAt: row.resetAt };
  } catch (error) {
    console.error("[auth] could not read the 2-step counter — treating the account as locked:", (error as Error)?.message);
    return { locked: true, wrong: TOTP_DAILY_WRONG_LIMIT, resetAt: null };
  }
}

/** Counts one wrong code. True when this one locked the account (the 20th). */
export async function recordWrongTotp(userId: string, kind: "totp" | "recovery"): Promise<boolean> {
  // count ≤ limit → ok; the 20th wrong code leaves 0 remaining. (A broken store answers failed:
  // then the lock state cannot be read either, and counts as locked.)
  const result = await rateLimit(totpWrongKey(userId), { limit: TOTP_DAILY_WRONG_LIMIT, windowSeconds: TOTP_LOCK_WINDOW_SECONDS });
  const justLocked = result.ok && !result.failed && result.remaining === 0;
  if (justLocked) {
    await recordSecurityEvent({ type: "totp_locked", userId, meta: { limit: TOTP_DAILY_WRONG_LIMIT, lastKind: kind } });
  }
  return justLocked;
}

/** The email code was confirmed: the counter starts again at 0 (decision 5: nothing more). */
export async function resetTotpCounter(userId: string): Promise<void> {
  await resetRateLimit(totpWrongKey(userId));
  await recordSecurityEvent({ type: "totp_unlock_email", userId, meta: { step: "reset" } });
}

/** Resets still allowed in the current 24 hours (nothing counted). A database error answers 0 (fail closed). */
export async function unlockResetsLeft(userId: string, now = new Date()): Promise<number> {
  try {
    const row = await db.rateLimit.findUnique({ where: { key: totpUnlockKey(userId) }, select: { count: true, resetAt: true } });
    const used = row && row.resetAt.getTime() > now.getTime() ? row.count : 0;
    return Math.max(0, TOTP_UNLOCK_RESETS_PER_DAY - used);
  } catch (error) {
    console.error("[auth] could not read the 2-step unlock cap — refusing the reset:", (error as Error)?.message);
    return 0;
  }
}

/** Counts one reset. False when the cap is reached (or the store failed): then nothing is reset. */
export async function chargeUnlockReset(userId: string): Promise<boolean> {
  const result = await rateLimit(totpUnlockKey(userId), { limit: TOTP_UNLOCK_RESETS_PER_DAY, windowSeconds: TOTP_LOCK_WINDOW_SECONDS });
  return result.ok;
}

/** The cap was hit: a security event (the founder's alerts read it). */
export async function recordUnlockCapHit(userId: string): Promise<void> {
  await recordSecurityEvent({ type: "totp_unlock_email", userId, meta: { step: "cap", cap: TOTP_UNLOCK_RESETS_PER_DAY } });
}
