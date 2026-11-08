import "server-only";
import { checkLoginPhoneNumber } from "@/lib/auth/phone";
import { readSiteEnv } from "@/lib/site-env";

/**
 * Text messages (booking notifications and the 6-digit login / phone-check codes, with our own
 * text: founder's answer Q9) through the Twilio Programmable Messaging API (REST, no SDK).
 * Configured with TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN and TWILIO_MESSAGING_SERVICE_SID (the
 * Messaging Service: its sender pool and geo permissions; recommended) or TWILIO_FROM_NUMBER.
 * Without them the message is only written to the server log (development, or before the founder
 * sets up Twilio).
 *
 *   await sendSms({ to: "+972501234567", body: "…" });
 *
 * EVERY text, whatever it is for, goes only to a mobile number in an allowed country (Israel and
 * Georgia: siteConfig.phone.smsAllowedCountries, SECURITY_REPORT 3.2.a/e). Anything else is
 * refused here, before Twilio is called.
 *
 * Never throws: returns { ok, delivered } — `delivered` is false when it was only logged.
 */

const MESSAGES_API = "https://api.twilio.com/2010-04-01/Accounts";
const REQUEST_TIMEOUT_MS = 10_000;

type MessagingConfig = { accountSid: string; authToken: string; serviceSid?: string; from?: string };

function messagingConfig(): MessagingConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const serviceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || undefined;
  const from = process.env.TWILIO_FROM_NUMBER?.trim() || undefined;
  if (!accountSid || !authToken || (!serviceSid && !from)) return null;
  return { accountSid, authToken, serviceSid, from };
}

/** True when text messages really go out (Twilio Messaging keys are set). */
export function isSmsConfigured(): boolean {
  return messagingConfig() !== null;
}

/** "+995555123456" → "+995•••••456" for logs. */
export function maskPhone(phone: string): string {
  return phone.length > 6 ? `${phone.slice(0, 4)}${"•".repeat(phone.length - 7)}${phone.slice(-3)}` : "•••";
}

/**
 * A failed Twilio response, safe for logs: the HTTP status and Twilio's numeric error code only.
 * Twilio's error `message` repeats the destination number (e.g. 21211, 21408, Verify 60200), so it
 * is never logged.
 */
export async function twilioErrorSummary(response: Response): Promise<string> {
  const data = (await response.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof data?.code === "number" || typeof data?.code === "string" ? String(data.code).slice(0, 12) : "?";
  return `${response.status} (Twilio code ${code})`;
}

export async function sendSms(input: {
  to: string;
  body: string;
  /**
   * Logged instead of the body when it holds a secret (a login code) or personal details (a booking).
   * With it, the body is never logged; without it, only on a development server of a development site.
   */
  logAs?: string;
  /**
   * Only log, never send — e.g. demo accounts, whose numbers are made up (a real text to them would
   * reach a stranger and cost money).
   */
  logOnly?: boolean;
}): Promise<{ ok: boolean; delivered: boolean }> {
  const destination = checkLoginPhoneNumber(input.to);
  if (!destination.ok) {
    console.warn(`[sms] not sent to ${maskPhone(input.to)}: ${destination.reason} (only mobile numbers in the allowed countries get texts)`);
    return { ok: false, delivered: false };
  }
  const config = input.logOnly ? null : messagingConfig();
  if (!config) {
    // A text that holds a secret or personal details (logAs) is never logged in full; other texts
    // only on a development server of a development site.
    const shown =
      input.logAs ?? (process.env.NODE_ENV !== "production" && readSiteEnv() === "development" ? input.body : "[text not logged]");
    const why = input.logOnly ? "log only (demo number)" : "Twilio Messaging is not set up";
    console.info(`[sms] ${why} — not sent.\n  to: ${maskPhone(input.to)}\n  ${shown}`);
    return { ok: true, delivered: false };
  }
  const params = new URLSearchParams({ To: input.to, Body: input.body });
  if (config.serviceSid) params.set("MessagingServiceSid", config.serviceSid);
  else if (config.from) params.set("From", config.from);
  const credentials = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");
  try {
    const response = await fetch(`${MESSAGES_API}/${config.accountSid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error(`[sms] Twilio Messaging returned ${await twilioErrorSummary(response)} for ${maskPhone(input.to)}`);
      return { ok: false, delivered: false };
    }
    return { ok: true, delivered: true };
  } catch (error) {
    console.error(`[sms] sending to ${maskPhone(input.to)} failed:`, (error as Error).message);
    return { ok: false, delivered: false };
  }
}
