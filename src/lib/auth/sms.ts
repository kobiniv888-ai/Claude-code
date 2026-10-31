import "server-only";

/**
 * Login codes by SMS or WhatsApp through Twilio Verify (REST API, no SDK).
 *
 * Without Twilio credentials, development prints the code to the server console and keeps it in
 * memory for the "Development mode — your code is …" hint (GET /api/dev/last-otp). Production
 * without Twilio refuses to send codes.
 */

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

export function isTwilioConfigured(): boolean {
  return twilioConfig() !== null;
}

/** Development fallback: codes are logged and readable through /api/dev/last-otp. */
export function isDevOtpMode(): boolean {
  return process.env.NODE_ENV !== "production" && !isTwilioConfigured();
}

// ── Development code store (survives hot reloads; never used in production) ──

type DevCode = { code: string; expiresAt: number };
const globalForDevOtp = globalThis as unknown as { __bayitDevOtp?: Map<string, DevCode> };
const devCodes = (globalForDevOtp.__bayitDevOtp ??= new Map<string, DevCode>());

export function rememberDevOtp(phoneNumber: string, code: string, ttlSeconds: number) {
  if (!isDevOtpMode()) return;
  devCodes.set(phoneNumber, { code, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export function readDevOtp(phoneNumber: string): string | null {
  if (!isDevOtpMode()) return null;
  const entry = devCodes.get(phoneNumber);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    devCodes.delete(phoneNumber);
    return null;
  }
  return entry.code;
}

// ── Twilio Verify ──

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
 * Sends a login code. `devCode` is the code Better Auth generated — only used by the
 * development fallback (Twilio Verify generates and checks its own codes).
 */
export async function sendLoginCode(input: {
  phoneNumber: string;
  devCode: string;
  ttlSeconds: number;
  locale?: string | null;
}): Promise<void> {
  const config = twilioConfig();
  if (!config) {
    if (process.env.NODE_ENV === "production") {
      throw new SmsUnavailableError("Twilio Verify is not configured");
    }
    rememberDevOtp(input.phoneNumber, input.devCode, input.ttlSeconds);
    console.info(`[auth] Development login code for ${input.phoneNumber}: ${input.devCode}`);
    return;
  }

  const body: Record<string, string> = { To: input.phoneNumber, Channel: config.channel };
  if (input.locale && TWILIO_LOCALES.has(input.locale)) body.Locale = input.locale;

  let response: Response;
  try {
    response = await twilioRequest(config, "Verifications", body);
  } catch (error) {
    throw new SmsUnavailableError(`Twilio Verify request failed: ${(error as Error).message}`);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new SmsUnavailableError(`Twilio Verify returned ${response.status}: ${detail.slice(0, 300)}`);
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
    const detail = await response.text().catch(() => "");
    throw new SmsUnavailableError(`Twilio Verify check returned ${response.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await response.json().catch(() => null)) as { status?: string } | null;
  return data?.status === "approved" ? "approved" : "wrong";
}
