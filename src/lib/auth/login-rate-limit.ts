import "server-only";
import { hmacHash } from "@/lib/crypto";
import { rateLimit, rateLimitByIp } from "@/lib/rate-limit";

/**
 * Our own limits on login codes (stored in Postgres, shared by every server instance), on top
 * of Better Auth's per-instance limiter. They protect the SMS budget against SMS-pumping fraud.
 */

const HOUR = 60 * 60;

export const LOGIN_CODE_LIMITS = {
  perPhone: { limit: 5, windowSeconds: HOUR },
  perEmail: { limit: 5, windowSeconds: HOUR },
  perIp: { limit: 20, windowSeconds: HOUR },
  checksPerIp: { limit: 30, windowSeconds: HOUR },
} as const;

/** One "send code" request. False when the phone number or the visitor's IP is over the limit. */
export async function limitLoginCodeRequests(phoneNumber: string): Promise<boolean> {
  // The IP window counts every request; the phone window is only charged when the IP passes.
  const byIp = await rateLimitByIp("auth:otp-send", LOGIN_CODE_LIMITS.perIp);
  if (!byIp.ok) return false;
  // Hashed, so the RateLimit table holds no phone numbers.
  const phoneKey = hmacHash(`phone:${phoneNumber}`);
  const byPhone = await rateLimit(`auth:otp-send:phone:${phoneKey}`, LOGIN_CODE_LIMITS.perPhone);
  return byPhone.ok;
}

/** One "check code" request from the visitor's IP. */
export async function limitLoginCodeChecks(): Promise<boolean> {
  const byIp = await rateLimitByIp("auth:otp-verify", LOGIN_CODE_LIMITS.checksPerIp);
  return byIp.ok;
}

/** One "email me a code" request. False when the address or the visitor's IP is over the limit. */
export async function limitEmailCodeRequests(email: string): Promise<boolean> {
  const byIp = await rateLimitByIp("auth:email-otp-send", LOGIN_CODE_LIMITS.perIp);
  if (!byIp.ok) return false;
  const emailKey = hmacHash(`email:${email.trim().toLowerCase()}`);
  const byEmail = await rateLimit(`auth:email-otp-send:email:${emailKey}`, LOGIN_CODE_LIMITS.perEmail);
  return byEmail.ok;
}
