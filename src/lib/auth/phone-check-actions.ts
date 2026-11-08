"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { z } from "zod";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { INSTANT_DEAL_TYPES } from "@/lib/booking/constants";
import { db } from "@/lib/db";
import { demoAllowed } from "@/lib/site-env";
import { verifyTurnstile } from "@/lib/turnstile";
import { codeDisplayForHeaders } from "./code-display";
import { authErrorKey, timedActionError } from "./error-codes";
import { limitLoginCodeChecks, limitPhoneCheckRequests } from "./login-rate-limit";
import { normalizePhone } from "@/lib/phone";
import { checkLoginPhoneNumber } from "./phone";
import { PHONE_CHECK_PLACES, isHostAccount, phoneCheckAllowedAt } from "./phone-check-policy";
import { isPhoneAlreadyVerified, phoneCheckStep } from "./phone-once";
import { auth } from "./server";
import { requireUserForAction } from "./session";
import { requireFreshProof } from "./fresh-proof";
import { isPhoneReplacement } from "./fresh-proof-rules";
import { afterPhoneChanged } from "./phone-change";
import { forgetScreenCode, phoneCodeKey, phoneCodeRoute, readScreenCode } from "./sms";

/**
 * "Verify your phone" for a signed-in account (founder request, round 2): a guest making a booking
 * and a host before posting. Once per number: when the account already has the number verified,
 * nothing is sent. Codes go through the Better Auth phone-number plugin (our own text through
 * Twilio Messaging, or on screen in test mode — ./sms.ts), so the same rules apply as everywhere:
 * mobile numbers in Israel / Georgia only, resend waits and daily caps, the SMS budget.
 *
 * The SERVER checks where the request comes from (SECURITY_REPORT 3.2.f, ./phone-check-policy.ts):
 * `place: "booking"` needs a listing that can be booked on the site (not the account's own),
 * `"account"` a host. The UI is <PhoneCheck> (src/components/auth/phone-check.tsx). Error codes are
 * keys in `auth.errors.*`; a wait comes as "code_wait:<seconds>" (./error-codes.ts).
 */

const sendSchema = z.object({
  phoneNumber: z.string().trim().max(20),
  captchaToken: z.string().max(2048).nullish(),
  place: z.enum(PHONE_CHECK_PLACES),
  listingId: z.string().trim().min(1).max(64).nullish(),
});
const confirmSchema = z.object({
  phoneNumber: z.string().trim().max(20),
  code: z.string().trim().regex(/^\d{6}$/),
});

export type PhoneCodeSent =
  /** This account already has the number verified: no code was sent. */
  | { status: "already_verified"; phoneNumber: string }
  /** `screenCode`: the code itself, only in test mode (shown in the form). */
  | { status: "sent"; phoneNumber: string; screenCode: string | null };

/** Better Auth APIError → an `auth.errors.*` key (with the wait for our code limits); anything else is re-thrown. */
function apiFailure(error: unknown) {
  if (!(error instanceof APIError)) throw error;
  const body = error.body as { code?: string; message?: string; retryAfter?: number } | undefined;
  const key = authErrorKey({ code: body?.code, message: body?.message, status: error.statusCode });
  if ((key === "code_wait" || key === "code_daily_cap") && typeof body?.retryAfter === "number") {
    return fail(timedActionError(key, body.retryAfter));
  }
  return fail(key);
}

/** Is a phone check allowed from this place, for this account? (server facts; ./phone-check-policy.ts) */
async function placeAllows(userId: string, place: (typeof PHONE_CHECK_PLACES)[number], listingId: string | null | undefined) {
  if (place === "post") return phoneCheckAllowedAt(place, { isHost: false, bookableListing: null });
  if (place === "account") {
    const listings = await db.listing.count({ where: { ownerId: userId, deletedAt: null } });
    return phoneCheckAllowedAt(place, { isHost: isHostAccount(listings), bookableListing: null });
  }
  if (!listingId) return false;
  const listing = await db.listing.findFirst({
    where: {
      id: listingId,
      deletedAt: null,
      status: "LIVE",
      bookingMode: "INSTANT",
      dealType: { in: [...INSTANT_DEAL_TYPES] },
      ...(demoAllowed() ? {} : { isDemo: false }),
    },
    select: { ownerId: true },
  });
  return phoneCheckAllowedAt(place, {
    isHost: false,
    bookableListing: listing ? { ownListing: listing.ownerId === userId } : null,
  });
}

export async function sendPhoneCheckCode(input: unknown): Promise<ActionResult<PhoneCodeSent>> {
  return runAction<PhoneCodeSent>(async () => {
    const user = await requireUserForAction();
    const parsed = sendSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_phone");
    // "+972 053…" or "+9720…" → "+97253…" before the strict check (brief 2.5).
    const check = checkLoginPhoneNumber(normalizePhone(parsed.data.phoneNumber) ?? parsed.data.phoneNumber);
    if (!check.ok) {
      return fail(check.reason === "country_not_supported" ? "country_not_supported" : check.reason === "not_mobile" ? "not_mobile" : "invalid_phone");
    }
    const phoneNumber = check.e164;
    // Reveals only this account's own state, so it may come before the limits.
    if (isPhoneAlreadyVerified(user, phoneNumber)) return ok({ status: "already_verified", phoneNumber });
    // SMS only where the founder allowed it: a guest's booking, a host's phone check.
    if (!(await placeAllows(user.id, parsed.data.place, parsed.data.listingId))) return fail("phone_check_not_here");
    // Replacing a verified number is a sensitive change: a fresh code first (SECURITY_REPORT 3.6.a).
    if (isPhoneReplacement(user, phoneNumber)) await requireFreshProof(user);

    // "phone_taken" tells whether some account has this number: charge the limits and check the
    // CAPTCHA before looking, so the action cannot be used to test numbers in bulk (hardening A1).
    // The answer comes before any SMS is sent (founder's answer Q5 A: no SMS wasted on it).
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
      // Runs the same hooks as the login form: number rules, resend waits, daily caps, SMS budget.
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
    // "+972 053…" or "+9720…" → "+97253…" before the strict check (brief 2.5).
    const check = checkLoginPhoneNumber(normalizePhone(parsed.data.phoneNumber) ?? parsed.data.phoneNumber);
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
    // A replaced number: other sessions end, the old channel (email) is told (SECURITY_REPORT 3.5.e, 3.6.d).
    if (isPhoneReplacement(user, phoneNumber)) await afterPhoneChanged({ userId: user.id, sessionId: user.sessionId, newPhone: phoneNumber });
    return ok({ phoneNumber });
  });
}
