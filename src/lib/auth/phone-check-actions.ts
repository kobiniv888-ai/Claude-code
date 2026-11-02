"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { z } from "zod";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { db } from "@/lib/db";
import { verifyTurnstile } from "@/lib/turnstile";
import { codeDisplayForHeaders } from "./code-display";
import { authErrorKey } from "./error-codes";
import { limitLoginCodeChecks, limitPhoneCheckRequests } from "./login-rate-limit";
import { checkLoginPhoneNumber } from "./phone";
import { isPhoneAlreadyVerified, phoneCheckStep } from "./phone-once";
import { auth } from "./server";
import { requireUserForAction } from "./session";
import { forgetScreenCode, phoneCodeKey, phoneCodeRoute, readScreenCode } from "./sms";

/**
 * "Verify your phone" for a signed-in account (founder request, round 2): a guest making a booking
 * and a host before posting. Once per number: when the account already has the number verified,
 * nothing is sent. Codes go through the Better Auth phone-number plugin (Twilio Verify, Twilio
 * Messaging, or on screen in development / test mode — ./sms.ts). The UI is <PhoneCheck>
 * (src/components/auth/phone-check.tsx). Error codes are keys in `auth.errors.*`.
 */

const sendSchema = z.object({
  phoneNumber: z.string().trim().max(20),
  captchaToken: z.string().max(2048).nullish(),
});
const confirmSchema = z.object({
  phoneNumber: z.string().trim().max(20),
  code: z.string().trim().regex(/^\d{6}$/),
});

export type PhoneCodeSent =
  /** This account already has the number verified: no code was sent. */
  | { status: "already_verified"; phoneNumber: string }
  /** `screenCode`: the code itself, only in development / test mode (shown in the form). */
  | { status: "sent"; phoneNumber: string; screenCode: string | null };

/** Better Auth APIError → an `auth.errors.*` key; anything else is re-thrown. */
function apiFailure(error: unknown) {
  if (!(error instanceof APIError)) throw error;
  const body = error.body as { code?: string; message?: string } | undefined;
  return fail(authErrorKey({ code: body?.code, message: body?.message, status: error.statusCode }));
}

export async function sendPhoneCheckCode(input: unknown): Promise<ActionResult<PhoneCodeSent>> {
  return runAction<PhoneCodeSent>(async () => {
    const user = await requireUserForAction();
    const parsed = sendSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_phone");
    const check = checkLoginPhoneNumber(parsed.data.phoneNumber);
    if (!check.ok) return fail(check.reason === "country_not_supported" ? "country_not_supported" : "invalid_phone");
    const phoneNumber = check.e164;
    // Reveals only this account's own state, so it may come before the limits.
    if (isPhoneAlreadyVerified(user, phoneNumber)) return ok({ status: "already_verified", phoneNumber });

    // "phone_taken" tells whether some account has this number: charge the limits and check the
    // CAPTCHA before looking, so the action cannot be used to test numbers in bulk (hardening A1).
    if (!(await limitPhoneCheckRequests(user.id))) return fail("rate_limited");
    if (!(await verifyTurnstile(parsed.data.captchaToken, { expectedAction: "login" }))) return fail("captcha_failed");

    const other = await db.user.findFirst({
      where: { phoneNumber, NOT: { id: user.id } },
      select: { id: true },
    });
    const step = phoneCheckStep(user, phoneNumber, { usedByAnotherAccount: !!other });
    if (step === "already_verified") return ok({ status: "already_verified", phoneNumber });
    if (step === "phone_taken") return fail("phone_taken");

    const requestHeaders = await headers();
    if ((await phoneCodeRoute(phoneNumber, requestHeaders)) === "unavailable") return fail("phone_check_unavailable");

    try {
      // Runs the same hooks as the login form: number rules and the per-number / per-IP limits.
      await auth.api.sendPhoneNumberOTP({ body: { phoneNumber }, headers: requestHeaders });
    } catch (error) {
      return apiFailure(error);
    }
    const screenCode = readScreenCode(phoneCodeKey(phoneNumber), codeDisplayForHeaders(requestHeaders));
    return ok({ status: "sent", phoneNumber, screenCode });
  });
}

export async function confirmPhoneCheckCode(input: unknown): Promise<ActionResult<{ phoneNumber: string }>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = confirmSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_code");
    const check = checkLoginPhoneNumber(parsed.data.phoneNumber);
    if (!check.ok) return fail("invalid_phone");
    const phoneNumber = check.e164;
    if (isPhoneAlreadyVerified(user, phoneNumber)) return ok({ phoneNumber });
    if (!(await limitLoginCodeChecks())) return fail("rate_limited");

    try {
      // Checks and uses up the code without touching any account or session.
      await auth.api.consumePhoneNumberOTP({ body: { phoneNumber, code: parsed.data.code }, headers: await headers() });
    } catch (error) {
      return apiFailure(error);
    }
    try {
      await db.user.update({ where: { id: user.id }, data: { phoneNumber, phoneNumberVerified: true } });
    } catch (error) {
      // Another account took the number in the meantime (phoneNumber is unique).
      if ((error as { code?: string }).code === "P2002") return fail("phone_taken");
      throw error;
    }
    forgetScreenCode(phoneCodeKey(phoneNumber));
    return ok({ phoneNumber });
  });
}
