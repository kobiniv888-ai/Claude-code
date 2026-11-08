import "server-only";
import { randomBytes } from "node:crypto";
import { hmacHash } from "@/lib/crypto";
import { db } from "@/lib/db";
import { RECOVERY_CODE_COUNT, formatRecoveryCode, normalizeRecoveryCode } from "./recovery-code-format";

/**
 * 2-step recovery codes (SECURITY_REPORT 3.7.c, D1; table TwoFactorRecoveryCode). The format and
 * the reasons are in ./recovery-code-format.ts.
 *
 * - createRecoveryCodes(): a new set of 10; the old set (used or not) is deleted in the same
 *   transaction, so it stops working at once. The plain codes are returned ONCE, never stored.
 * - useRecoveryCode(): checks a typed code and uses it up atomically (one UPDATE … WHERE usedAt
 *   IS NULL), so the same code can never sign in twice, even from two requests at the same moment.
 *
 * These functions do not check the session or the limits: the actions in ./actions.ts do.
 */

/** The HMAC stored for a code (HASH_SALT, bound to the account). */
export const recoveryCodeHash = (userId: string, normalized: string) => hmacHash(`recovery-code:${userId}:${normalized}`);

export async function createRecoveryCodes(userId: string): Promise<string[]> {
  const codes = new Set<string>();
  while (codes.size < RECOVERY_CODE_COUNT) codes.add(formatRecoveryCode(randomBytes(16)));
  const list = [...codes];
  await db.$transaction([
    db.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
    db.twoFactorRecoveryCode.createMany({
      data: list.map((code) => ({ userId, codeHash: recoveryCodeHash(userId, normalizeRecoveryCode(code)!) })),
    }),
  ]);
  return list;
}

/** True when the code was one of the account's unused codes (it is used up now). */
export async function useRecoveryCode(userId: string, typed: unknown): Promise<boolean> {
  const normalized = normalizeRecoveryCode(typed);
  if (!normalized) return false;
  const { count } = await db.twoFactorRecoveryCode.updateMany({
    where: { userId, codeHash: recoveryCodeHash(userId, normalized), usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1;
}

/** How many unused codes the account has left. */
export async function recoveryCodesLeft(userId: string): Promise<number> {
  return db.twoFactorRecoveryCode.count({ where: { userId, usedAt: null } });
}

/** Removes every code (2-step login turned off). */
export async function deleteRecoveryCodes(userId: string): Promise<void> {
  await db.twoFactorRecoveryCode.deleteMany({ where: { userId } });
}
