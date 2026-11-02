import "server-only";

/**
 * Text messages (booking notifications, phone codes when Twilio Verify is not used) through the
 * Twilio Messaging API (REST, no SDK). Configured with TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN and
 * either TWILIO_MESSAGING_SERVICE_SID (recommended) or TWILIO_FROM_NUMBER. Without them the message
 * is only written to the server log (development, or before the founder sets up Twilio).
 *
 *   await sendSms({ to: "+972501234567", body: "…" });
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

export async function sendSms(input: {
  to: string;
  body: string;
  /** Logged instead of the body when it holds a secret (a login code). */
  logAs?: string;
}): Promise<{ ok: boolean; delivered: boolean }> {
  const config = messagingConfig();
  if (!config) {
    const shown = process.env.NODE_ENV === "production" ? (input.logAs ?? input.body) : input.body;
    console.info(`[sms] Twilio Messaging is not set up — not sent.\n  to: ${input.to}\n  ${shown}`);
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
      const detail = await response.text().catch(() => "");
      console.error(`[sms] Twilio Messaging returned ${response.status} for ${maskPhone(input.to)}: ${detail.slice(0, 300)}`);
      return { ok: false, delivered: false };
    }
    return { ok: true, delivered: true };
  } catch (error) {
    console.error(`[sms] sending to ${maskPhone(input.to)} failed:`, (error as Error).message);
    return { ok: false, delivered: false };
  }
}
