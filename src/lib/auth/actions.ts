"use server";

import { z } from "zod";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { AuthRequiredError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { needsFirstName } from "./first-name";
import { needsAccountEmail } from "./account-email";
import { consumeFreshProof, markFreshProof, requireFreshProof } from "./fresh-proof";
import { createRecoveryCodes, recoveryCodesLeft, useRecoveryCode } from "./recovery-codes";
import { normalizeRecoveryCode } from "./recovery-code-format";
import { alertFounderAboutStaff, notifySecurityChange, notifyTotpLocked } from "./security-notices";
import { getCurrentUser, requireUserForAction, type CurrentUser } from "./session";
import { rotateSession } from "./session-rotation";
import { issueStaffCookie, markStaffSessionActive } from "./staff-session";
import { recordWrongTotp, totpLockState } from "./totp-lockout";
import {
  TOTP_CODE_PATTERN,
  beginTotpEnrollment,
  checkAccountTotp,
  confirmTotpEnrollment as confirmPendingTotp,
  disableTotpWithCode,
  hasPendingEnrollment,
  totpLabel,
  type TotpEnrollment,
} from "./two-factor";

/**
 * 2-step login (authenticator app) server actions. Error codes are keys in
 * `auth.errors.*` (or the shared `errors.*` for auth_required / rate_limited / server_error).
 *
 * Every code check goes through the same gates (SECURITY_REPORT 3.7.a): the daily lock (20 wrong
 * codes in 24 hours, ./totp-lockout.ts), then 5 tries per 10 minutes (fail closed). A right code
 * gives the session a new id (3.5.b, ./session-rotation.ts); for staff it also starts the 12 idle
 * hours and sets the SameSite=Strict staff cookie (3.5.a/c, ./staff-session.ts).
 */

const codeSchema = z.object({ code: z.string().trim().regex(TOTP_CODE_PATTERN) });
const recoverySchema = z.object({ code: z.string().trim().min(10).max(20) });

/** 5 code attempts per 10 minutes per account (shared by every 2-step code check). */
async function codeAttemptAllowed(userId: string): Promise<boolean> {
  const result = await rateLimit(`auth:totp:${userId}`, { limit: 5, windowSeconds: 10 * 60 });
  return result.ok;
}

/** The gates in front of a code check: "locked" (daily limit), "rate_limited", or null (go on). */
async function codeGate(userId: string): Promise<"totp_locked" | "rate_limited" | null> {
  if ((await totpLockState(userId)).locked) return "totp_locked";
  if (!(await codeAttemptAllowed(userId))) return "rate_limited";
  return null;
}

/** A wrong code: counted for the daily lock, which may lock (and tell) the account now. */
async function wrongCode(userId: string, kind: "totp" | "recovery"): Promise<"totp_locked" | "totp_invalid_code"> {
  if (await recordWrongTotp(userId, kind)) {
    await notifyTotpLocked(userId);
    return "totp_locked";
  }
  return "totp_invalid_code";
}

/** After a right code: a new verified session (+ staff marker and cookie), and a fresh proof. */
async function onCodeAccepted(user: Pick<CurrentUser, "id" | "sessionId" | "isStaff">): Promise<void> {
  const rotated = await rotateSession({ userId: user.id, oldSessionId: user.sessionId, twoFactorVerified: true });
  await markFreshProof(rotated.id, "totp");
  if (user.isStaff) {
    await markStaffSessionActive(rotated.id);
    await issueStaffCookie(rotated.id);
  }
}

/** A session that still needs its 2-step code (or, for staff, the staff cookie of this browser). */
function needsSecondStep(user: CurrentUser): boolean {
  if (!user.twoFactorEnabled) return false;
  return !user.twoFactorVerified || (user.isStaff && !user.staffCookieOk);
}

/** Step 1 of turning 2-step login on (or of moving it to a new phone: `replace`). Needs a fresh code. */
export async function startTotpEnrollment(input?: unknown): Promise<ActionResult<TotpEnrollment>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const replace = z.object({ replace: z.boolean().optional() }).safeParse(input ?? {});
    if (user.twoFactorEnabled && !(replace.success && replace.data.replace)) return fail("totp_already_enabled");
    // Turning on or changing 2-step login is a sensitive change (3.6): a code from the last 5 minutes.
    await requireFreshProof(user);
    const enrollment = await beginTotpEnrollment(user.id, totpLabel(user));
    return ok(enrollment);
  });
}

/**
 * Step 2: the first code from the app confirms the secret. This session gets a new, verified id;
 * every other session must enter a code again. Returns the 10 recovery codes, shown once.
 */
export async function confirmTotpEnrollment(input: unknown): Promise<ActionResult<{ recoveryCodes: string[] }>> {
  return runAction<{ recoveryCodes: string[] }>(async () => {
    const user = await requireUserForAction();
    const parsed = codeSchema.safeParse(input);
    if (!parsed.success) return fail("totp_invalid_code");
    if (!(await hasPendingEnrollment(user.id))) return fail(user.twoFactorEnabled ? "totp_already_enabled" : "totp_setup_expired");
    const gate = await codeGate(user.id);
    if (gate) return fail(gate);

    const result = await confirmPendingTotp(user.id, parsed.data.code);
    if (result === "expired") return fail("totp_setup_expired");
    if (result === "wrong_code") return fail("totp_invalid_code");

    await onCodeAccepted(user);
    const recoveryCodes = await createRecoveryCodes(user.id);
    await notifySecurityChange({ userId: user.id, kind: user.twoFactorEnabled ? "authenticator_changed" : "two_factor_on" });
    if (user.isStaff) {
      await audit({ actorId: user.id, action: user.twoFactorEnabled ? "auth.authenticator_changed" : "auth.two_factor_on", targetType: "User", targetId: user.id });
    }
    return ok({ recoveryCodes });
  });
}

/** The 2-step check after signing in (/two-factor). */
export async function verifyTotpForSession(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    // Not requireUserForAction(): this is the step that makes the session verified.
    const user = await getCurrentUser();
    if (!user) throw new AuthRequiredError();
    const parsed = codeSchema.safeParse(input);
    if (!parsed.success) return fail("totp_invalid_code");
    if (!needsSecondStep(user)) return ok();
    const gate = await codeGate(user.id);
    if (gate) return fail(gate);

    if (!(await checkAccountTotp(user.id, parsed.data.code))) return fail(await wrongCode(user.id, "totp"));
    await onCodeAccepted(user);
    return ok();
  });
}

/**
 * The second step with a recovery code instead of the app (lost phone, SECURITY_REPORT 3.7.c/e).
 * The code is used up; the account is told, the use is logged, and the founder is alerted for staff.
 */
export async function verifyRecoveryCodeForSession(input: unknown): Promise<ActionResult<{ left: number }>> {
  return runAction<{ left: number }>(async () => {
    const user = await getCurrentUser();
    if (!user) throw new AuthRequiredError();
    const parsed = recoverySchema.safeParse(input);
    if (!parsed.success || !normalizeRecoveryCode(parsed.data.code)) return fail("recovery_code_invalid");
    if (!needsSecondStep(user)) return ok({ left: await recoveryCodesLeft(user.id) });
    const gate = await codeGate(user.id);
    if (gate) return fail(gate);

    if (!(await useRecoveryCode(user.id, parsed.data.code))) {
      const outcome = await wrongCode(user.id, "recovery");
      return fail(outcome === "totp_locked" ? outcome : "recovery_code_invalid");
    }
    await onCodeAccepted(user);
    const left = await recoveryCodesLeft(user.id);
    await notifySecurityChange({ userId: user.id, kind: "recovery_code_used", left });
    await audit({ actorId: user.id, action: "auth.recovery", targetType: "User", targetId: user.id, details: { method: "recovery_code", left } });
    if (user.isStaff) await alertFounderAboutStaff({ kind: "recovery_code_used", user });
    return ok({ left });
  });
}

/** Turns 2-step login off (needs a current code: that code is the fresh proof). Staff must keep it on. */
export async function disableTotp(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    if (user.isStaff) return fail("totp_required_for_staff");
    const parsed = codeSchema.safeParse(input);
    if (!parsed.success) return fail("totp_invalid_code");
    if (!user.twoFactorEnabled) return ok();
    const gate = await codeGate(user.id);
    if (gate) return fail(gate);

    if (!(await disableTotpWithCode(user.id, parsed.data.code))) return fail(await wrongCode(user.id, "totp"));
    await notifySecurityChange({ userId: user.id, kind: "two_factor_off" });
    return ok();
  });
}

/** New recovery codes (the old ones stop working). Needs a fresh code; shown once. */
export async function regenerateRecoveryCodes(): Promise<ActionResult<{ recoveryCodes: string[] }>> {
  return runAction<{ recoveryCodes: string[] }>(async () => {
    const user = await requireUserForAction();
    if (!user.twoFactorEnabled) return fail("totp_not_enabled");
    await requireFreshProof(user);
    const recoveryCodes = await createRecoveryCodes(user.id);
    await consumeFreshProof(user.sessionId);
    await notifySecurityChange({ userId: user.id, kind: "recovery_codes_new" });
    if (user.isStaff) await audit({ actorId: user.id, action: "auth.recovery_codes_new", targetType: "User", targetId: user.id });
    return ok({ recoveryCodes });
  });
}

export type LoginState = {
  signedIn: boolean;
  /** Signed in, but the authenticator code for this session is still missing. */
  twoFactorRequired: boolean;
  phoneVerified: boolean;
  /** A new account (or one named after its phone): ask for the first name now. */
  needsFirstName: boolean;
  /** A phone-only account: add a real email (verified by a code) before continuing (answer (5)). */
  needsAccountEmail: boolean;
};

/** Where the login UI stands after a sign-in (used to show the 2-step check in place). */
export async function getLoginState(): Promise<LoginState> {
  const user = await getCurrentUser();
  return {
    signedIn: !!user,
    twoFactorRequired: !!user && !user.twoFactorVerified,
    phoneVerified: !!user?.phoneNumberVerified,
    needsFirstName: !!user && needsFirstName(user),
    needsAccountEmail: !!user && user.twoFactorVerified && needsAccountEmail(user),
  };
}
