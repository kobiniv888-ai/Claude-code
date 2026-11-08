"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { AuthRequiredError } from "@/lib/errors";
import { rateLimit, rateLimitByIp } from "@/lib/rate-limit";
import { recordSecurityEvent } from "@/lib/security/events";
import { codeDisplayForHeaders } from "./code-display";
import { checkSecurityCode, issueSecurityCode, markFreshProof } from "./fresh-proof";
import {
  SECURITY_CODES_PER_DAY_ACCOUNT,
  SECURITY_CODES_PER_DAY_IP,
  SECURITY_CODE_PATTERN,
  maskEmail,
  type SecurityCodePurpose,
} from "./fresh-proof-rules";
import { sendSecurityCodeEmail, notifyTotpLocked } from "./security-notices";
import { getCurrentUser, requireUserForAction, type CurrentUser } from "./session";
import { emailCodeRoute } from "./sms";
import { recordWrongTotp, resetTotpCounter, totpLockState } from "./totp-lockout";
import { checkAccountTotp } from "./two-factor";

/**
 * "Confirm it's you" (SECURITY_REPORT 3.6, rules in ./fresh-proof-rules.ts) and the email code that
 * resets the 2-step counter of a locked account (3.7.a, founder's decision 5).
 *
 * - getProofOptions(): which ways this account can prove itself (email code, authenticator).
 * - sendProofCode(): a 6-digit code to the LOGIN email (never the contact email: that is what an
 *   attacker would change first). Growing waits, 10 a day per account, 30 a day per IP.
 * - confirmProof(): the emailed code or an authenticator code → this session has a fresh proof
 *   for 5 minutes.
 * - sendUnlockCode() / confirmUnlockCode(): for a locked account only; the code ONLY resets the
 *   wrong-code counter. Logging in still needs the authenticator or a recovery code.
 *
 * Test mode (codes on screen, ./code-display.ts) returns the code as `screenCode` when it cannot
 * reach a real inbox (no email service, or a demo account), like the login forms.
 */

export type ProofOptions = {
  /** Masked login address ("da***@example.com"), or null when the account has no real email. */
  email: string | null;
  totp: boolean;
};

/** `sent: false`: the wait before another code is not over (`retryAfterSeconds` to go). */
export type CodeSent = { sent: boolean; sentTo: string; retryAfterSeconds: number; screenCode?: string };

function realLoginEmail(user: Pick<CurrentUser, "email" | "emailIsPlaceholder">): string | null {
  return user.emailIsPlaceholder ? null : user.email;
}

export async function getProofOptions(): Promise<ActionResult<ProofOptions>> {
  return runAction<ProofOptions>(async () => {
    const user = await requireUserForAction();
    const email = realLoginEmail(user);
    return ok({ email: email ? maskEmail(email) : null, totp: user.twoFactorEnabled });
  });
}

/** Sends a code to the login email for `purpose` (limits and waits included). */
async function sendCode(user: CurrentUser, purpose: SecurityCodePurpose): Promise<ActionResult<CodeSent>> {
  const email = realLoginEmail(user);
  if (!email) return fail("no_email_for_code");
  const [perAccount, perIp] = await Promise.all([
    rateLimit(`auth:security-code:day:${user.id}`, { limit: SECURITY_CODES_PER_DAY_ACCOUNT, windowSeconds: 86_400 }),
    rateLimitByIp("auth:security-code:day", { limit: SECURITY_CODES_PER_DAY_IP, windowSeconds: 86_400 }),
  ]);
  if (!perAccount.ok || !perIp.ok) return fail("rate_limited");

  const issued = await issueSecurityCode({ userId: user.id, purpose });
  if (!issued.ok) return ok({ sent: false, sentTo: maskEmail(email), retryAfterSeconds: issued.retryAfterSeconds });
  const requestHeaders = await headers();
  const showOnScreen = codeDisplayForHeaders(requestHeaders) !== null && (emailCodeRoute(requestHeaders) === "screen" || user.isDemo);
  const sent = await sendSecurityCodeEmail({ userId: user.id, to: email, code: issued.code, purpose });
  if (!sent && !showOnScreen) return fail("email_unavailable");
  return ok({ sent: true, sentTo: maskEmail(email), retryAfterSeconds: issued.nextWaitSeconds, ...(showOnScreen ? { screenCode: issued.code } : {}) });
}

export async function sendProofCode(): Promise<ActionResult<CodeSent>> {
  return runAction<CodeSent>(async () => sendCode(await requireUserForAction(), "confirm"));
}

const confirmSchema = z.object({ method: z.enum(["email", "totp"]), code: z.string().trim().regex(SECURITY_CODE_PATTERN) });

export async function confirmProof(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = confirmSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_code");
    if (parsed.data.method === "totp") {
      if (!user.twoFactorEnabled) return fail("invalid_input");
      if ((await totpLockState(user.id)).locked) return fail("totp_locked");
      if (!(await rateLimit(`auth:totp:${user.id}`, { limit: 5, windowSeconds: 600 })).ok) return fail("rate_limited");
      if (!(await checkAccountTotp(user.id, parsed.data.code))) {
        if (await recordWrongTotp(user.id, "totp")) {
          await notifyTotpLocked(user.id);
          return fail("totp_locked");
        }
        return fail("totp_invalid_code");
      }
      await markFreshProof(user.sessionId, "totp");
      return ok();
    }
    if (!(await rateLimit(`auth:security-code:check:${user.id}`, { limit: 10, windowSeconds: 600 })).ok) return fail("rate_limited");
    const result = await checkSecurityCode({ userId: user.id, purpose: "confirm", code: parsed.data.code });
    if (result === "wrong") return fail("invalid_code");
    if (result === "expired") return fail("code_expired");
    if (result === "too_many_attempts") return fail("too_many_attempts");
    await markFreshProof(user.sessionId, "email_code");
    return ok();
  });
}

/** The locked account's email code (the session may still be waiting for its 2-step code). */
export async function sendUnlockCode(): Promise<ActionResult<CodeSent>> {
  return runAction<CodeSent>(async () => {
    const user = await getCurrentUser();
    if (!user) throw new AuthRequiredError();
    if (!user.twoFactorEnabled || !(await totpLockState(user.id)).locked) return fail("not_locked");
    const result = await sendCode(user, "unlock");
    if (result.ok) await recordSecurityEvent({ type: "totp_unlock_email", userId: user.id, meta: { step: "sent" } });
    return result;
  });
}

const unlockSchema = z.object({ code: z.string().trim().regex(SECURITY_CODE_PATTERN) });

export async function confirmUnlockCode(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user) throw new AuthRequiredError();
    const parsed = unlockSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_code");
    if (!(await rateLimit(`auth:security-code:check:${user.id}`, { limit: 10, windowSeconds: 600 })).ok) return fail("rate_limited");
    const result = await checkSecurityCode({ userId: user.id, purpose: "unlock", code: parsed.data.code });
    if (result === "wrong") return fail("invalid_code");
    if (result === "expired") return fail("code_expired");
    if (result === "too_many_attempts") return fail("too_many_attempts");
    // Decision 5: the counter starts again. Nothing else: the 2-step code is still needed.
    await resetTotpCounter(user.id);
    return ok();
  });
}
