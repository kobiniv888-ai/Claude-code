"use server";

import { z } from "zod";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { requireUserForAction } from "@/lib/auth/session";
import { assertRateLimit } from "@/lib/rate-limit";
import { hasCurrentAcceptance, TERMS_PURPOSES, TERMS_VERSION, type TermsPurpose } from "./terms";
import { latestAcceptance, recordTermsAcceptance, termsNeededFor } from "./terms-server";

/**
 * The Terms + 18+ box (SECURITY_REPORT 15.11.b/c). Signed-in accounts only, rate-limited per
 * account. The booking and publish actions enforce the rule themselves (requireTermsFor); these
 * two only tell a form whether to show the box, and log the login's "terms" step.
 *
 *   const status = await termsStatusAction("booking");     // { needed, version }
 *   const saved = await acceptTermsAction({ termsAccepted: true, ageConfirmed: true });
 */

const purposeSchema = z.enum(TERMS_PURPOSES);

/** Must the signed-in account tick the box before this booking / publish / after sign-up? */
export async function termsStatusAction(purpose: unknown): Promise<ActionResult<{ needed: boolean; version: string }>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = purposeSchema.safeParse(purpose);
    if (!parsed.success) return fail("invalid_input");
    await assertRateLimit(`legal:terms-status:${user.id}`, { limit: 60, windowSeconds: 10 * 60 });
    const needed = await termsNeededFor(user.id, parsed.data as TermsPurpose);
    return ok({ needed, version: TERMS_VERSION });
  });
}

const consentSchema = z
  .object({
    termsAccepted: z.literal(true, { error: "required" }),
    ageConfirmed: z.literal(true, { error: "required" }),
  })
  .strict();

/**
 * The login's "terms" step (a new account, or one made before acceptances were logged): logs the
 * acceptance of the Terms in force with the 18+ confirmation. Nothing new is written when the
 * account already accepted this version.
 */
export async function acceptTermsAction(input: unknown): Promise<ActionResult<{ version: string; recorded: boolean }>> {
  return runAction<{ version: string; recorded: boolean }>(async () => {
    const user = await requireUserForAction();
    const parsed = consentSchema.safeParse(input);
    if (!parsed.success) return fail("terms_required", z.flattenError(parsed.error).fieldErrors);
    await assertRateLimit(`legal:terms-accept:${user.id}`, { limit: 10, windowSeconds: 10 * 60 });
    if (hasCurrentAcceptance(await latestAcceptance(user.id))) return ok({ version: TERMS_VERSION, recorded: false });
    await recordTermsAcceptance(user.id);
    return ok({ version: TERMS_VERSION, recorded: true });
  });
}
