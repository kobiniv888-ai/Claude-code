import "server-only";
import { isStaffTwoFactorSkipped, type CurrentUser } from "@/lib/auth/session";
import { consumeFreshProof, FreshProofRequiredError } from "@/lib/auth/fresh-proof";
import { freshProofKey, isProofFresh } from "@/lib/auth/fresh-proof-rules";
import { db } from "@/lib/db";

/**
 * A fresh authenticator code before a destructive admin action (SECURITY_REPORT 3.6.c, 12.6.c;
 * checklist 3.6 and 12.6: "deleting or removing anything needs a fresh code").
 *
 * The proof is the one "confirm it's you" stores for the session (src/lib/auth/fresh-proof.ts,
 * the Verification row "fresh-proof:<sessionId>", 5 minutes), but for staff ONLY an authenticator
 * proof counts (`totp`: a code typed in the dialog, or the 2-step login itself, which leaves one).
 * An emailed code (`email_code`) or an email login code (`login_code`) never does: founder's
 * decision 5, an email code never stands in for the authenticator. A database error counts as
 * no proof (fail closed).
 *
 * Two modes, picked per action in runStaffAction (./common.ts):
 * - "consume": one code, one action (bans, role changes, revealing a reporter, removing a host,
 *   deleting all demo data, cleanups and backups): the proof is spent when the action succeeds.
 * - "window": one code covers 5 minutes of queue work (rejecting or hiding listings and reviews,
 *   deleting content items).
 *
 * The development shortcut that lets DEMO staff skip 2-step login (DEV_SKIP_STAFF_2FA, demo
 * accounts on a development server only; src/lib/auth/staff-access.ts) skips this step for them
 * too: they have no authenticator to prove with. A real staff account never skips it.
 */

export type StaffProofMode = "consume" | "window";

/** Methods that count as a staff proof (the authenticator; a recovery-code login marks "totp" too). */
export const STAFF_PROOF_METHODS: readonly string[] = ["totp"];

/** This session gave an authenticator code in the last 5 minutes. */
export async function hasFreshStaffProof(sessionId: string, now = new Date()): Promise<boolean> {
  try {
    const row = await db.verification.findFirst({
      where: { identifier: freshProofKey(sessionId) },
      orderBy: { expiresAt: "desc" },
      select: { value: true, expiresAt: true },
    });
    return !!row && STAFF_PROOF_METHODS.includes(row.value) && isProofFresh(row.expiresAt, now);
  } catch {
    return false;
  }
}

/** Throws FreshProofRequiredError ("fresh_proof_required") unless the staff member has a fresh authenticator proof. */
export async function requireFreshStaffProof(staff: Pick<CurrentUser, "sessionId" | "isDemo">): Promise<void> {
  if (isStaffTwoFactorSkipped(staff)) return;
  if (!(await hasFreshStaffProof(staff.sessionId))) throw new FreshProofRequiredError();
}

/** After a "consume" action succeeded: the next destructive action needs a new code. */
export async function spendStaffProof(staff: Pick<CurrentUser, "sessionId">): Promise<void> {
  await consumeFreshProof(staff.sessionId);
}
