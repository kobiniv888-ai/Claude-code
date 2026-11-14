/**
 * The rules for login codes (phone and email), in one place (SECURITY_REPORT 3.1, 3.2; founder's
 * decisions 3 and Q7, 8 November 2026). Pure and client-safe: the server enforces every rule
 * (./login-rate-limit.ts, ./phone-code.ts, ./server.ts); the login forms only read the numbers to
 * show the same waits.
 *
 * - A code is 6 digits from a secure random generator (Better Auth), stored only as a keyed hash
 *   (HMAC-SHA256 with HASH_SALT), single use, valid LOGIN_CODE_TTL_SECONDS (10 minutes), compared
 *   in constant time, and dead after LOGIN_CODE_MAX_ATTEMPTS (5) wrong tries.
 * - Resending: a phone number or an email address waits CODE_RESEND_WAITS_SECONDS between codes
 *   (60 s after the first, then 120 s, 300 s, and 900 s after every later one).
 * - Daily caps (a day = 24 hours from the first code): CODE_SEND_DAILY_CAPS per phone number,
 *   email address, IP address, device and number range.
 */

/** Codes stay valid 10 minutes (founder's decision 3). */
export const LOGIN_CODE_TTL_SECONDS = 600;
/** Wrong tries before a code dies (a new one is needed). */
export const LOGIN_CODE_MAX_ATTEMPTS = 5;

/** The wait before the next code: after the 1st code 60 s, after the 2nd 120 s, the 3rd 300 s, then 900 s. */
export const CODE_RESEND_WAITS_SECONDS = [60, 120, 300, 900] as const;

/** The caps' window: 24 hours from the first code in it. */
export const CODE_SEND_DAY_SECONDS = 24 * 60 * 60;

/**
 * Codes per day (founder's answer Q7). `phoneRange`: numbers that differ only in their last 3
 * digits (SMS-pumping runs through number ranges, SECURITY_REPORT 3.2.c); our own default.
 */
export const CODE_SEND_DAILY_CAPS = {
  phone: 5,
  email: 10,
  ip: 30,
  device: 10,
  phoneRange: 10,
} as const;

/**
 * Codes per phone number or email address per HOUR (the window starts at the first code). Counted
 * only when a code is really sent (in the same transaction as the waits), so refused requests never
 * use up someone else's allowance (SECURITY_REPORT 3.1.c/f).
 */
export const CODE_SEND_HOURLY_CAP = 5;
export const CODE_SEND_HOUR_SECONDS = 60 * 60;

export type CodeSendScope = keyof typeof CODE_SEND_DAILY_CAPS | "hour" | "account";

/** Seconds to wait after the `sent`-th code of the day before the next one (sent ≥ 1). */
export function resendWaitSeconds(sent: number): number {
  if (!Number.isFinite(sent) || sent < 1) return 0;
  const index = Math.min(Math.floor(sent), CODE_RESEND_WAITS_SECONDS.length) - 1;
  return CODE_RESEND_WAITS_SECONDS[index];
}

/** "+972500000123" → "+972500000" (the number's range of 1000). */
export function phoneRangeOf(e164: string): string {
  return e164.slice(0, Math.max(4, e164.length - 3));
}

/** One counter as stored: codes sent in the current day, and when that day ends. */
export type DayCounter = { count: number; resetAt: Date };

export type CodeSendState = {
  /** The phone number or email address the code goes to. */
  target: DayCounter | null;
  /** When the target may get its next code. */
  nextAllowedAt: Date | null;
  ip: DayCounter | null;
  /** Null when the browser sent no device id. */
  device: DayCounter | null;
  /** Phones only. */
  phoneRange?: DayCounter | null;
  /** Codes to the target in the current hour (CODE_SEND_HOURLY_CAP). */
  targetHour?: DayCounter | null;
  /** An extra daily counter of the caller's (the account's emailed security codes) with its cap. */
  account?: { counter: DayCounter | null; cap: number } | null;
};

export type CodeSendDecision =
  | {
      ok: true;
      /** Seconds until this target may get another code. */
      nextSendInSeconds: number;
      /** Codes this target may still get today. */
      sendsLeftToday: number;
    }
  | {
      ok: false;
      /** "wait": too soon after the last code; "daily_cap": today's codes are used up; "unavailable": the limits could not be checked (fail closed). */
      reason: "wait" | "daily_cap" | "unavailable";
      /** Which limit refused (null for "unavailable"). */
      scope: CodeSendScope | "resend" | null;
      retryAfterSeconds: number;
    };

/** Codes counted in a day counter at `now` (0 once its day is over). */
export function liveCount(counter: DayCounter | null | undefined, now: Date): number {
  if (!counter || counter.resetAt.getTime() <= now.getTime()) return 0;
  return Math.max(0, counter.count);
}

const secondsUntil = (at: Date, now: Date) => Math.max(1, Math.ceil((at.getTime() - now.getTime()) / 1000));

/**
 * May one more code go to this target now? Checks the resend wait first (the most specific
 * answer for the person), then the target's, range's, device's and IP's daily caps.
 */
export function decideCodeSend(
  channel: "phone" | "email",
  state: CodeSendState,
  now: Date,
): CodeSendDecision {
  if (state.nextAllowedAt && state.nextAllowedAt.getTime() > now.getTime()) {
    return { ok: false, reason: "wait", scope: "resend", retryAfterSeconds: secondsUntil(state.nextAllowedAt, now) };
  }
  const targetCap = channel === "phone" ? CODE_SEND_DAILY_CAPS.phone : CODE_SEND_DAILY_CAPS.email;
  const checks: [CodeSendScope, DayCounter | null | undefined, number][] = [
    [channel, state.target, targetCap],
    ...(channel === "phone" ? [["phoneRange", state.phoneRange, CODE_SEND_DAILY_CAPS.phoneRange] as [CodeSendScope, DayCounter | null | undefined, number]] : []),
    ["device", state.device, CODE_SEND_DAILY_CAPS.device],
    ["ip", state.ip, CODE_SEND_DAILY_CAPS.ip],
    ...(state.account ? [["account", state.account.counter, state.account.cap] as [CodeSendScope, DayCounter | null | undefined, number]] : []),
  ];
  for (const [scope, counter, cap] of checks) {
    if (counter && liveCount(counter, now) >= cap) {
      return { ok: false, reason: "daily_cap", scope, retryAfterSeconds: secondsUntil(counter.resetAt, now) };
    }
  }
  // The hour's allowance: a wait until the hour is over.
  if (state.targetHour && liveCount(state.targetHour, now) >= CODE_SEND_HOURLY_CAP) {
    return { ok: false, reason: "wait", scope: "hour", retryAfterSeconds: secondsUntil(state.targetHour.resetAt, now) };
  }
  const sent = liveCount(state.target, now) + 1;
  return { ok: true, nextSendInSeconds: resendWaitSeconds(sent), sendsLeftToday: Math.max(0, targetCap - sent) };
}
