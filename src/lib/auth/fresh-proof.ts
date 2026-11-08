import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { hmacHash, safeEqual } from "@/lib/crypto";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  FRESH_PROOF_TTL_MS,
  SECURITY_CODE_MAX_ATTEMPTS,
  SECURITY_CODE_TTL_MS,
  decodeSecurityCode,
  encodeSecurityCode,
  freshProofKey,
  isProofFresh,
  resendWaitSeconds,
  secondsUntilResend,
  securityCodeKey,
  type ProofMethod,
  type SecurityCodePurpose,
} from "./fresh-proof-rules";

/**
 * The database side of fresh proofs and emailed security codes (rules: ./fresh-proof-rules.ts).
 * No session checks here: the actions in ./fresh-proof-actions.ts and the callers do them.
 */

/** Thrown by requireFreshProof(); the browser shows the "confirm it's you" dialog and retries. */
export class FreshProofRequiredError extends AppError {
  constructor() {
    super("fresh_proof_required", "Confirm it's you first: enter a fresh code", { status: 403 });
  }
}

/** This session has just proven it is the account's owner (a code was entered). */
export async function markFreshProof(sessionId: string, method: ProofMethod, now = new Date()): Promise<void> {
  const identifier = freshProofKey(sessionId);
  await db.$transaction([
    db.verification.deleteMany({ where: { identifier } }),
    db.verification.create({ data: { id: randomUUID(), identifier, value: method, expiresAt: new Date(now.getTime() + FRESH_PROOF_TTL_MS) } }),
  ]);
}

/** A code was entered in this session within the last 5 minutes. A database error counts as no. */
export async function hasFreshProof(sessionId: string, now = new Date()): Promise<boolean> {
  try {
    const row = await db.verification.findFirst({
      where: { identifier: freshProofKey(sessionId) },
      orderBy: { expiresAt: "desc" },
      select: { expiresAt: true },
    });
    return isProofFresh(row?.expiresAt, now);
  } catch {
    return false;
  }
}

/** For sensitive actions: throws FreshProofRequiredError unless this session has a fresh proof. */
export async function requireFreshProof(user: { sessionId: string }): Promise<void> {
  if (!(await hasFreshProof(user.sessionId))) throw new FreshProofRequiredError();
}

/** The proof is used for one change only: a second change needs a new code. */
export async function consumeFreshProof(sessionId: string): Promise<void> {
  await db.verification.deleteMany({ where: { identifier: freshProofKey(sessionId) } }).catch(() => undefined);
}

// ── Emailed security codes ──

/** Stored instead of the hash once a code is used or dead (keeps the send count for the waits). */
const DEAD_HASH = "0".repeat(64);

const codeHash = (userId: string, purpose: SecurityCodePurpose, bindTo: string, code: string) =>
  hmacHash(`security-code:${purpose}:${userId}:${bindTo}:${code}`);

/** A new code (and the wait before the next one), or the wait still to go. */
export type IssueResult = { ok: true; code: string; nextWaitSeconds: number } | { ok: false; retryAfterSeconds: number };

/**
 * Makes a new code for `purpose` (replacing an older one), unless the resend wait is not over.
 * `bindTo`: what the code is for besides the account (the new contact address), part of its HMAC.
 */
export async function issueSecurityCode(input: { userId: string; purpose: SecurityCodePurpose; bindTo?: string }, now = new Date()): Promise<IssueResult> {
  const identifier = securityCodeKey(input.userId, input.purpose);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; value: string; createdAt: Date }[]>`
      SELECT id, value, "createdAt" FROM "Verification" WHERE identifier = ${identifier} ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE`;
    const previous = rows[0];
    const state = decodeSecurityCode(previous?.value);
    // The growing waits count the codes of the last day.
    const sameRow = state && now.getTime() - state.lastSentAt < 24 * 3600 * 1000 ? state : null;
    const wait = secondsUntilResend(sameRow, now.getTime());
    if (wait > 0) return { ok: false as const, retryAfterSeconds: wait };
    const sent = (sameRow?.sent ?? 0) + 1;
    await tx.verification.deleteMany({ where: { identifier } });
    await tx.verification.create({
      data: {
        id: randomUUID(),
        identifier,
        value: encodeSecurityCode({ hash: codeHash(input.userId, input.purpose, input.bindTo ?? "", code), attempts: 0, sent, lastSentAt: now.getTime() }),
        // The code's life. The send count in the row keeps the waits growing while the row is kept
        // (a clean-up of expired rows starts them again; the daily caps still hold).
        expiresAt: new Date(now.getTime() + SECURITY_CODE_TTL_MS),
      },
    });
    return { ok: true as const, code, nextWaitSeconds: resendWaitSeconds(sent) };
  });
}

export type CheckResult = "ok" | "wrong" | "expired" | "too_many_attempts";

/**
 * Checks a typed code. One row lock per check (SELECT … FOR UPDATE), so parallel guesses are
 * counted one by one: never more than 5 tries per code. A right code is used up; after the 5th
 * wrong try the code is dead (its row keeps only the send count for the resend waits).
 */
export async function checkSecurityCode(
  input: { userId: string; purpose: SecurityCodePurpose; code: string; bindTo?: string },
  now = new Date(),
): Promise<CheckResult> {
  const identifier = securityCodeKey(input.userId, input.purpose);
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; value: string; expiresAt: Date }[]>`
      SELECT id, value, "expiresAt" FROM "Verification" WHERE identifier = ${identifier} ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE`;
    const row = rows[0];
    const state = decodeSecurityCode(row?.value);
    if (!row || !state || state.hash === DEAD_HASH) return "expired" as const;
    if (row.expiresAt.getTime() <= now.getTime()) return "expired" as const;
    if (state.attempts >= SECURITY_CODE_MAX_ATTEMPTS) return "too_many_attempts" as const;
    const expected = codeHash(input.userId, input.purpose, input.bindTo ?? "", input.code);
    if (safeEqual(expected, state.hash)) {
      await tx.verification.update({ where: { id: row.id }, data: { value: encodeSecurityCode({ ...state, hash: DEAD_HASH }) } });
      return "ok" as const;
    }
    const attempts = state.attempts + 1;
    const data: Prisma.VerificationUpdateInput = {
      value: encodeSecurityCode({ ...state, attempts, hash: attempts >= SECURITY_CODE_MAX_ATTEMPTS ? DEAD_HASH : state.hash }),
    };
    await tx.verification.update({ where: { id: row.id }, data });
    return attempts >= SECURITY_CODE_MAX_ATTEMPTS ? ("too_many_attempts" as const) : ("wrong" as const);
  });
}
