"use server";

import { z } from "zod";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { AuthRequiredError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { needsFirstName } from "./first-name";
import { getCurrentUser, requireUserForAction } from "./session";
import {
  TOTP_CODE_PATTERN,
  beginTotpEnrollment,
  confirmTotpEnrollment as confirmPendingTotp,
  disableTotpWithCode,
  totpLabel,
  verifyTotpSession,
  type TotpEnrollment,
} from "./two-factor";

/**
 * 2-step login (authenticator app) server actions. Error codes are keys in
 * `auth.errors.*` (or the shared `errors.*` for auth_required / rate_limited / server_error).
 */

const codeSchema = z.object({ code: z.string().trim().regex(TOTP_CODE_PATTERN) });

/** 5 code attempts per 10 minutes per account (shared by verify, confirm and disable). */
async function codeAttemptAllowed(userId: string): Promise<boolean> {
  const result = await rateLimit(`auth:totp:${userId}`, { limit: 5, windowSeconds: 10 * 60 });
  return result.ok;
}

/** Step 1 of turning 2-step login on: a new secret, its QR code and the manual key. */
export async function startTotpEnrollment(): Promise<ActionResult<TotpEnrollment>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    if (user.twoFactorEnabled) return fail("totp_already_enabled");
    const enrollment = await beginTotpEnrollment(user.id, totpLabel(user));
    return ok(enrollment);
  });
}

/** Step 2: the first code from the app confirms the secret; this session counts as verified. */
export async function confirmTotpEnrollment(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = codeSchema.safeParse(input);
    if (!parsed.success) return fail("totp_invalid_code");
    if (user.twoFactorEnabled) return fail("totp_already_enabled");
    if (!(await codeAttemptAllowed(user.id))) return fail("rate_limited");

    const result = await confirmPendingTotp(user.id, user.sessionId, parsed.data.code);
    if (result === "expired") return fail("totp_setup_expired");
    if (result === "wrong_code") return fail("totp_invalid_code");
    return ok();
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
    if (!user.twoFactorEnabled || user.twoFactorVerified) return ok();
    if (!(await codeAttemptAllowed(user.id))) return fail("rate_limited");

    const verified = await verifyTotpSession(user.id, user.sessionId, parsed.data.code);
    return verified ? ok() : fail("totp_invalid_code");
  });
}

/** Turns 2-step login off (needs a current code). Staff must keep it on. */
export async function disableTotp(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    if (user.isStaff) return fail("totp_required_for_staff");
    const parsed = codeSchema.safeParse(input);
    if (!parsed.success) return fail("totp_invalid_code");
    if (!user.twoFactorEnabled) return ok();
    if (!(await codeAttemptAllowed(user.id))) return fail("rate_limited");

    const disabled = await disableTotpWithCode(user.id, parsed.data.code);
    return disabled ? ok() : fail("totp_invalid_code");
  });
}

export type LoginState = {
  signedIn: boolean;
  /** Signed in, but the authenticator code for this session is still missing. */
  twoFactorRequired: boolean;
  phoneVerified: boolean;
  /** A new account (or one named after its phone): ask for the first name now. */
  needsFirstName: boolean;
};

/** Where the login UI stands after a sign-in (used to show the 2-step check in place). */
export async function getLoginState(): Promise<LoginState> {
  const user = await getCurrentUser();
  return {
    signedIn: !!user,
    twoFactorRequired: !!user && !user.twoFactorVerified,
    phoneVerified: !!user?.phoneNumberVerified,
    needsFirstName: !!user && needsFirstName(user),
  };
}
