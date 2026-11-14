"use server";

import { z } from "zod";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { isPlaceholderEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { needsAccountEmail } from "./account-email";
import { checkSecurityCode, requireFreshProof } from "./fresh-proof";
import { SECURITY_CODE_PATTERN } from "./fresh-proof-rules";
import { sendSecurityCodeWithLimits, type CodeSent } from "./security-code-send";
import { requireUserForAction } from "./session";

/**
 * "Add your email" for an account that has none (a phone-only sign-up; founder's answer (5),
 * ./account-email.ts). Two steps, like the contact email:
 *
 * 1. sendAccountEmailCode: only for such an account, with the fresh proof of this session's code
 *    sign-in (5 minutes) and the CAPTCHA; a 6-digit code to the NEW address, bound to it, through
 *    the same per-inbox waits and caps as every emailed code (./security-code-send.ts). The answer
 *    is the same whether or not another account uses that address (the code goes to the inbox).
 * 2. confirmAccountEmail: the right code makes the address the account's LOGIN email
 *    (User.email, verified). Only after the code proves the inbox is it said that the address
 *    belongs to another account ("email_in_use": sign in with that one), so it tells nothing to
 *    anyone who does not own the inbox.
 */

const emailSchema = z
  .string()
  .trim()
  .max(254)
  .transform((v) => v.toLowerCase())
  .refine((v) => z.email().safeParse(v).success && !isPlaceholderEmail(v), { message: "invalid_email" });

const sendSchema = z.object({ email: emailSchema, captchaToken: z.string().max(2048).nullish() });
const confirmSchema = z.object({ email: emailSchema, code: z.string().trim().regex(SECURITY_CODE_PATTERN) });

export async function sendAccountEmailCode(input: unknown): Promise<ActionResult<CodeSent>> {
  return runAction<CodeSent>(async () => {
    const user = await requireUserForAction();
    if (!needsAccountEmail(user)) return fail("account_email_present");
    const parsed = sendSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", { email: ["invalid_email"] });
    // Adding a way to sign in is a sensitive change: this session's own code sign-in (or a fresh code).
    await requireFreshProof(user);
    if (!(await verifyTurnstile(parsed.data.captchaToken, { expectedAction: "contact_email" }))) return fail("captcha_failed");
    return sendSecurityCodeWithLimits({ user, purpose: "contact", to: parsed.data.email, bindTo: parsed.data.email });
  });
}

export async function confirmAccountEmail(input: unknown): Promise<ActionResult<{ email: string }>> {
  return runAction<{ email: string }>(async () => {
    const user = await requireUserForAction();
    if (!needsAccountEmail(user)) return fail("account_email_present");
    const parsed = confirmSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_code");
    if (!(await rateLimit(`auth:security-code:check:${user.id}`, { limit: 10, windowSeconds: 600 })).ok) return fail("rate_limited");
    const email = parsed.data.email;
    const result = await checkSecurityCode({ userId: user.id, purpose: "contact", code: parsed.data.code, bindTo: email });
    if (result === "wrong") return fail("invalid_code");
    if (result === "expired") return fail("code_expired");
    if (result === "too_many_attempts") return fail("too_many_attempts");
    try {
      // Only while the account still has its placeholder (two confirmations never both win).
      const updated = await db.user.updateMany({ where: { id: user.id, email: user.email }, data: { email, emailVerified: true } });
      if (updated.count !== 1) return fail("account_email_present");
    } catch (error) {
      // The inbox is proven: the person owns the other account with this address.
      if ((error as { code?: string }).code === "P2002") return fail("email_in_use");
      throw error;
    }
    await audit({ actorId: user.id, action: "account.email_added", targetType: "User", targetId: user.id });
    return ok({ email });
  });
}
