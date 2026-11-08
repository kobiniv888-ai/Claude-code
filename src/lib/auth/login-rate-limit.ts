import "server-only";
import { hmacHash } from "@/lib/crypto";
import { db } from "@/lib/db";
import { STORE_ERROR_RETRY_SECONDS, rateLimit, rateLimitByIp } from "@/lib/rate-limit";
import {
  CODE_SEND_DAY_SECONDS,
  decideCodeSend,
  liveCount,
  phoneRangeOf,
  resendWaitSeconds,
  type CodeSendDecision,
  type DayCounter,
} from "./code-rules";

/**
 * Our own limits on login codes (stored in Postgres, shared by every server instance), on top
 * of Better Auth's per-instance limiter. They protect the SMS budget against SMS-pumping fraud
 * and people's inboxes against floods (SECURITY_REPORT 3.1.c, 3.1.f, 3.2.c). They all FAIL CLOSED:
 * when the store cannot be checked, no code is sent.
 *
 * - `limitCodeSend`: the founder's rules (./code-rules.ts): resend waits of 60/120/300/900 s per
 *   phone number or email address, and daily caps per phone (5), email (10), IP (30), device (10)
 *   and number range (10). Only codes that really go out are counted (./server.ts skips it for a
 *   code shown on screen in test mode, which costs nothing and reaches nobody).
 * - The hourly attempt limits (LOGIN_CODE_LIMITS) count every request, sent or not.
 */

const HOUR = 60 * 60;

export const LOGIN_CODE_LIMITS = {
  perPhone: { limit: 5, windowSeconds: HOUR },
  perEmail: { limit: 5, windowSeconds: HOUR },
  perIp: { limit: 20, windowSeconds: HOUR },
  checksPerIp: { limit: 30, windowSeconds: HOUR },
  /** "Verify your phone" (signed in): each request may reveal whether a number has an account. */
  phoneChecksPerUser: { limit: 10, windowSeconds: HOUR },
  phoneChecksPerIp: { limit: 20, windowSeconds: HOUR },
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

/**
 * One "verify your phone" send request by a signed-in account (before the "number taken" lookup).
 * False when the account or the visitor's IP is over the limit.
 */
export async function limitPhoneCheckRequests(userId: string): Promise<boolean> {
  const byIp = await rateLimitByIp("auth:otp-phone-check", LOGIN_CODE_LIMITS.phoneChecksPerIp);
  if (!byIp.ok) return false;
  const byUser = await rateLimit(`auth:otp-phone-check:user:${userId}`, LOGIN_CODE_LIMITS.phoneChecksPerUser);
  return byUser.ok;
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

// ── Resend waits and daily caps (founder's answer Q7) ──

/** RateLimit keys of one code send. All start with "auth:otp-" (the e2e clean-up clears them). */
export function codeSendKeys(input: {
  channel: "phone" | "email";
  target: string;
  ipHash: string | null;
  deviceHash: string | null;
}) {
  const target = input.channel === "email" ? input.target.trim().toLowerCase() : input.target;
  const targetHash = hmacHash(`${input.channel}:${target}`);
  return {
    targetDay: `auth:otp-code:${input.channel}:${targetHash}:day`,
    targetNext: `auth:otp-code:${input.channel}:${targetHash}:next`,
    rangeDay: input.channel === "phone" ? `auth:otp-code:range:${hmacHash(`range:${phoneRangeOf(target)}`)}:day` : null,
    // No IP (it could not be read): one shared, strict bucket rather than no limit.
    ipDay: `auth:otp-code:ip:${input.ipHash ?? "unknown"}:day`,
    deviceDay: input.deviceHash ? `auth:otp-code:device:${input.deviceHash}:day` : null,
  };
}

type Row = { key: string; count: number; resetAt: Date };

/**
 * May a code be SENT now to this phone number / email address? Atomic (one transaction holding
 * row locks on every counter involved), so parallel requests cannot slip past a wait or a cap.
 * When allowed, the code is counted at once. Fails closed (`reason: "unavailable"`).
 */
export async function limitCodeSend(input: {
  channel: "phone" | "email";
  target: string;
  ipHash: string | null;
  deviceHash: string | null;
  now?: Date;
}): Promise<CodeSendDecision> {
  const now = input.now ?? new Date();
  const keys = codeSendKeys(input);
  const all = [keys.targetDay, keys.targetNext, keys.rangeDay, keys.ipDay, keys.deviceDay]
    .filter((key): key is string => !!key)
    .sort();
  try {
    return await db.$transaction(async (tx) => {
      // Make sure every counter exists (an old, ended window), then lock them in a fixed order.
      await tx.$executeRaw`
        INSERT INTO "RateLimit" ("key", "count", "resetAt")
        SELECT k, 0, to_timestamp(0) FROM unnest(${all}::text[]) AS k
        ON CONFLICT ("key") DO NOTHING`;
      const rows = await tx.$queryRaw<Row[]>`
        SELECT "key", "count", "resetAt" FROM "RateLimit"
        WHERE "key" = ANY(${all}::text[]) ORDER BY "key" FOR UPDATE`;
      const byKey = new Map(rows.map((row) => [row.key, { count: Number(row.count), resetAt: new Date(row.resetAt) }]));
      const counter = (key: string | null): DayCounter | null => (key ? (byKey.get(key) ?? null) : null);

      const next = counter(keys.targetNext);
      const decision = decideCodeSend(
        input.channel,
        {
          target: counter(keys.targetDay),
          nextAllowedAt: next?.resetAt ?? null,
          ip: counter(keys.ipDay),
          device: counter(keys.deviceDay),
          phoneRange: counter(keys.rangeDay),
        },
        now,
      );
      if (!decision.ok) return decision;

      const dayEnd = new Date(now.getTime() + CODE_SEND_DAY_SECONDS * 1000);
      for (const key of [keys.targetDay, keys.rangeDay, keys.ipDay, keys.deviceDay]) {
        if (!key) continue;
        const current = counter(key);
        const live = liveCount(current, now);
        const resetAt = live === 0 ? dayEnd : current!.resetAt;
        await tx.$executeRaw`UPDATE "RateLimit" SET "count" = ${live + 1}, "resetAt" = ${resetAt} WHERE "key" = ${key}`;
      }
      const sentToday = liveCount(counter(keys.targetDay), now) + 1;
      const nextAt = new Date(now.getTime() + resendWaitSeconds(sentToday) * 1000);
      await tx.$executeRaw`UPDATE "RateLimit" SET "count" = ${sentToday}, "resetAt" = ${nextAt} WHERE "key" = ${keys.targetNext}`;
      return decision;
    });
  } catch (error) {
    console.error(`[auth] could not check the ${input.channel} code limits — REFUSING (fail closed):`, (error as Error)?.message ?? error);
    return { ok: false, reason: "unavailable", scope: null, retryAfterSeconds: STORE_ERROR_RETRY_SECONDS };
  }
}
