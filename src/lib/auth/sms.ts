import "server-only";
import { getTranslations } from "next-intl/server";
import { siteConfig } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { db } from "@/lib/db";
import { isEmailDeliveryConfigured } from "@/lib/email";
import { recordSecurityEvent } from "@/lib/security/events";
import { TWILIO_SMS_PUMPING_BLOCKED, isSmsConfigured, maskPhone, sendSms } from "@/lib/sms";
import { codeDisplayForHeaders, type CodeDisplayMode } from "./code-display";
import { checkLoginPhoneNumber } from "./phone";
import { recordSmsCodeSent, releaseSmsSend, reserveSmsSend, smsPausedFor, smsSourceForThisCall, type SmsSource } from "./sms-guard";

/**
 * How phone and email codes reach people.
 *
 * Phone codes (founder's answer Q9): Better Auth makes the code (secure random), we store only its
 * keyed hash (./phone-code.ts) and send OUR OWN text ("auth.sms.code": the code, how long it
 * lives, and "Never share this code. Bayit will never ask you for it.") through Twilio Programmable
 * Messaging (`sendSms`, a Messaging Service). Twilio Verify is not used. Before a text goes out:
 * a mobile number in Israel or Georgia (./phone.ts), its country not paused and the daily SMS
 * budget not used up (./sms-guard.ts). Email codes: Resend through `sendEmail`.
 *
 * TEST MODE only (./code-display.ts: AUTH_TEST_MODE=true on a development or staging site, on the
 * site's own address): with no SMS / email service set up, the code is kept in memory and shown
 * in the form (GET /api/dev/last-otp). The demo accounts' phone numbers are fake, so in test mode
 * their codes are always shown, even when Twilio is set up. Codes are never written to the log.
 */

// ── Codes shown on screen (memory; survives hot reloads) ──

type ScreenCode = { code: string; expiresAt: number };
const globalForCodes = globalThis as unknown as { __bayitScreenCodes?: Map<string, ScreenCode> };
const screenCodes = (globalForCodes.__bayitScreenCodes ??= new Map<string, ScreenCode>());

export const phoneCodeKey = (phoneNumber: string) => `phone:${phoneNumber}`;
export const emailCodeKey = (email: string) => `email:${email.trim().toLowerCase()}`;

export function rememberScreenCode(key: string, code: string, ttlSeconds: number) {
  screenCodes.set(key, { code, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/** The last code for `key`, only while codes may be shown for this request. */
export function readScreenCode(key: string, display: CodeDisplayMode | null): string | null {
  if (!display) return null;
  const entry = screenCodes.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    screenCodes.delete(key);
    return null;
  }
  return entry.code;
}

export function forgetScreenCode(key: string) {
  screenCodes.delete(key);
}

// ── Which way a code goes ──

/** Some SMS service is set up: phone codes reach real phones. */
export function isSmsServiceConfigured(): boolean {
  return isSmsConfigured();
}

async function isDemoPhone(phoneNumber: string): Promise<boolean> {
  const user = await db.user
    .findUnique({ where: { phoneNumber }, select: { isDemo: true } })
    .catch(() => null);
  return !!user?.isDemo;
}

export type PhoneCodeRoute = "screen" | "sms" | "unavailable";

export async function phoneCodeRoute(
  phoneNumber: string,
  headers: Pick<Headers, "get"> | null | undefined,
): Promise<PhoneCodeRoute> {
  if (codeDisplayForHeaders(headers) && (!isSmsServiceConfigured() || (await isDemoPhone(phoneNumber)))) {
    return "screen";
  }
  if (isSmsConfigured()) return "sms";
  return "unavailable";
}

export type EmailCodeRoute = "screen" | "email" | "unavailable";

export function emailCodeRoute(headers: Pick<Headers, "get"> | null | undefined): EmailCodeRoute {
  if (isEmailDeliveryConfigured()) return "email";
  return codeDisplayForHeaders(headers) ? "screen" : "unavailable";
}

// ── Sending ──

export type SmsUnavailableReason = "unavailable" | "paused" | "limited" | "pumping_blocked";

export class SmsUnavailableError extends Error {
  /**
   * "paused": the daily budget is used up (or only trusted sources may use what is left) or the
   * country is paused; "limited": this account or IP block used its share or has too many codes
   * nobody entered (./sms-guard.ts); "pumping_blocked": Twilio's SMS Pumping Protection refused
   * the text (error 30450): "try again in a few minutes, or sign in with email".
   */
  readonly reason: SmsUnavailableReason;
  constructor(message: string, reason: SmsUnavailableReason = "unavailable") {
    super(message);
    this.name = "SmsUnavailableError";
    this.reason = reason;
  }
}

/** The text of a code SMS in the person's language (kept short: one or two SMS parts). */
export async function codeSmsText(input: { code: string; ttlSeconds: number; locale?: string | null }): Promise<string> {
  const locale = isAppLocale(input.locale) ? input.locale : "en";
  const t = await getTranslations({ locale, namespace: "auth.sms" });
  return t("code", {
    code: input.code,
    minutes: Math.round(input.ttlSeconds / 60),
    brand: siteConfig.localizedName[locale] ?? siteConfig.name,
  });
}

/** What `guardSmsCodeSend` reserved: the checked number and the source charged for it. */
export type SmsCodeSendGuard = { e164: string; country: string; source: SmsSource };

/**
 * The checks right before a paid code text, and the reservation that counts it (SECURITY_REPORT
 * 3.2.c/d): the number's rules again, the source's country pause, the daily budget, the source's
 * 24-hour share and its brake on codes nobody entered (./sms-guard.ts). Throws SmsUnavailableError
 * ("paused" / "limited" / "unavailable") when no text may go out.
 *
 * The neutral phone-check send (a number another account has, founder's answer (5),
 * ./phone-neutral.ts) runs THIS too and keeps the reservation, so a braked or over-share source
 * gets the same "rate_limited" for every number and the counters move as for an unanswered text
 * (S2 review FC-1): only the text itself and its "sent" event are skipped.
 */
export async function guardSmsCodeSend(phoneNumber: string): Promise<SmsCodeSendGuard> {
  // Checked again right before the paid text (the hooks in ./server.ts checked them first).
  const destination = checkLoginPhoneNumber(phoneNumber);
  if (!destination.ok) throw new SmsUnavailableError(`SMS refused: ${destination.reason}`);
  // Who asks (the account and IP block): brakes and shares are per source first (./sms-guard.ts).
  const source = await smsSourceForThisCall();
  if (await smsPausedFor(destination.country, source)) {
    throw new SmsUnavailableError(`SMS codes to ${destination.country} are paused`, "paused");
  }
  const reservation = await reserveSmsSend(source);
  if (!reservation.ok) {
    const limited = reservation.reason === "share" || reservation.reason === "brake";
    throw new SmsUnavailableError(`No code text: ${reservation.reason}`, limited ? "limited" : "paused");
  }
  return { e164: destination.e164, country: destination.country, source };
}

/**
 * Sends a phone code along `route` (see `phoneCodeRoute`). `code` is the one Better Auth made:
 * shown on screen (test mode) or sent as our own text. Throws SmsUnavailableError when it cannot go.
 * `guarded`: the caller already ran `guardSmsCodeSend` for this send (./server.ts sendOTP).
 */
export async function sendLoginCode(input: {
  phoneNumber: string;
  code: string;
  ttlSeconds: number;
  locale?: string | null;
  route: PhoneCodeRoute;
  guarded?: SmsCodeSendGuard;
}): Promise<void> {
  if (input.route === "screen") {
    rememberScreenCode(phoneCodeKey(input.phoneNumber), input.code, input.ttlSeconds);
    console.info(`[auth] test mode: the login code for ${maskPhone(input.phoneNumber)} is shown on screen`);
    return;
  }
  if (input.route !== "sms") throw new SmsUnavailableError("No SMS service is set up");

  const { e164, country, source } = input.guarded ?? (await guardSmsCodeSend(input.phoneNumber));
  const result = await sendSms({
    to: e164,
    body: await codeSmsText(input),
    logAs: `[login code for ${maskPhone(e164)}]`,
  });
  if (!result.ok) {
    await releaseSmsSend(source);
    if (result.errorCode === TWILIO_SMS_PUMPING_BLOCKED) {
      // Twilio's SMS Pumping Protection blocked it (no text, no cost): an event for the security
      // alerts, with the country and the source's account only, never the number.
      await recordSecurityEvent({
        type: "sms_pumping_blocked",
        userId: source.userId,
        meta: { country, trusted: source.trusted, twilioError: TWILIO_SMS_PUMPING_BLOCKED },
      });
      throw new SmsUnavailableError("Twilio SMS Pumping Protection blocked the code", "pumping_blocked");
    }
    throw new SmsUnavailableError("Twilio Messaging could not send the code");
  }
  if (result.delivered) await recordSmsCodeSent(country, source);
}
