/**
 * The SMS brakes (SECURITY_REPORT 3.2.c, 3.2.d; founder's answers Q20, D8 a): a daily budget of 300
 * code texts with founder alerts, and confirmed ÷ sent per country from the security event log
 * (below 0.5 with ≥ 20 sent → that country pauses). Against the local database with a fake
 * country code ("ZZ") and a test budget key; every row is removed afterwards.
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

const COUNTRY = "ZZ";
const budgetKey = `vitest:sms-budget:${randomUUID()}`;

async function cleanCountry() {
  await db.securityEvent.deleteMany({
    where: { type: { in: ["sms_code_sent", "sms_code_verified", "sms_ratio_low"] }, meta: { path: ["country"], equals: COUNTRY } },
  });
  await db.rateLimit.deleteMany({ where: { key: `sms:paused:${COUNTRY}` } });
}

beforeEach(async () => {
  alerts.send.mockClear();
  await cleanCountry();
});

afterAll(async () => {
  await cleanCountry();
  await db.securityEvent.deleteMany({ where: { type: "sms_budget_reached", meta: { path: ["budget"], equals: guard.SMS_CODE_DAILY_BUDGET }, createdAt: { gte: new Date(Date.now() - 600_000) } } });
  await db.rateLimit.deleteMany({ where: { key: budgetKey } });
  await db.$disconnect();
});

describe("daily SMS budget", () => {
  it("300 code texts a day; the founder hears at 80% and when it runs out (once each)", async () => {
    const results: boolean[] = [];
    // 302 parallel-ish charges: exactly 300 pass.
    for (let i = 0; i < 302; i++) results.push(await guard.chargeSmsBudget({ key: budgetKey }));
    expect(results.filter(Boolean)).toHaveLength(300);
    expect(results.slice(300)).toEqual([false, false]);
    const kinds = alerts.send.mock.calls.map((call) => (call as unknown as [{ kind: string }])[0].kind);
    expect(kinds).toEqual(["sms_budget_warning", "sms_budget_reached"]);
    expect(guard.smsBudgetWarnAt()).toBe(240);
  });

  it("fails closed when the counter cannot be written", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const spy = vi.spyOn(db, "$queryRaw").mockRejectedValueOnce(new Error("db down"));
    await expect(guard.chargeSmsBudget({ key: budgetKey })).resolves.toBe(false);
    spy.mockRestore();
  });
});

describe("confirmed ÷ sent per country", () => {
  it("the rule: below 0.5 with at least 20 sent", () => {
    expect(guard.smsRatioTooLow(19, 0)).toBe(false);
    expect(guard.smsRatioTooLow(20, 9)).toBe(true);
    expect(guard.smsRatioTooLow(20, 10)).toBe(false);
    expect(guard.smsRatioTooLow(100, 49)).toBe(true);
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

  it("pauses the country (once) and tells the founder when too few codes are confirmed", async () => {
    const past = new Date(Date.now() - 30 * 60_000);
    await db.securityEvent.createMany({
      data: [
        ...Array.from({ length: 24 }, () => ({ type: "sms_code_sent", meta: { country: COUNTRY }, createdAt: past })),
        ...Array.from({ length: 3 }, () => ({ type: "sms_code_verified", meta: { country: COUNTRY }, createdAt: past })),
      ],
    });
    expect(await guard.isSmsCountryPaused(COUNTRY)).toBe(false);
    await guard.recordSmsCodeSent(COUNTRY);
    expect(await guard.isSmsCountryPaused(COUNTRY)).toBe(true);
    expect(alerts.send).toHaveBeenCalledTimes(1);
    expect(alerts.send).toHaveBeenCalledWith(expect.objectContaining({ kind: "sms_country_paused", country: COUNTRY, reason: "sms_ratio" }));
    const event = await db.securityEvent.findFirst({ where: { type: "sms_ratio_low", meta: { path: ["country"], equals: COUNTRY } } });
    expect(event?.meta).toMatchObject({ country: COUNTRY, sent: 24, verified: 3 });
    // A second send while paused does not alert again.
    await guard.recordSmsCodeSent(COUNTRY);
    expect(alerts.send).toHaveBeenCalledTimes(1);
  });

  it("a healthy ratio does not pause", async () => {
    const past = new Date(Date.now() - 30 * 60_000);
    await db.securityEvent.createMany({
      data: [
        ...Array.from({ length: 24 }, () => ({ type: "sms_code_sent", meta: { country: COUNTRY }, createdAt: past })),
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
