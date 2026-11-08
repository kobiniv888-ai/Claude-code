import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { sendFounderAlert } from "@/lib/alerts/founder";
import { hmacHash } from "@/lib/crypto";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/request";
import { recordSecurityEvent } from "@/lib/security/events";

/**
 * Brakes on SMS codes against SMS pumping (SECURITY_REPORT 3.2.c, 3.2.d; founder's answers Q20
 * and D8 a). Every check FAILS CLOSED: when the store cannot be read, no SMS goes out. Since the S1
 * review the brakes are per SOURCE first, so one actor cannot stop the texts for everyone:
 *
 * - The SOURCE of a code text is the signed-in account (the phone check, ./phone-check-actions.ts)
 *   and the visitor's IP block (IPv4 /24, IPv6 /64), kept only as keyed hashes. A source is
 *   TRUSTED when its account verified a phone code before, already has a verified phone, or is
 *   older than 7 days with a listing or a booking (`isTrustedSmsRequester`).
 * - Brake per source: an account or IP block with SMS_SOURCE_LIMITS.unconfirmedMax (3) codes nobody
 *   entered within 24 hours gets no more texts until one is confirmed.
 * - The daily budget, SMS_CODE_DAILY_BUDGET (300) code texts in 24 hours (all numbers together):
 *   each account and each IP block may use at most SMS_SOURCE_LIMITS.sharePerSource (6, 2%) of it,
 *   and the last 30% is kept for trusted sources. The founder is emailed at 50% and 80% and when it
 *   is used up.
 * - Codes confirmed ÷ codes sent, per country, from the security event log (no new table): codes
 *   whose 10 minutes are over, sent in the last hour. Below SMS_RATIO_ALERT.below with at least
 *   SMS_RATIO_ALERT.minSent sent AND spread over at least SMS_PAUSE_SPREAD sources and IP blocks
 *   (one actor's unconfirmed codes are the per-source brake's job), that country's code texts PAUSE
 *   for SMS_COUNTRY_PAUSE_MINUTES for UNTRUSTED sources, with a security event and an email to the
 *   founder. Trusted sources still get their codes.
 * - The founder (ADMIN, with a fresh authenticator code) can resume a paused country or reset
 *   today's budget from /admin/maintenance (./sms-control-actions.ts, audited).
 *
 * Counters live in the RateLimit table ("sms:budget:codes", "sms:share:…", "sms:unconfirmed:…",
 * "sms:paused:<country>"). Events carry the country code, the account id and the IP block's hash,
 * never the number.
 */

export const SMS_CODE_DAILY_BUDGET = 300;
/** The founder is told when these shares of the budget are used. */
export const SMS_BUDGET_WARN_SHARES = [0.5, 0.8] as const;
/** Kept for older imports: the 80% warning share. */
export const SMS_BUDGET_WARN_SHARE = 0.8;
export const SMS_SOURCE_LIMITS = {
  /** Codes nobody entered, per account or IP block, before that source must confirm one. */
  unconfirmedMax: 3,
  /** Code texts per account and per IP block in 24 hours (2% of the budget). */
  sharePerSource: 6,
  /** Untrusted sources may use this share of the budget; the rest is kept for trusted ones. */
  untrustedBudgetShare: 0.7,
  windowSeconds: 24 * 60 * 60,
} as const;
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
/** A pause needs the unconfirmed codes spread over this many sources (accounts) and IP blocks. */
export const SMS_PAUSE_SPREAD = { minSources: 10, minIpBlocks: 10 } as const;
export const SMS_COUNTRY_PAUSE_MINUTES = 60;
/** Where the founder alerts point: the SMS controls. */
export const SMS_CONTROLS_PATH = "/admin/maintenance#sms";

const BUDGET_KEY = "sms:budget:codes";
const DAY_MS = SMS_SOURCE_LIMITS.windowSeconds * 1000;
const pauseKey = (country: string) => `sms:paused:${country}`;
const blockHash = (block: string) => hmacHash(`sms-ip-block:${block}`);

/** The budget's warning points (150 and 240 of 300). */
export const smsBudgetWarnPoints = () => SMS_BUDGET_WARN_SHARES.map((share) => Math.floor(SMS_CODE_DAILY_BUDGET * share));
/** The 80% warning point (240). */
export const smsBudgetWarnAt = () => Math.floor(SMS_CODE_DAILY_BUDGET * SMS_BUDGET_WARN_SHARE);
/** What untrusted sources may use of the budget (210 of 300). */
export const smsUntrustedBudget = () => Math.floor(SMS_CODE_DAILY_BUDGET * SMS_SOURCE_LIMITS.untrustedBudgetShare);

// ── The source of a code text ──

export type SmsSource = {
  /** The signed-in account that asked (the phone check), or null (the phone login in test mode). */
  userId: string | null;
  /** The visitor's IP block ("203.0.113.0/24", "2001:db8:1:2::/64"), or null when unknown. */
  ipBlock: string | null;
  trusted: boolean;
};

const sourceStorage = new AsyncLocalStorage<SmsSource>();

/** Runs `fn` (a Better Auth call that may send a code text) with this source attached. */
export function withSmsSource<T>(source: SmsSource, fn: () => Promise<T>): Promise<T> {
  return sourceStorage.run(source, fn);
}

/** The source set by `withSmsSource` around this call, if any. */
export function currentSmsSource(): SmsSource | null {
  return sourceStorage.getStore() ?? null;
}

/** IPv4 → its /24, IPv6 → its /64 (null for anything else). Pure. */
export function smsIpBlock(ip: string | null | undefined): string | null {
  const value = ip?.trim();
  if (!value) return null;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  if (!value.includes(":")) return null;
  const [head = "", tail = ""] = value.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = value.includes("::") ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  if (groups.length < 4 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return `${groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/**
 * Trusted for SMS: the account confirmed a phone code before, has a verified phone, or is older
 * than 7 days with a listing or a booking that went ahead. A database error answers "not trusted".
 */
export async function isTrustedSmsRequester(userId: string, now: Date = new Date()): Promise<boolean> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        phoneNumber: true,
        phoneNumberVerified: true,
        createdAt: true,
        _count: {
          select: {
            listings: { where: { deletedAt: null } },
            bookingsAsGuest: { where: { status: { in: ["CONFIRMED", "COMPLETED"] } } },
          },
        },
      },
    });
    if (!user) return false;
    if (user.phoneNumber && user.phoneNumberVerified) return true;
    const established = now.getTime() - user.createdAt.getTime() > 7 * DAY_MS && (user._count.listings > 0 || user._count.bookingsAsGuest > 0);
    if (established) return true;
    return (await db.securityEvent.count({ where: { type: "sms_code_verified", userId } })) > 0;
  } catch (error) {
    console.error("[sms] could not check whether the account is trusted (treated as not trusted):", (error as Error)?.message ?? error);
    return false;
  }
}

/** The source of a request: this account (or none) and the visitor's IP block. */
export async function requestSmsSource(userId: string | null): Promise<SmsSource> {
  let ip: string | null = null;
  try {
    ip = await getClientIp();
  } catch {
    ip = null;
  }
  return { userId, ipBlock: smsIpBlock(ip), trusted: userId ? await isTrustedSmsRequester(userId) : false };
}

/** The source of this call: the one attached by `withSmsSource`, else the request's (no account). */
export async function smsSourceForThisCall(): Promise<SmsSource> {
  return currentSmsSource() ?? (await requestSmsSource(null));
}

// ── Budget, shares and the per-source brake (one transaction) ──

type CounterKeys = { budget: string; userShare: string | null; ipShare: string | null; userBrake: string | null; ipBrake: string | null };

function counterKeys(source: SmsSource, budgetKey: string): CounterKeys {
  const block = source.ipBlock ? blockHash(source.ipBlock) : null;
  return {
    budget: budgetKey,
    userShare: source.userId ? `sms:share:user:${source.userId}` : null,
    ipShare: block ? `sms:share:ip:${block}` : null,
    userBrake: source.userId ? `sms:unconfirmed:user:${source.userId}` : null,
    // A trusted account is not held back by others' unconfirmed codes on its IP block.
    ipBrake: block && !source.trusted ? `sms:unconfirmed:ip:${block}` : null,
  };
}

export type SmsReservation =
  | { ok: true; budgetUsed: number }
  /** budget: used up; reserve: only trusted sources may use the rest; share / brake: this source; unavailable: fail closed. */
  | { ok: false; reason: "budget" | "reserve" | "share" | "brake" | "unavailable" };

type Row = { key: string; count: number; resetAt: Date };

/**
 * May one more code text go out for this source? Counts it at once (budget, both shares, both
 * brakes) when allowed. Atomic (row locks in a fixed order). Fails closed.
 */
export async function reserveSmsSend(
  source: SmsSource,
  { now = new Date(), budgetKey = BUDGET_KEY }: { now?: Date; budgetKey?: string } = {},
): Promise<SmsReservation> {
  const keys = counterKeys(source, budgetKey);
  const all = Object.values(keys).filter((key): key is string => !!key).sort();
  let result: SmsReservation;
  try {
    result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "RateLimit" ("key", "count", "resetAt")
        SELECT k, 0, to_timestamp(0) FROM unnest(${all}::text[]) AS k
        ON CONFLICT ("key") DO NOTHING`;
      const rows = await tx.$queryRaw<Row[]>`
        SELECT "key", "count", "resetAt" FROM "RateLimit" WHERE "key" = ANY(${all}::text[]) ORDER BY "key" FOR UPDATE`;
      const live = new Map(rows.map((row) => [row.key, new Date(row.resetAt).getTime() > now.getTime() ? Number(row.count) : 0]));
      const count = (key: string | null) => (key ? (live.get(key) ?? 0) : 0);
      const used = count(keys.budget);
      if (used >= SMS_CODE_DAILY_BUDGET) return { ok: false as const, reason: "budget" as const };
      if (!source.trusted && used >= smsUntrustedBudget()) return { ok: false as const, reason: "reserve" as const };
      if (count(keys.userShare) >= SMS_SOURCE_LIMITS.sharePerSource || count(keys.ipShare) >= SMS_SOURCE_LIMITS.sharePerSource) {
        return { ok: false as const, reason: "share" as const };
      }
      if (count(keys.userBrake) >= SMS_SOURCE_LIMITS.unconfirmedMax || count(keys.ipBrake) >= SMS_SOURCE_LIMITS.unconfirmedMax) {
        return { ok: false as const, reason: "brake" as const };
      }
      const dayEnd = new Date(now.getTime() + DAY_MS);
      for (const key of all) {
        const fresh = count(key) === 0;
        if (fresh) await tx.$executeRaw`UPDATE "RateLimit" SET "count" = 1, "resetAt" = ${dayEnd} WHERE "key" = ${key}`;
        else await tx.$executeRaw`UPDATE "RateLimit" SET "count" = "count" + 1 WHERE "key" = ${key}`;
      }
      return { ok: true as const, budgetUsed: used + 1 };
    });
  } catch (error) {
    console.error("[sms] the SMS budget could not be checked — NOT sending (fail closed):", (error as Error)?.message ?? error);
    return { ok: false, reason: "unavailable" };
  }
  if (result.ok) {
    // Exactly one request reaches each of these counts (the update is atomic), so each alert goes once.
    if (smsBudgetWarnPoints().includes(result.budgetUsed)) {
      void sendFounderAlert({ kind: "sms_budget_warning", reason: "sms_budget", detail: `${result.budgetUsed} / ${SMS_CODE_DAILY_BUDGET}`, adminUrl: SMS_CONTROLS_PATH });
    }
    if (result.budgetUsed === SMS_CODE_DAILY_BUDGET) {
      void recordSecurityEvent({ type: "sms_budget_reached", ip: null, meta: { budget: SMS_CODE_DAILY_BUDGET } });
      void sendFounderAlert({ kind: "sms_budget_reached", reason: "sms_budget", detail: `${SMS_CODE_DAILY_BUDGET} / ${SMS_CODE_DAILY_BUDGET}`, adminUrl: SMS_CONTROLS_PATH });
    }
  }
  return result;
}

/** A reserved text did not go out (Twilio refused): give back everything `reserveSmsSend` counted. */
export async function releaseSmsSend(source: SmsSource, { budgetKey = BUDGET_KEY }: { budgetKey?: string } = {}): Promise<void> {
  const all = Object.values(counterKeys(source, budgetKey)).filter((key): key is string => !!key);
  try {
    await db.$executeRaw`UPDATE "RateLimit" SET "count" = GREATEST("count" - 1, 0) WHERE "key" = ANY(${all}::text[])`;
  } catch (error) {
    console.error("[sms] could not give back an unsent text's counters:", (error as Error)?.message ?? error);
  }
}

/** Without counting anything: is there budget left for this source? A database error answers no. */
export async function smsBudgetAvailable(trusted: boolean, { now = new Date(), budgetKey = BUDGET_KEY }: { now?: Date; budgetKey?: string } = {}): Promise<boolean> {
  try {
    const row = await db.rateLimit.findUnique({ where: { key: budgetKey }, select: { count: true, resetAt: true } });
    const used = row && row.resetAt.getTime() > now.getTime() ? row.count : 0;
    return used < (trusted ? SMS_CODE_DAILY_BUDGET : smsUntrustedBudget());
  } catch {
    return false;
  }
}

// ── Codes confirmed ÷ sent, per country ──

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

/** Is this source held by the country's pause? Trusted sources go through a pause (still fail closed on errors). */
export async function smsPausedFor(country: string, source: SmsSource, now: Date = new Date()): Promise<boolean> {
  const paused = await isSmsCountryPaused(country, now);
  return paused && !source.trusted;
}

/** The pure rule: should this country pause? */
export function smsRatioTooLow(sent: number, verified: number): boolean {
  if (sent < SMS_RATIO_ALERT.minSent) return false;
  return verified / sent < SMS_RATIO_ALERT.below;
}

/** The pure rule with the spread: low ratio AND many different sources and IP blocks. */
export function smsCountryShouldPause(stats: { sent: number; verified: number; sources: number; ipBlocks: number }): boolean {
  return smsRatioTooLow(stats.sent, stats.verified) && stats.sources >= SMS_PAUSE_SPREAD.minSources && stats.ipBlocks >= SMS_PAUSE_SPREAD.minIpBlocks;
}

function windowOf(now: Date) {
  return {
    start: new Date(now.getTime() - (SMS_RATIO_ALERT.windowMinutes + SMS_RATIO_ALERT.settleMinutes) * 60_000),
    settled: new Date(now.getTime() - SMS_RATIO_ALERT.settleMinutes * 60_000),
  };
}

/** Counts of the last window for one country (sent: codes whose life is over; verified: up to now). */
export async function smsCountsFor(country: string, now: Date = new Date()): Promise<{ sent: number; verified: number }> {
  const { sent, verified } = await smsWindowStats(country, now);
  return { sent, verified };
}

/** The window's counts plus how many different sources (accounts, else IP blocks) and IP blocks sent them. */
export async function smsWindowStats(country: string, now: Date = new Date()): Promise<{ sent: number; verified: number; sources: number; ipBlocks: number }> {
  const { start, settled } = windowOf(now);
  const [sentRows, verified] = await Promise.all([
    db.$queryRaw<{ sent: number; sources: number; blocks: number }[]>`
      SELECT COUNT(*)::int AS sent,
             COUNT(DISTINCT COALESCE("userId", 'ip:' || "ipHash"))::int AS sources,
             COUNT(DISTINCT "ipHash")::int AS blocks
      FROM "SecurityEvent"
      WHERE "type" = 'sms_code_sent' AND "meta"->>'country' = ${country} AND "createdAt" >= ${start} AND "createdAt" < ${settled}`,
    db.securityEvent.count({ where: { type: "sms_code_verified", createdAt: { gte: start }, meta: { path: ["country"], equals: country } } }),
  ]);
  const row = sentRows[0];
  return { sent: Number(row?.sent ?? 0), verified, sources: Number(row?.sources ?? 0), ipBlocks: Number(row?.blocks ?? 0) };
}

/**
 * After a code text went out: logs it (country, account, IP block) and checks the ratio. Pauses the
 * country for untrusted sources and alerts the founder when too few codes are confirmed across many
 * sources. Never throws.
 */
export async function recordSmsCodeSent(country: string, source: SmsSource | null = null, now: Date = new Date()): Promise<void> {
  await recordSecurityEvent({ type: "sms_code_sent", userId: source?.userId ?? null, ip: source?.ipBlock ?? null, meta: { country } });
  try {
    const stats = await smsWindowStats(country, now);
    if (!smsCountryShouldPause(stats)) return;
    const until = new Date(now.getTime() + SMS_COUNTRY_PAUSE_MINUTES * 60_000);
    // Starts a pause only if none is running; RETURNING tells whether this call started it.
    const started = await db.$queryRaw<{ key: string }[]>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${pauseKey(country)}, 1, ${until})
      ON CONFLICT ("key") DO UPDATE SET "count" = "RateLimit"."count" + 1, "resetAt" = EXCLUDED."resetAt"
        WHERE "RateLimit"."resetAt" <= ${now}
      RETURNING "key"`;
    if (started.length === 0) return;
    const percent = Math.round((stats.verified / stats.sent) * 100);
    await recordSecurityEvent({
      type: "sms_ratio_low",
      ip: null,
      // "networks": the IP blocks (a meta key may not name "ip": src/lib/security/events.ts).
      meta: { country, sent: stats.sent, verified: stats.verified, sources: stats.sources, networks: stats.ipBlocks, pauseMinutes: SMS_COUNTRY_PAUSE_MINUTES },
    });
    await sendFounderAlert({ kind: "sms_country_paused", reason: "sms_ratio", country, detail: `${stats.verified} / ${stats.sent} (${percent}%)`, adminUrl: SMS_CONTROLS_PATH });
  } catch (error) {
    console.error("[sms] the confirmed ÷ sent check failed:", (error as Error)?.message ?? error);
  }
}

/** A code that went by text was confirmed: logged (country, account, IP block), and the source's brake is released. */
export async function recordSmsCodeVerified(country: string, source: SmsSource | null = null): Promise<void> {
  await recordSecurityEvent({ type: "sms_code_verified", userId: source?.userId ?? null, ip: source?.ipBlock ?? null, meta: { country } });
  if (!source) return;
  const block = source.ipBlock ? blockHash(source.ipBlock) : null;
  const keys = [source.userId ? `sms:unconfirmed:user:${source.userId}` : null, block ? `sms:unconfirmed:ip:${block}` : null].filter((key): key is string => !!key);
  if (keys.length > 0) await db.rateLimit.deleteMany({ where: { key: { in: keys } } }).catch(() => undefined);
}

// ── The founder's controls (the actions in ./sms-control-actions.ts check ADMIN and audit) ──

export type SmsControlState = {
  budget: { used: number; limit: number; untrustedLimit: number; resetAt: Date | null };
  paused: { country: string; until: Date }[];
};

export async function smsControlState(now: Date = new Date()): Promise<SmsControlState> {
  const [budget, pauses] = await Promise.all([
    db.rateLimit.findUnique({ where: { key: BUDGET_KEY }, select: { count: true, resetAt: true } }),
    db.rateLimit.findMany({ where: { key: { startsWith: "sms:paused:" }, resetAt: { gt: now } }, select: { key: true, resetAt: true }, orderBy: { key: "asc" } }),
  ]);
  const live = budget && budget.resetAt.getTime() > now.getTime();
  return {
    budget: { used: live ? budget.count : 0, limit: SMS_CODE_DAILY_BUDGET, untrustedLimit: smsUntrustedBudget(), resetAt: live ? budget.resetAt : null },
    paused: pauses.map((row) => ({ country: row.key.slice("sms:paused:".length), until: row.resetAt })),
  };
}

/** Ends a country's pause now. True when one was running. */
export async function resumeSmsCountryNow(country: string): Promise<boolean> {
  const { count } = await db.rateLimit.deleteMany({ where: { key: pauseKey(country) } });
  return count > 0;
}

/** Starts today's budget again from 0 (another SMS_CODE_DAILY_BUDGET texts). */
export async function resetSmsBudgetNow(): Promise<void> {
  await db.rateLimit.deleteMany({ where: { key: BUDGET_KEY } });
}
