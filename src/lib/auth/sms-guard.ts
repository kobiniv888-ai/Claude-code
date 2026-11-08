import "server-only";
import { sendFounderAlert } from "@/lib/alerts/founder";
import { db } from "@/lib/db";
import { recordSecurityEvent } from "@/lib/security/events";

/**
 * Brakes on SMS codes against SMS pumping (SECURITY_REPORT 3.2.c, 3.2.d; founder's answers Q20
 * and D8 a). Every check FAILS CLOSED: when the store cannot be read, no SMS goes out.
 *
 * - A daily budget: at most SMS_CODE_DAILY_BUDGET code texts in 24 hours (all numbers together).
 *   At 80% the founder gets an email; when it is used up, a security event and another email, and
 *   no more code texts until the window ends.
 * - Codes confirmed ÷ codes sent, per country, from the security event log (no new table): codes
 *   whose 10 minutes are over, sent in the last hour. Below SMS_RATIO_ALERT.below with at least
 *   SMS_RATIO_ALERT.minSent sent, that country's code texts PAUSE for SMS_COUNTRY_PAUSE_MINUTES,
 *   with a security event and an email to the founder. (Pumping sends many codes nobody enters.)
 *
 * Counters live in the RateLimit table: "sms:budget:codes" and "sms:paused:<country>". Events
 * carry the country code only, never the number.
 */

export const SMS_CODE_DAILY_BUDGET = 300;
/** The founder is told when this share of the budget is used. */
export const SMS_BUDGET_WARN_SHARE = 0.8;
export const SMS_RATIO_ALERT = {
  /** Alert and pause below this share of codes confirmed. */
  below: 0.5,
  /** …once at least this many were sent in the window. */
  minSent: 20,
  /** The window of sent codes counted. */
  windowMinutes: 60,
  /** Codes younger than this are left out (people are still typing them; they live 10 minutes). */
  settleMinutes: 10,
} as const;
export const SMS_COUNTRY_PAUSE_MINUTES = 60;

const BUDGET_KEY = "sms:budget:codes";
const DAY_SECONDS = 24 * 60 * 60;
const pauseKey = (country: string) => `sms:paused:${country}`;

/** The budget's warning point (240 of 300). */
export const smsBudgetWarnAt = () => Math.floor(SMS_CODE_DAILY_BUDGET * SMS_BUDGET_WARN_SHARE);

/**
 * Counts one code text against the daily budget. False when it is used up, or when the counter
 * cannot be written (fail closed). Tells the founder once at 80% and once when it runs out.
 */
export async function chargeSmsBudget({ now = new Date(), key = BUDGET_KEY }: { now?: Date; key?: string } = {}): Promise<boolean> {
  let count: number;
  try {
    const windowEnd = new Date(now.getTime() + DAY_SECONDS * 1000);
    const rows = await db.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key}, 1, ${windowEnd})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN EXCLUDED."resetAt" ELSE "RateLimit"."resetAt" END
      RETURNING "count"`;
    count = Number(rows[0]?.count ?? Number.POSITIVE_INFINITY);
  } catch (error) {
    console.error("[sms] the SMS budget could not be checked — NOT sending (fail closed):", (error as Error)?.message ?? error);
    return false;
  }
  // Exactly one request sees each of these counts (the update is atomic), so each alert goes once.
  if (count === smsBudgetWarnAt()) {
    void sendFounderAlert({ kind: "sms_budget_warning", reason: "sms_budget", detail: `${count} / ${SMS_CODE_DAILY_BUDGET}` });
  }
  if (count === SMS_CODE_DAILY_BUDGET + 1) {
    void recordSecurityEvent({ type: "sms_budget_reached", ip: null, meta: { budget: SMS_CODE_DAILY_BUDGET } });
    void sendFounderAlert({ kind: "sms_budget_reached", reason: "sms_budget", detail: `${SMS_CODE_DAILY_BUDGET} / ${SMS_CODE_DAILY_BUDGET}` });
  }
  return count <= SMS_CODE_DAILY_BUDGET;
}

/** True while code texts to this country are paused, or when that cannot be checked (fail closed). */
export async function isSmsCountryPaused(country: string, now: Date = new Date()): Promise<boolean> {
  try {
    const row = await db.rateLimit.findUnique({ where: { key: pauseKey(country) }, select: { resetAt: true } });
    return !!row && row.resetAt.getTime() > now.getTime();
  } catch (error) {
    console.error("[sms] the country pause could not be checked — treating it as paused (fail closed):", (error as Error)?.message ?? error);
    return true;
  }
}

/** The pure rule: should this country pause? */
export function smsRatioTooLow(sent: number, verified: number): boolean {
  if (sent < SMS_RATIO_ALERT.minSent) return false;
  return verified / sent < SMS_RATIO_ALERT.below;
}

/** Counts of the last window for one country (sent: codes whose life is over; verified: up to now). */
export async function smsCountsFor(country: string, now: Date = new Date()): Promise<{ sent: number; verified: number }> {
  const windowStart = new Date(now.getTime() - (SMS_RATIO_ALERT.windowMinutes + SMS_RATIO_ALERT.settleMinutes) * 60_000);
  const settled = new Date(now.getTime() - SMS_RATIO_ALERT.settleMinutes * 60_000);
  const byCountry = { path: ["country"], equals: country };
  const [sent, verified] = await Promise.all([
    db.securityEvent.count({ where: { type: "sms_code_sent", createdAt: { gte: windowStart, lt: settled }, meta: byCountry } }),
    db.securityEvent.count({ where: { type: "sms_code_verified", createdAt: { gte: windowStart }, meta: byCountry } }),
  ]);
  return { sent, verified };
}

/**
 * After a code text went out: logs it (country only) and checks the ratio. Pauses the country and
 * alerts the founder when too few codes are confirmed. Never throws.
 */
export async function recordSmsCodeSent(country: string, now: Date = new Date()): Promise<void> {
  await recordSecurityEvent({ type: "sms_code_sent", ip: null, meta: { country } });
  try {
    const { sent, verified } = await smsCountsFor(country, now);
    if (!smsRatioTooLow(sent, verified)) return;
    const until = new Date(now.getTime() + SMS_COUNTRY_PAUSE_MINUTES * 60_000);
    // Starts a pause only if none is running; RETURNING tells whether this call started it.
    const started = await db.$queryRaw<{ key: string }[]>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${pauseKey(country)}, 1, ${until})
      ON CONFLICT ("key") DO UPDATE SET "count" = "RateLimit"."count" + 1, "resetAt" = EXCLUDED."resetAt"
        WHERE "RateLimit"."resetAt" <= ${now}
      RETURNING "key"`;
    if (started.length === 0) return;
    const percent = Math.round((verified / sent) * 100);
    await recordSecurityEvent({ type: "sms_ratio_low", ip: null, meta: { country, sent, verified, pauseMinutes: SMS_COUNTRY_PAUSE_MINUTES } });
    await sendFounderAlert({ kind: "sms_country_paused", reason: "sms_ratio", country, detail: `${verified} / ${sent} (${percent}%)` });
  } catch (error) {
    console.error("[sms] the confirmed ÷ sent check failed:", (error as Error)?.message ?? error);
  }
}

/** A code that went by text was confirmed (country only). */
export async function recordSmsCodeVerified(country: string): Promise<void> {
  await recordSecurityEvent({ type: "sms_code_verified", ip: null, meta: { country } });
}
