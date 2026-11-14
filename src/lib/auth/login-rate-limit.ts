import "server-only";
import { hmacHash } from "@/lib/crypto";
import { db } from "@/lib/db";
import { STORE_ERROR_RETRY_SECONDS, rateLimit, rateLimitByIp } from "@/lib/rate-limit";
import {
  CODE_SEND_DAY_SECONDS,
  CODE_SEND_HOUR_SECONDS,
  decideCodeSend,
  liveCount,
  phoneRangeOf,
  resendWaitSeconds,
  type CodeSendDecision,
  type DayCounter,
} from "./code-rules";

/**
 * Our own limits on login codes (stored in Postgres, shared by every server instance), on top
 * of Better Auth's limiter. They protect the SMS budget against SMS-pumping fraud and people's
 * inboxes against floods (SECURITY_REPORT 3.1.c, 3.1.f, 3.2.c). They all FAIL CLOSED: when the
 * store cannot be checked, no code is sent.
 *
 * - `limitCodeSend`: the founder's rules (./code-rules.ts): resend waits of 60/120/300/900 s per
 *   phone number or email address, 5 codes an hour per target, and daily caps per phone (5), email
 *   (10), IP (30), device (10) and number range (10). A request WITHOUT a device id shares one
 *   device counter per IP. Everything is counted in one transaction and ONLY when a code is issued:
 *   a refused request uses up nobody's allowance. Every emailed code goes through it (login,
 *   "confirm it's you", the 2-step unlock, a new contact address), keyed by the MAILBOX
 *   (`mailboxKey`: Gmail dots and +tags are one inbox).
 * - A device that completed a code login (or phone check) for the target before gets its OWN
 *   allowance for that target (same waits and caps; a marker row "auth:otp-known:…", 90 days), so
 *   someone who knows an address cannot lock its owner out from a device the owner uses. The IP and
 *   device caps still apply. (Not the DeviceLink table: that only suppresses repeat new-device
 *   alerts. Nothing here skips any login step.)
 * - Only codes that really go out are counted (./server.ts skips it for a code shown on screen in
 *   test mode, which costs nothing and reaches nobody). A text that then could not be sent gives
 *   its counts back (`refundCodeSend`), and a code that was entered gives back its IP and device
 *   share (`refundConfirmedCodeSend`), so people behind one shared address are not locked out by
 *   each other's successful logins.
 * - The hourly attempt limits (LOGIN_CODE_LIMITS) count requests per IP (and per target for codes
 *   shown on screen).
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
  /**
   * The post form's phone step for an account without any listing yet (SECURITY_REPORT 3.2.f):
   * its own tight daily limit on top of the hourly ones.
   */
  newHostPhoneChecksPerUser: { limit: 5, windowSeconds: 24 * HOUR },
  newHostPhoneChecksPerIp: { limit: 10, windowSeconds: 24 * HOUR },
} as const;

/**
 * One "send code" request. False when the visitor's IP is over the limit, or (`perTarget`) the
 * phone number. Texts that really go out count their hourly allowance in `limitCodeSend` instead.
 */
export async function limitLoginCodeRequests(phoneNumber: string, { perTarget = true }: { perTarget?: boolean } = {}): Promise<boolean> {
  // The IP window counts every request; the phone window is only charged when the IP passes.
  const byIp = await rateLimitByIp("auth:otp-send", LOGIN_CODE_LIMITS.perIp);
  if (!byIp.ok) return false;
  if (!perTarget) return true;
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

/** One post-form phone check by an account with no listing yet (the tight daily limit, 3.2.f). */
export async function limitNewHostPhoneChecks(userId: string): Promise<boolean> {
  const byIp = await rateLimitByIp("auth:otp-phone-check:new-host", LOGIN_CODE_LIMITS.newHostPhoneChecksPerIp);
  if (!byIp.ok) return false;
  const byUser = await rateLimit(`auth:otp-phone-check:new-host:user:${userId}`, LOGIN_CODE_LIMITS.newHostPhoneChecksPerUser);
  return byUser.ok;
}

/** One "check code" request from the visitor's IP. */
export async function limitLoginCodeChecks(): Promise<boolean> {
  const byIp = await rateLimitByIp("auth:otp-verify", LOGIN_CODE_LIMITS.checksPerIp);
  return byIp.ok;
}

/**
 * One "email me a code" request. False when the visitor's IP is over the limit, or (`perTarget`)
 * the address. Codes that really go out by email count their hourly allowance in `limitCodeSend`
 * instead (only when sent), so pass `perTarget: false` for them.
 */
export async function limitEmailCodeRequests(email: string, { perTarget = true }: { perTarget?: boolean } = {}): Promise<boolean> {
  const byIp = await rateLimitByIp("auth:email-otp-send", LOGIN_CODE_LIMITS.perIp);
  if (!byIp.ok) return false;
  if (!perTarget) return true;
  const emailKey = hmacHash(`email:${mailboxKey(email)}`);
  const byEmail = await rateLimit(`auth:email-otp-send:email:${emailKey}`, LOGIN_CODE_LIMITS.perEmail);
  return byEmail.ok;
}

/**
 * The inbox an address delivers to, FOR LIMITS ONLY (never an account's identity): lowercase, no
 * "+tag", and for Gmail no dots and googlemail.com → gmail.com. "Jo.Hn+x@GoogleMail.com" and
 * "john@gmail.com" share one set of waits and caps.
 */
export function mailboxKey(address: string): string {
  const email = address.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at <= 0) return email;
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

// ── Resend waits and daily caps (founder's answer Q7) ──

type CodeSendInput = {
  channel: "phone" | "email";
  target: string;
  ipHash: string | null;
  deviceHash: string | null;
  /** This device signed in to the account owning the target: its own allowance (see the top). */
  knownDevice?: boolean;
};

/** RateLimit keys of one code send. All start with "auth:otp-" (the e2e clean-up clears them). */
export function codeSendKeys(input: CodeSendInput) {
  const target = input.channel === "email" ? mailboxKey(input.target) : input.target;
  const targetHash = hmacHash(`${input.channel}:${target}`);
  // A known device has its own waits and caps for this target; everyone else shares the target's.
  const own = input.knownDevice && input.deviceHash ? `:dev:${input.deviceHash}` : "";
  return {
    targetDay: `auth:otp-code:${input.channel}:${targetHash}${own}:day`,
    targetNext: `auth:otp-code:${input.channel}:${targetHash}${own}:next`,
    targetHour: `auth:otp-code:${input.channel}:${targetHash}${own}:hour`,
    rangeDay: input.channel === "phone" ? `auth:otp-code:range:${hmacHash(`range:${phoneRangeOf(target)}`)}:day` : null,
    // The IP and device caps are counted PER CHANNEL (founder's answer (5), 9 Nov 2026): texts used
    // up on a connection or device never take away the email route, which every account has. (The
    // SMS budget and country pause apply to texts only: ./server.ts, ./sms-guard.ts.)
    // No IP (it could not be read): one shared, strict bucket rather than no limit.
    ipDay: `auth:otp-code:${input.channel}:ip:${input.ipHash ?? "unknown"}:day`,
    // No device id (no cookie, or a new one each time): one device counter per IP, not none.
    deviceDay: input.deviceHash
      ? `auth:otp-code:${input.channel}:device:${input.deviceHash}:day`
      : `auth:otp-code:${input.channel}:nodevice:${input.ipHash ?? "unknown"}:day`,
  };
}

/** How long a device that entered a code for a target keeps its own allowance. */
export const KNOWN_CODE_DEVICE_DAYS = 90;

function knownDeviceKey(input: { channel: "phone" | "email"; target: string; deviceHash: string }): string {
  const target = input.channel === "email" ? mailboxKey(input.target) : input.target;
  return `auth:otp-known:${input.channel}:${hmacHash(`${input.channel}:${target}`)}:${input.deviceHash}`;
}

/** Did this device enter a code for this target before (within KNOWN_CODE_DEVICE_DAYS)? A database error answers no. */
export async function isKnownDeviceFor(input: { channel: "phone" | "email"; target: string; deviceHash: string | null }, now: Date = new Date()): Promise<boolean> {
  if (!input.deviceHash) return false;
  try {
    const row = await db.rateLimit.findUnique({ where: { key: knownDeviceKey({ ...input, deviceHash: input.deviceHash }) }, select: { resetAt: true } });
    return !!row && row.resetAt.getTime() > now.getTime();
  } catch {
    return false;
  }
}

/** This device entered a code for this target: it gets its own allowance next time. Never throws. */
export async function rememberCodeDevice(input: { channel: "phone" | "email"; target: string; deviceHash: string | null }, now: Date = new Date()): Promise<void> {
  if (!input.deviceHash) return;
  const key = knownDeviceKey({ ...input, deviceHash: input.deviceHash });
  const until = new Date(now.getTime() + KNOWN_CODE_DEVICE_DAYS * 24 * 3600 * 1000);
  try {
    await db.rateLimit.upsert({ where: { key }, create: { key, count: 1, resetAt: until }, update: { resetAt: until } });
  } catch (error) {
    console.error("[auth] could not remember the device for code limits:", (error as Error)?.message ?? error);
  }
}

type Row = { key: string; count: number; resetAt: Date };

/**
 * May a code be SENT now to this phone number / email address? Atomic (one transaction holding
 * row locks on every counter involved), so parallel requests cannot slip past a wait or a cap.
 * When allowed, the code is counted at once. Fails closed (`reason: "unavailable"`).
 */
export async function limitCodeSend(
  input: CodeSendInput & {
    now?: Date;
    /** An extra daily counter charged in the same transaction (an account's emailed security codes). */
    account?: { key: string; cap: number };
  },
): Promise<CodeSendDecision> {
  const now = input.now ?? new Date();
  const knownDevice = input.knownDevice ?? (await isKnownDeviceFor(input));
  const keys = codeSendKeys({ ...input, knownDevice });
  const accountKey = input.account?.key ?? null;
  const all = [keys.targetDay, keys.targetNext, keys.targetHour, keys.rangeDay, keys.ipDay, keys.deviceDay, accountKey]
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
          targetHour: counter(keys.targetHour),
          account: input.account ? { counter: counter(accountKey), cap: input.account.cap } : null,
        },
        now,
      );
      if (!decision.ok) return decision;

      const dayEnd = new Date(now.getTime() + CODE_SEND_DAY_SECONDS * 1000);
      const hourEnd = new Date(now.getTime() + CODE_SEND_HOUR_SECONDS * 1000);
      for (const key of [keys.targetDay, keys.targetHour, keys.rangeDay, keys.ipDay, keys.deviceDay, accountKey]) {
        if (!key) continue;
        const current = counter(key);
        const live = liveCount(current, now);
        const resetAt = live === 0 ? (key === keys.targetHour ? hourEnd : dayEnd) : current!.resetAt;
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

/**
 * A text that was counted could not be sent (the SMS budget, a pause, Twilio): give its counts
 * back and allow an immediate retry (SECURITY_REPORT 3.1.c). Never throws.
 */
export async function refundCodeSend(input: CodeSendInput, now: Date = new Date()): Promise<void> {
  const knownDevice = input.knownDevice ?? (await isKnownDeviceFor(input));
  const keys = codeSendKeys({ ...input, knownDevice });
  const counters = [keys.targetDay, keys.targetHour, keys.rangeDay, keys.ipDay, keys.deviceDay].filter((key): key is string => !!key);
  try {
    await db.$transaction([
      db.$executeRaw`UPDATE "RateLimit" SET "count" = GREATEST("count" - 1, 0) WHERE "key" = ANY(${counters}::text[])`,
      db.$executeRaw`UPDATE "RateLimit" SET "count" = GREATEST("count" - 1, 0), "resetAt" = ${now} WHERE "key" = ${keys.targetNext}`,
    ]);
  } catch (error) {
    console.error("[auth] could not give back an unsent code's counts:", (error as Error)?.message ?? error);
  }
}

/**
 * A code was entered (a login, a phone check): its IP and device share is given back, so one shared
 * address (a hotel, a carrier) is limited by the codes nobody entered, not by people logging in
 * (SECURITY_REPORT 3.1.c). The target's own waits and caps stay. Never throws.
 */
export async function refundConfirmedCodeSend(input: { ipHash: string | null; deviceHash: string | null }): Promise<void> {
  const keys = codeSendKeys({ channel: "email", target: "", ipHash: input.ipHash, deviceHash: input.deviceHash });
  try {
    await db.$executeRaw`UPDATE "RateLimit" SET "count" = GREATEST("count" - 1, 0) WHERE "key" = ANY(${[keys.ipDay, keys.deviceDay]}::text[])`;
  } catch (error) {
    console.error("[auth] could not give back a confirmed code's IP and device share:", (error as Error)?.message ?? error);
  }
}
