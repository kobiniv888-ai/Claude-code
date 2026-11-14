"use server";

import { headers } from "next/headers";
import { flattenError } from "zod";
import { after } from "next/server";
import { siteConfig, type AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { codeDisplayForHeaders } from "@/lib/auth/code-display";
import { requireUserForAction } from "@/lib/auth/session";
import { requireAccountEmail } from "@/lib/auth/account-email-guard";
import { getDisplayCurrency } from "@/lib/currency";
import { assertRateLimit, assertRateLimitByIp } from "@/lib/rate-limit";
import { assertNotShabbatMode } from "@/lib/settings";
import { tripPath } from "./constants";
import { afterBookingConfirmed, alertEnvironment, notifyCancellation } from "./alerts";
import { createBookingSchema, guestCancelSchema, hostAskedAnswerSchema, hostCancelSchema, noShowSchema, quoteInputSchema } from "./schemas";
import { refusePaymentFields } from "@/lib/risk/text-guard";
import { requireTermsFor } from "@/lib/legal/terms-server";
import {
  answerHostAsked,
  createBooking,
  getBookingQuote,
  getStayAvailability,
  guestCancel,
  hostCancel,
  markNoShow,
  type BookingQuote,
  type StayAvailability,
} from "./service";

/**
 * Booking server actions. Every one checks the session (and the service checks that the user
 * may act on the booking), validates with zod and is rate-limited. Failures return a code from
 * BOOKING_ERROR_CODES (messages in `booking.errors`) or a shared one (`errors`).
 *
 *   const result = await createBookingAction({ listingId, checkIn, checkOut, adults, children,
 *     infants, roomTypeId, guestName, messageToHost, rulesAccepted: true, locale });
 *   if (result.ok) router.push(result.data.path);   // the confirmation ("/account/trips/BT-…")
 */

function localeOr(value: unknown, fallback: string): AppLocale {
  if (isAppLocale(value)) return value;
  return isAppLocale(fallback) ? fallback : siteConfig.i18n.fallbackLocale;
}

/**
 * Price and availability of a stay (no sign-in needed: the review page and the dates sheet).
 * Hotels: `rooms` lists the free rooms of each room type for the stay (the room picker).
 */
export async function quoteBookingAction(
  input: unknown,
): Promise<ActionResult<BookingQuote & StayAvailability>> {
  return runAction(async () => {
    await assertRateLimitByIp("booking:quote", { limit: 120, windowSeconds: 60 });
    const parsed = quoteInputSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", flattenError(parsed.error).fieldErrors);
    const { listingId, ...stay } = parsed.data;
    const raw = input as { currency?: unknown; locale?: unknown };
    const currency = await getDisplayCurrency(typeof raw.currency === "string" ? raw.currency : null, localeOr(raw.locale, "en"));
    const result = await getBookingQuote({ listingId, ...stay }, { displayCurrency: currency });
    if (!result.ok) return fail(result.error === "not_found" ? "not_found" : result.error);
    const availability = await getStayAvailability({ listingId, ...stay });
    return ok({
      quote: result.quote,
      roomType: result.roomType,
      cancellationPolicy: result.cancellationPolicy,
      paymentMethods: result.paymentMethods,
      ...availability,
    });
  });
}

/** Books the stay. Needs a signed-in guest with a verified phone (see <PhoneCheck>). */
export async function createBookingAction(input: unknown): Promise<ActionResult<{ id: string; code: string; path: string }>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    // Founder's answer (5): every account has an email before it books (the booking emails, and a
    // way to sign in when texts are capped).
    requireAccountEmail(user);
    await assertNotShabbatMode();
    await assertRateLimitByIp("booking:create", { limit: 20, windowSeconds: 3600 });
    const parsed = createBookingSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors = flattenError(parsed.error).fieldErrors;
      if (fieldErrors.rulesAccepted) return fail("rules_not_accepted", fieldErrors);
      return fail("invalid_input", fieldErrors);
    }
    const data = parsed.data;
    // SECURITY_REPORT 14.2.a: no payment details in what the host reads (src/lib/risk/text-guard.ts).
    const paymentErrors = await refusePaymentFields({ surface: "booking_message", userId: user.id, fields: { messageToHost: data.messageToHost } });
    if (paymentErrors) return fail("payment_in_text", paymentErrors);
    // SECURITY_REPORT 15.11.b/c: the first booking, and the next one after the Terms changed, needs
    // the ticked "18 or older + Terms" box in this request (logged in TermsAcceptance).
    await requireTermsFor(user.id, "booking", input);
    const locale = localeOr((input as { locale?: unknown }).locale, user.locale);
    const requestHeaders = await headers();
    const alerts = alertEnvironment(requestHeaders);
    // The host's alert is sent inside createBooking (the booking stands only once a confirming
    // channel accepted it); the guest's confirmation and the host's notification follow after
    // the response.
    const booking = await createBooking({
      ...data,
      guestUserId: user.id,
      rulesAccepted: data.rulesAccepted,
      locale,
      displayCurrency: await getDisplayCurrency(user.currency, locale),
      // Demo listings are made up: bookable only in development / test mode.
      allowDemoListing: codeDisplayForHeaders(requestHeaders) !== null,
      alerts,
      notify: false,
    });
    // A repeated attempt (the same idempotency key) found the booking already made: its first
    // attempt sends the confirmation.
    if (!booking.repeated) after(() => afterBookingConfirmed(booking.id, new Date(), alerts));
    return ok({ id: booking.id, code: booking.code, path: tripPath(booking.code) });
  });
}

/** The guest cancels their booking, with a reason (GUEST_CANCEL_REASONS; OTHER needs text). */
export async function cancelBookingAsGuestAction(input: unknown): Promise<ActionResult<{ code: string; late: boolean }>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    await assertRateLimit(`booking:cancel:${user.id}`, { limit: 20, windowSeconds: 3600 });
    const parsed = guestCancelSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", flattenError(parsed.error).fieldErrors);
    const guestReason = await refusePaymentFields({ surface: "booking_cancel_reason", userId: user.id, fields: { reasonText: parsed.data.reasonText } });
    if (guestReason) return fail("payment_in_text", guestReason);
    const result = await guestCancel({ ...parsed.data, guestUserId: user.id, notify: false });
    const alerts = alertEnvironment(await headers());
    after(() => notifyCancellation(parsed.data.bookingId, alerts));
    return ok({ code: result.code, late: result.late });
  });
}

/** The host cancels a booking of their listing, only with a reason (logged; early ones are flagged). */
export async function cancelBookingAsHostAction(input: unknown): Promise<ActionResult<{ code: string }>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    await assertRateLimit(`booking:cancel:${user.id}`, { limit: 20, windowSeconds: 3600 });
    const parsed = hostCancelSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", flattenError(parsed.error).fieldErrors);
    const hostReason = await refusePaymentFields({ surface: "booking_cancel_reason", userId: user.id, fields: { reasonText: parsed.data.reasonText } });
    if (hostReason) return fail("payment_in_text", hostReason);
    const result = await hostCancel({ ...parsed.data, hostUserId: user.id, notify: false });
    after(() => notifyCancellation(parsed.data.bookingId));
    return ok({ code: result.code });
  });
}

/**
 * The host answers "the guest says you asked them to cancel" (founder's answer (4)): "confirm" or
 * "deny". Only the booking's host (service checks the host id), only while it waits for the answer
 * (72 hours); validated, rate-limited, logged (./service.ts answerHostAsked).
 */
export async function answerHostAskedAction(input: unknown): Promise<ActionResult<{ code: string; state: "confirmed" | "denied" }>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    await assertRateLimit(`booking:host-asked:${user.id}`, { limit: 20, windowSeconds: 3600 });
    const parsed = hostAskedAnswerSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", flattenError(parsed.error).fieldErrors);
    return ok(await answerHostAsked({ ...parsed.data, hostUserId: user.id }));
  });
}

/** "לא הגיע": the host reports that the guest did not arrive (logged; rules come later). */
export async function reportNoShowAction(input: unknown): Promise<ActionResult<{ code: string }>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    await assertRateLimit(`booking:no-show:${user.id}`, { limit: 20, windowSeconds: 3600 });
    const parsed = noShowSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", flattenError(parsed.error).fieldErrors);
    return ok(await markNoShow({ bookingId: parsed.data.bookingId, hostUserId: user.id }));
  });
}
