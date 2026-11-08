"use server";

import { randomUUID } from "node:crypto";
import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { z } from "zod";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { INSTANT_DEAL_TYPES } from "@/lib/booking/constants";
import { db } from "@/lib/db";
import { demoAllowed } from "@/lib/site-env";
import { verifyTurnstile } from "@/lib/turnstile";
import { codeDisplayForHeaders } from "./code-display";
import { LOGIN_CODE_TTL_SECONDS } from "./code-rules";
import { authErrorKey, timedActionError } from "./error-codes";
import { limitLoginCodeChecks, limitNewHostPhoneChecks, limitPhoneCheckRequests } from "./login-rate-limit";
import { normalizePhone } from "@/lib/phone";
import { checkLoginPhoneNumber } from "./phone";
import {
  PHONE_CHECK_PLACES,
  decodePhoneCheckBinding,
  encodePhoneCheckBinding,
  isHostAccount,
  phoneCheckAllowedAt,
  phoneCheckBindingKey,
} from "./phone-check-policy";
import { isPhoneAlreadyVerified, phoneCheckStep } from "./phone-once";
import { isPostPhoneStepToken } from "./phone-check-token";
import { auth } from "./server";
import { requireUserForAction } from "./session";
import { requireFreshProof } from "./fresh-proof";
import { isPhoneReplacement } from "./fresh-proof-rules";
import { afterPhoneChanged } from "./phone-change";
import { forgetScreenCode, phoneCodeKey, phoneCodeRoute, readScreenCode } from "./sms";
import { requestSmsSource, withSmsSource } from "./sms-guard";

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
 *
 * A code works only in the SESSION that asked for it (SECURITY_REPORT 3.6.a, 3.5.e): the plugin
 * stores the code under the number alone, so after a send we write our own binding row
 * ("phone-check:<sessionId>:<number>", Verification table, 10 minutes, no schema change) saying
 * whether the send was a replacement of a verified number made with a fresh proof. Confirming
 * without this session's binding is refused BEFORE the code is touched: another account's code
 * cannot replace this account's verified phone, and nobody else can burn a pending code's tries.
 */

const sendSchema = z.object({
  phoneNumber: z.string().trim().max(20),
  captchaToken: z.string().max(2048).nullish(),
  place: z.enum(PHONE_CHECK_PLACES),
  listingId: z.string().trim().min(1).max(64).nullish(),
  /** `place: "post"` before the first draft: the token /verify-phone gave the post form's phone step. */
  postStepToken: z.string().max(200).nullish(),
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

type PlaceDecision = { allowed: boolean; newHost?: boolean };

/** Is a phone check allowed from this place, for this account? (server facts; ./phone-check-policy.ts) */
async function placeAllows(
  userId: string,
  place: (typeof PHONE_CHECK_PLACES)[number],
  listingId: string | null | undefined,
  postStepToken: string | null | undefined,
): Promise<PlaceDecision> {
  if (place === "post" || place === "account") {
    const listings = await db.listing.count({ where: { ownerId: userId, deletedAt: null } });
    const isHost = isHostAccount(listings);
    if (place === "account") return { allowed: phoneCheckAllowedAt(place, { isHost, bookableListing: null }) };
    const postStep = !isHost && isPostPhoneStepToken(userId, postStepToken);
    return { allowed: phoneCheckAllowedAt(place, { isHost, bookableListing: null, postStep }), newHost: !isHost };
  }
  if (!listingId) return { allowed: false };
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
  return {
    allowed: phoneCheckAllowedAt(place, {
      isHost: false,
      bookableListing: listing ? { ownListing: listing.ownerId === userId } : null,
    }),
  };
}

/** Replaces this session's binding for the number (written after the code was sent). */
async function bindCodeToSession(user: { id: string; sessionId: string }, phoneNumber: string, mode: "first" | "replace") {
  const identifier = phoneCheckBindingKey(user.sessionId, phoneNumber);
  await db.$transaction([
    db.verification.deleteMany({ where: { identifier } }),
    db.verification.create({
      data: {
        id: randomUUID(),
        identifier,
        value: encodePhoneCheckBinding({ userId: user.id, mode }),
        expiresAt: new Date(Date.now() + LOGIN_CODE_TTL_SECONDS * 1000),
      },
    }),
  ]);
}

/** This session's live binding for the number (null: none, expired, or another account's). */
async function sessionBinding(user: { id: string; sessionId: string }, phoneNumber: string) {
  const row = await db.verification.findFirst({
    where: { identifier: phoneCheckBindingKey(user.sessionId, phoneNumber) },
    orderBy: { createdAt: "desc" },
    select: { value: true, expiresAt: true },
  });
  if (!row || row.expiresAt.getTime() <= Date.now()) return null;
  const binding = decodePhoneCheckBinding(row.value);
  return binding && binding.userId === user.id ? binding : null;
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
    const place = await placeAllows(user.id, parsed.data.place, parsed.data.listingId, parsed.data.postStepToken);
    if (!place.allowed) return fail("phone_check_not_here");
    // Replacing a verified number is a sensitive change: a fresh code first (SECURITY_REPORT 3.6.a).
    if (isPhoneReplacement(user, phoneNumber)) await requireFreshProof(user);

    // "phone_taken" tells whether some account has this number: charge the limits and check the
    // CAPTCHA before looking, so the action cannot be used to test numbers in bulk (hardening A1).
    // The answer comes before any SMS is sent (founder's answer Q5 A: no SMS wasted on it).
    if (!(await limitPhoneCheckRequests(user.id))) return fail("rate_limited");
    if (place.newHost && !(await limitNewHostPhoneChecks(user.id))) return fail("rate_limited");
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
      // The source (this account, its IP block, trusted or not) drives the SMS brakes (./sms-guard.ts).
      const source = await requestSmsSource(user.id);
      await withSmsSource(source, () => auth.api.sendPhoneNumberOTP({ body: { phoneNumber }, headers: requestHeaders }));
    } catch (error) {
      return apiFailure(error);
    }
    // This session (and only this one) may confirm the code. "replace": the fresh proof was checked
    // above for replacing a verified number.
    await bindCodeToSession(user, phoneNumber, isPhoneReplacement(user, phoneNumber) ? "replace" : "first");
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
    // Only a code THIS session asked for, checked before the code is touched (see the top).
    const binding = await sessionBinding(user, phoneNumber);
    if (!binding) return fail("code_expired");
    // Replacing a verified number needs the fresh proof: given at send time ("replace"), or now (a
    // number that became verified after the send).
    if (isPhoneReplacement(user, phoneNumber) && binding.mode !== "replace") await requireFreshProof(user);
    if (!(await limitLoginCodeChecks())) return fail("rate_limited");

    try {
      // Checks and uses up the code without touching any account or session.
      const requestHeaders = await headers();
      const source = await requestSmsSource(user.id);
      await withSmsSource(source, () => auth.api.consumePhoneNumberOTP({ body: { phoneNumber, code: parsed.data.code }, headers: requestHeaders }));
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
    await db.verification.deleteMany({ where: { identifier: phoneCheckBindingKey(user.sessionId, phoneNumber) } });
    // A replaced number: other sessions end, the old channel (email) is told (SECURITY_REPORT 3.5.e, 3.6.d).
    if (isPhoneReplacement(user, phoneNumber)) await afterPhoneChanged({ userId: user.id, sessionId: user.sessionId, newPhone: phoneNumber });
    return ok({ phoneNumber });
  });
}
