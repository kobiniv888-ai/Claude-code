/**
 * The SMS brakes (SECURITY_REPORT 3.2.c, 3.2.d; founder's answers Q20, D8 a), per SOURCE first so
 * one actor cannot stop the texts for everyone (S1 review login-codes-2/3): a daily budget of 300
 * code texts with a share per account and per IP block and a reserve for trusted sources, a brake
 * on sources with unconfirmed codes, and confirmed ÷ sent per country (below 0.5 with ≥ 20 sent,
 * spread over many sources → that country pauses for untrusted sources). Against the local
 * database with a fake country code ("ZZ") and a test budget key; every row is removed afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const alerts = vi.hoisted(() => ({ send: vi.fn(async () => {}) }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/alerts/founder", () => ({ sendFounderAlert: alerts.send }));
vi.mock("@/lib/request", () => ({ getClientIp: async () => null }));

const guard = await import("./sms-guard");
const { db } = await import("@/lib/db");
const { hmacHash } = await import("@/lib/crypto");

const COUNTRY = "ZZ";
const run = randomUUID().slice(0, 8);
const budgetKey = `vitest:sms-budget:${run}`;
const BLOCK = `198.51.${run.length}.0/24`;
const blockKeys = [`sms:share:ip:${hmacHash(`sms-ip-block:${BLOCK}`)}`, `sms:unconfirmed:ip:${hmacHash(`sms-ip-block:${BLOCK}`)}`];
const source = (name: string, extra: Partial<{ trusted: boolean; ipBlock: string | null; userId: string | null }> = {}) => ({
  userId: `vitest-sms-${run}-${name}`,
  ipBlock: null,
  trusted: false,
  ...extra,
});

async function cleanCountry() {
  await db.securityEvent.deleteMany({
    where: { type: { in: ["sms_code_sent", "sms_code_verified", "sms_ratio_low"] }, meta: { path: ["country"], equals: COUNTRY } },
  });
  await db.rateLimit.deleteMany({ where: { key: `sms:paused:${COUNTRY}` } });
}

beforeEach(async () => {
  alerts.send.mockClear();
  await cleanCountry();
  await db.rateLimit.deleteMany({ where: { OR: [{ key: budgetKey }, { key: { contains: `vitest-sms-${run}` } }, { key: { in: blockKeys } }] } });
});

afterAll(async () => {
  await cleanCountry();
  await db.securityEvent.deleteMany({ where: { type: "sms_budget_reached", meta: { path: ["budget"], equals: guard.SMS_CODE_DAILY_BUDGET }, createdAt: { gte: new Date(Date.now() - 600_000) } } });
  await db.rateLimit.deleteMany({ where: { OR: [{ key: budgetKey }, { key: { contains: `vitest-sms-${run}` } }, { key: { in: blockKeys } }] } });
  await db.$disconnect();
});

describe("the daily SMS budget", () => {
  it("300 code texts a day for trusted sources; the founder hears at 50%, 80% and when it runs out (once each)", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 302; i++) results.push((await guard.reserveSmsSend(source(`t${i}`, { trusted: true }), { budgetKey })).ok);
    expect(results.filter(Boolean)).toHaveLength(300);
    expect(results.slice(300)).toEqual([false, false]);
    const kinds = alerts.send.mock.calls.map((call) => (call as unknown as [{ kind: string; adminUrl?: string }])[0]);
    expect(kinds.map((k) => k.kind)).toEqual(["sms_budget_warning", "sms_budget_warning", "sms_budget_reached"]);
    expect(kinds.every((k) => k.adminUrl === guard.SMS_CONTROLS_PATH)).toBe(true);
    expect(guard.smsBudgetWarnPoints()).toEqual([150, 240]);
  });

  it("30% is kept for trusted sources: untrusted ones stop at 210, a trusted one still gets a text", async () => {
    const results: string[] = [];
    for (let i = 0; i < 212; i++) {
      const r = await guard.reserveSmsSend(source(`u${i}`), { budgetKey });
      results.push(r.ok ? "ok" : r.reason);
    }
    expect(results.filter((r) => r === "ok")).toHaveLength(guard.smsUntrustedBudget());
    expect(results.slice(210)).toEqual(["reserve", "reserve"]);
    expect(await guard.reserveSmsSend(source("trusted", { trusted: true }), { budgetKey })).toMatchObject({ ok: true });
    expect(await guard.smsBudgetAvailable(false, { budgetKey })).toBe(false);
    expect(await guard.smsBudgetAvailable(true, { budgetKey })).toBe(true);
  });

  it("one account, or one IP block, uses at most its share (6 a day) — 300 tries do not empty the budget", async () => {
    const account = source("one-account", { trusted: true });
    const accountResults: string[] = [];
    for (let i = 0; i < 300; i++) {
      const r = await guard.reserveSmsSend(account, { budgetKey });
      accountResults.push(r.ok ? "ok" : r.reason);
      if (!r.ok) break;
      // Even when every code is entered (no brake), the share holds.
      await guard.recordSmsCodeVerified(COUNTRY, account);
    }
    expect(accountResults.filter((r) => r === "ok")).toHaveLength(guard.SMS_SOURCE_LIMITS.sharePerSource);
    expect(accountResults.at(-1)).toBe("share");

    const block = BLOCK;
    const blockResults: string[] = [];
    for (let i = 0; i < 300; i++) {
      // A new account each time, one IP block.
      const r = await guard.reserveSmsSend(source(`blk${i}`, { trusted: true, ipBlock: block }), { budgetKey });
      blockResults.push(r.ok ? "ok" : r.reason);
      if (!r.ok) break;
    }
    expect(blockResults.filter((r) => r === "ok")).toHaveLength(guard.SMS_SOURCE_LIMITS.sharePerSource);
    expect(blockResults.at(-1)).toBe("share");
    // The budget is far from used up.
    expect(await guard.smsBudgetAvailable(false, { budgetKey })).toBe(true);
  });

  it("a source with 3 codes nobody entered is braked until one is confirmed", async () => {
    const s = source("brake");
    for (let i = 0; i < 3; i++) expect(await guard.reserveSmsSend(s, { budgetKey })).toMatchObject({ ok: true });
    expect(await guard.reserveSmsSend(s, { budgetKey })).toEqual({ ok: false, reason: "brake" });
    await guard.recordSmsCodeVerified(COUNTRY, s);
    expect(await guard.reserveSmsSend(s, { budgetKey })).toMatchObject({ ok: true });
  });

  it("a text that could not be sent gives its counts back", async () => {
    const s = source("release");
    expect(await guard.reserveSmsSend(s, { budgetKey })).toMatchObject({ ok: true, budgetUsed: 1 });
    await guard.releaseSmsSend(s, { budgetKey });
    expect(await guard.reserveSmsSend(s, { budgetKey })).toMatchObject({ ok: true, budgetUsed: 1 });
  });

  it("fails closed when the counters cannot be written", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const spy = vi.spyOn(db, "$transaction").mockRejectedValueOnce(new Error("db down"));
    await expect(guard.reserveSmsSend(source("broken"), { budgetKey })).resolves.toEqual({ ok: false, reason: "unavailable" });
    spy.mockRestore();
  });
});

describe("IP blocks", () => {
  it("IPv4 by its /24, IPv6 by its /64", () => {
    expect(guard.smsIpBlock("203.0.113.77")).toBe("203.0.113.0/24");
    expect(guard.smsIpBlock("2001:db8:abcd:12:1::5")).toBe("2001:db8:abcd:12::/64");
    expect(guard.smsIpBlock("2001:0db8:abcd:0012:ffff::1")).toBe("2001:db8:abcd:12::/64");
    expect(guard.smsIpBlock(null)).toBeNull();
    expect(guard.smsIpBlock("not-an-ip")).toBeNull();
  });
});

describe("confirmed ÷ sent per country", () => {
  it("the rule: below 0.5 with at least 20 sent, spread over 10+ sources and IP blocks", () => {
    expect(guard.smsRatioTooLow(19, 0)).toBe(false);
    expect(guard.smsRatioTooLow(20, 9)).toBe(true);
    expect(guard.smsRatioTooLow(20, 10)).toBe(false);
    expect(guard.smsRatioTooLow(100, 49)).toBe(true);
    expect(guard.smsCountryShouldPause({ sent: 20, verified: 0, sources: 1, ipBlocks: 1 })).toBe(false);
    expect(guard.smsCountryShouldPause({ sent: 20, verified: 0, sources: 10, ipBlocks: 9 })).toBe(false);
    expect(guard.smsCountryShouldPause({ sent: 20, verified: 0, sources: 10, ipBlocks: 10 })).toBe(true);
  });

  it("counts only codes whose 10 minutes are over, from the last hour", async () => {
    const now = new Date();
    const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
    await db.securityEvent.createMany({
      data: [
        { type: "sms_code_sent", meta: { country: COUNTRY }, createdAt: minutesAgo(30) },
        { type: "sms_code_sent", meta: { country: COUNTRY }, createdAt: minutesAgo(5) }, // still typing
        { type: "sms_code_sent", meta: { country: COUNTRY }, createdAt: minutesAgo(90) }, // too old
        { type: "sms_code_verified", meta: { country: COUNTRY }, createdAt: minutesAgo(1) },
        { type: "sms_code_sent", meta: { country: "YY" }, createdAt: minutesAgo(30) }, // another country
      ],
    });
    expect(await guard.smsCountsFor(COUNTRY, now)).toEqual({ sent: 1, verified: 1 });
    await db.securityEvent.deleteMany({ where: { type: "sms_code_sent", meta: { path: ["country"], equals: "YY" } } });
  });

  it("20+ unconfirmed codes from ONE source do not pause the country (that is the per-source brake's job)", async () => {
    const past = new Date(Date.now() - 30 * 60_000);
    await db.securityEvent.createMany({
      data: Array.from({ length: 24 }, () => ({ type: "sms_code_sent", ipHash: `vitest-one-block-${run}`, meta: { country: COUNTRY }, createdAt: past })),
    });
    await guard.recordSmsCodeSent(COUNTRY, { userId: null, ipBlock: "192.0.2.0/24", trusted: false });
    expect(await guard.isSmsCountryPaused(COUNTRY)).toBe(false);
    expect(alerts.send).not.toHaveBeenCalled();
  });

  it("the same volume from 10+ sources and IP blocks pauses the country (once) for untrusted sources and tells the founder", async () => {
    const past = new Date(Date.now() - 30 * 60_000);
    await db.securityEvent.createMany({
      data: [
        ...Array.from({ length: 24 }, (_, i) => ({ type: "sms_code_sent", ipHash: `vitest-block-${run}-${i % 12}`, meta: { country: COUNTRY }, createdAt: past })),
        ...Array.from({ length: 3 }, () => ({ type: "sms_code_verified", meta: { country: COUNTRY }, createdAt: past })),
      ],
    });
    expect(await guard.isSmsCountryPaused(COUNTRY)).toBe(false);
    await guard.recordSmsCodeSent(COUNTRY);
    expect(await guard.isSmsCountryPaused(COUNTRY)).toBe(true);
    expect(alerts.send).toHaveBeenCalledTimes(1);
    expect(alerts.send).toHaveBeenCalledWith(expect.objectContaining({ kind: "sms_country_paused", country: COUNTRY, reason: "sms_ratio", adminUrl: guard.SMS_CONTROLS_PATH }));
    const event = await db.securityEvent.findFirst({ where: { type: "sms_ratio_low", meta: { path: ["country"], equals: COUNTRY } } });
    expect(event?.meta).toMatchObject({ country: COUNTRY, sent: 24, verified: 3, networks: 12 });
    // A trusted source still gets its code; an untrusted one does not.
    expect(await guard.smsPausedFor(COUNTRY, source("trusted-during-pause", { trusted: true }))).toBe(false);
    expect(await guard.smsPausedFor(COUNTRY, source("untrusted-during-pause"))).toBe(true);
    // A second send while paused does not alert again.
    await guard.recordSmsCodeSent(COUNTRY);
    expect(alerts.send).toHaveBeenCalledTimes(1);
    // The founder's resume ends it.
    expect(await guard.resumeSmsCountryNow(COUNTRY)).toBe(true);
    expect(await guard.isSmsCountryPaused(COUNTRY)).toBe(false);
  });

  it("a healthy ratio does not pause", async () => {
    const past = new Date(Date.now() - 30 * 60_000);
    await db.securityEvent.createMany({
      data: [
        ...Array.from({ length: 24 }, (_, i) => ({ type: "sms_code_sent", ipHash: `vitest-block-${run}-${i}`, meta: { country: COUNTRY }, createdAt: past })),
        ...Array.from({ length: 20 }, () => ({ type: "sms_code_verified", meta: { country: COUNTRY }, createdAt: past })),
      ],
    });
    await guard.recordSmsCodeSent(COUNTRY);
    expect(await guard.isSmsCountryPaused(COUNTRY)).toBe(false);
    expect(alerts.send).not.toHaveBeenCalled();
  });

  it("the pause check fails closed", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const spy = vi.spyOn(db.rateLimit, "findUnique").mockRejectedValueOnce(new Error("db down"));
    await expect(guard.isSmsCountryPaused(COUNTRY)).resolves.toBe(true);
    spy.mockRestore();
  });
});
