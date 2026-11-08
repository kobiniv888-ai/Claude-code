"use server";

import { z } from "zod";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { contactEmailSchema } from "@/lib/account/settings-schema";
import { db } from "@/lib/db";
import { isPlaceholderEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { endOtherSessions } from "./account-sessions";
import { checkSecurityCode, consumeFreshProof, requireFreshProof } from "./fresh-proof";
import { SECURITY_CODE_PATTERN, maskEmail } from "./fresh-proof-rules";
import { sendSecurityCodeWithLimits, type CodeSent } from "./security-code-send";
import { notifySecurityChange } from "./security-notices";
import { requireUserForAction } from "./session";

/**
 * The contact email (Settings → email), which receives every notification instead of the login
 * address (src/lib/email/index.ts notificationEmailFor). Changing it is a sensitive change
 * (SECURITY_REPORT 3.6.a, 3.5.e, 3.6.d):
 *
 * 1. a fresh proof first (a code to the LOGIN email, or the authenticator: ./fresh-proof-rules.ts);
 * 2. a 6-digit code to the NEW address (it must really be the person's), valid 10 minutes, bound to
 *    that address;
 * 3. then it is saved, every other session of the account ends, and the OLD address (the previous
 *    contact email, else the login email) is told "If this wasn't you…" with the new one masked.
 *
 * Removing it needs the fresh proof only.
 */

const confirmSchema = z.object({ contactEmail: z.string().max(254), code: z.string().trim().regex(SECURITY_CODE_PATTERN) });

async function currentAddresses(userId: string) {
  return db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, contactEmail: true } });
}

/** The address notices go to before the change: the old contact email, else the login email. */
function oldNoticeAddress(row: { email: string; contactEmail: string | null }): string | null {
  const contact = row.contactEmail?.trim();
  if (contact) return contact;
  return isPlaceholderEmail(row.email) ? null : row.email;
}

const captchaSchema = z.object({ captchaToken: z.string().max(2048).nullish() });

export async function sendContactEmailCode(input: unknown): Promise<ActionResult<CodeSent>> {
  return runAction<CodeSent>(async () => {
    const user = await requireUserForAction();
    const parsed = contactEmailSchema.safeParse(input);
    if (!parsed.success || !parsed.data.contactEmail) return fail("invalid_input", { contactEmail: ["invalid_email"] });
    const address = parsed.data.contactEmail;
    const row = await currentAddresses(user.id);
    if (row.contactEmail?.toLowerCase() === address) return fail("contact_email_unchanged");
    await requireFreshProof(user);
    // A code to an address someone typed: the CAPTCHA, like every code send (SECURITY_REPORT 3.2.b,
    // 3.8.a), then the per-inbox waits and caps shared with login codes (./security-code-send.ts).
    const captcha = captchaSchema.safeParse(input);
    if (!(await verifyTurnstile(captcha.success ? captcha.data.captchaToken : null, { expectedAction: "contact_email" }))) return fail("captcha_failed");
    return sendSecurityCodeWithLimits({ user, purpose: "contact", to: address, bindTo: address });
  });
}

export async function confirmContactEmailChange(input: unknown): Promise<ActionResult<{ contactEmail: string; sessionsEnded: number }>> {
  return runAction<{ contactEmail: string; sessionsEnded: number }>(async () => {
    const user = await requireUserForAction();
    const parsed = confirmSchema.safeParse(input);
    const address = parsed.success ? contactEmailSchema.safeParse({ contactEmail: parsed.data.contactEmail }) : null;
    if (!parsed.success || !address?.success || !address.data.contactEmail) return fail("invalid_code");
    const contactEmail = address.data.contactEmail;
    if (!(await rateLimit(`auth:security-code:check:${user.id}`, { limit: 10, windowSeconds: 600 })).ok) return fail("rate_limited");
    // The code was sent only after a fresh proof, and only works for this address.
    const result = await checkSecurityCode({ userId: user.id, purpose: "contact", code: parsed.data.code, bindTo: contactEmail });
    if (result === "wrong") return fail("invalid_code");
    if (result === "expired") return fail("code_expired");
    if (result === "too_many_attempts") return fail("too_many_attempts");

    const before = await currentAddresses(user.id);
    await db.user.update({ where: { id: user.id }, data: { contactEmail } });
    const sessionsEnded = await endOtherSessions(user.id, user.sessionId);
    await consumeFreshProof(user.sessionId);
    await notifySecurityChange({ userId: user.id, kind: "contact_email", masked: maskEmail(contactEmail), oldAddresses: [oldNoticeAddress(before)] });
    return ok({ contactEmail, sessionsEnded });
  });
}

export async function removeContactEmail(): Promise<ActionResult<{ sessionsEnded: number }>> {
  return runAction<{ sessionsEnded: number }>(async () => {
    const user = await requireUserForAction();
    const before = await currentAddresses(user.id);
    if (!before.contactEmail) return ok({ sessionsEnded: 0 });
    await requireFreshProof(user);
    await db.user.update({ where: { id: user.id }, data: { contactEmail: null } });
    const sessionsEnded = await endOtherSessions(user.id, user.sessionId);
    await consumeFreshProof(user.sessionId);
    await notifySecurityChange({ userId: user.id, kind: "contact_email_removed", oldAddresses: [before.contactEmail] });
    return ok({ sessionsEnded });
  });
}
