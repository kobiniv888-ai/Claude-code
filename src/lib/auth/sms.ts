
import "server-only";
import { getTranslations } from "next-intl/server";
import { siteConfig } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { db } from "@/lib/db";
import { isEmailDeliveryConfigured } from "@/lib/email";
import { isSmsConfigured, maskPhone, sendSms, twilioErrorSummary } from "@/lib/sms";
import { codeDisplayForHeaders, type CodeDisplayMode } from "./code-display";

/**
 * How phone and email codes reach people.
 *
 * Phone codes: Twilio Verify (it makes and checks its own codes), else Twilio Messaging through
 * `sendSms` (Better Auth makes and checks the code), else nothing. Email codes: Resend through
 * `sendEmail`. When no service is set up, and only where codes may be shown on screen
 * (./code-display.ts: development, or AUTH_TEST_MODE on localhost / a Codespaces preview), the code
 * is kept in memory and shown in the form (GET /api/dev/last-otp). The demo accounts' phone numbers
 * are fake, so in that mode their codes are always shown, even when Twilio is set up.
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
  return isTwilioConfigured() || isSmsConfigured();
}

async function isDemoPhone(phoneNumber: string): Promise<boolean> {
  const user = await db.user
    .findUnique({ where: { phoneNumber }, select: { isDemo: true } })
    .catch(() => null);
  return !!user?.isDemo;
}

export type PhoneCodeRoute = "screen" | "verify" | "sms" | "unavailable";

export async function phoneCodeRoute(
  phoneNumber: string,
  headers: Pick<Headers, "get"> | null | undefined,
): Promise<PhoneCodeRoute> {
  if (codeDisplayForHeaders(headers) && (!isSmsServiceConfigured() || (await isDemoPhone(phoneNumber)))) {
    return "screen";
  }
  if (isTwilioConfigured()) return "verify";
  if (isSmsConfigured()) return "sms";
  return "unavailable";
}

export type EmailCodeRoute = "screen" | "email" | "unavailable";

export function emailCodeRoute(headers: Pick<Headers, "get"> | null | undefined): EmailCodeRoute {
  if (isEmailDeliveryConfigured()) return "email";
  return codeDisplayForHeaders(headers) ? "screen" : "unavailable";
}

// ── Twilio Verify ──

const VERIFY_API = "https://verify.twilio.com/v2";
const REQUEST_TIMEOUT_MS = 10_000;

type TwilioConfig = {
  accountSid: string;
  authToken: string;
  serviceSid: string;
  channel: "sms" | "whatsapp";
};

function twilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!accountSid || !authToken || !serviceSid) return null;
  const channel = process.env.TWILIO_VERIFY_CHANNEL === "whatsapp" ? "whatsapp" : "sms";
  return { accountSid, authToken, serviceSid, channel };
}

/** Twilio Verify is set up (it makes and checks the phone codes). */
export function isTwilioConfigured(): boolean {
  return twilioConfig() !== null;
}

/** Twilio Verify message languages we can use (Georgian is not offered by Twilio). */
const TWILIO_LOCALES = new Set(["he", "en", "ru", "ar"]);

async function twilioRequest(config: TwilioConfig, path: string, body: Record<string, string>) {
  const credentials = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");
  return fetch(`${VERIFY_API}/Services/${config.serviceSid}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
}

export class SmsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmsUnavailableError";
  }
}

/**
 * Sends a phone code along `route` (see `phoneCodeRoute`). `code` is the one Better Auth made:
 * shown on screen or sent by `sendSms`; Twilio Verify makes its own.
 */
export async function sendLoginCode(input: {
  phoneNumber: string;
  code: string;
  ttlSeconds: number;
  locale?: string | null;
  route: PhoneCodeRoute;
}): Promise<void> {
  if (input.route === "screen") {
    rememberScreenCode(phoneCodeKey(input.phoneNumber), input.code, input.ttlSeconds);
    console.info(`[auth] Login code for ${input.phoneNumber} (shown on screen): ${input.code}`);
    return;
  }
  if (input.route === "sms") {
    const locale = isAppLocale(input.locale) ? input.locale : "en";
    const t = await getTranslations({ locale, namespace: "auth.sms" });
    const minutes = Math.round(input.ttlSeconds / 60);
    const result = await sendSms({
      to: input.phoneNumber,
      body: t("code", { code: input.code, minutes, brand: siteConfig.localizedName[locale] ?? siteConfig.name }),
      logAs: `[login code for ${maskPhone(input.phoneNumber)}]`,
    });
    if (!result.ok) throw new SmsUnavailableError("Twilio Messaging could not send the code");
    return;
  }
  const config = input.route === "verify" ? twilioConfig() : null;
  if (!config) throw new SmsUnavailableError("No SMS service is set up");

  const body: Record<string, string> = { To: input.phoneNumber, Channel: config.channel };
  if (input.locale && TWILIO_LOCALES.has(input.locale)) body.Locale = input.locale;

  let response: Response;
  try {
    response = await twilioRequest(config, "Verifications", body);
  } catch (error) {
    throw new SmsUnavailableError(`Twilio Verify request failed: ${(error as Error).message}`);
  }
  if (!response.ok) {
    throw new SmsUnavailableError(`Twilio Verify returned ${await twilioErrorSummary(response)}`);
  }
}

export type CodeCheck = "approved" | "wrong" | "expired" | "too_many_attempts";

/** Checks a code with Twilio Verify. */
export async function checkLoginCode(phoneNumber: string, code: string): Promise<CodeCheck> {
  const config = twilioConfig();
  if (!config) throw new SmsUnavailableError("Twilio Verify is not configured");
  let response: Response;
  try {
    response = await twilioRequest(config, "VerificationCheck", { To: phoneNumber, Code: code });
  } catch (error) {
    throw new SmsUnavailableError(`Twilio Verify check failed: ${(error as Error).message}`);
  }
  // 404: no pending verification (expired, already approved or cancelled).
  if (response.status === 404) return "expired";
  // 429 (Twilio error 60202): too many wrong codes for this verification.
  if (response.status === 429) return "too_many_attempts";
  if (!response.ok) {
    throw new SmsUnavailableError(`Twilio Verify check returned ${await twilioErrorSummary(response)}`);
  }
  const data = (await response.json().catch(() => null)) as { status?: string } | null;
  return data?.status === "approved" ? "approved" : "wrong";
}
