/**
 * The security event log (SECURITY_REPORT 16.2, D6) against the local database (DATABASE_URL in
 * .env): best effort, never personal data, 90-day retention. Rows use a unique marker in meta and
 * are removed afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/request", () => ({ getClientIp: async () => "203.0.113.7" }));

const { db } = await import("@/lib/db");
const { hmacHash } = await import("@/lib/crypto");
const { SECURITY_EVENT_TYPES, isSecurityEventType } = await import("./event-types");
const { purgeOldSecurityEvents, recordSecurityEvent, sanitizeSecurityMeta, SECURITY_EVENT_RETENTION_DAYS } = await import("./events");

const run = `vitest${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const mine = () => db.securityEvent.findMany({ where: { meta: { path: ["run"], equals: run } }, orderBy: { createdAt: "asc" } });

afterAll(async () => {
  await db.securityEvent.deleteMany({ where: { meta: { path: ["run"], equals: run } } });
  await db.$disconnect();
});

describe("security event types", () => {
  it("start with the founder's list and are recognised", () => {
    for (const type of [
      "login_code_locked",
      "sms_budget_reached",
      "sms_ratio_low",
      "totp_locked",
      "totp_unlock_email",
      "recovery_code_used",
      "new_device_login",
      "sensitive_change",
      "staff_session_idle_logout",
      "booking_cap_hit",
      "show_contact_cap_hit",
      "csp_report",
    ]) {
      expect(SECURITY_EVENT_TYPES).toContain(type);
      expect(isSecurityEventType(type)).toBe(true);
    }
    expect(isSecurityEventType("made_up")).toBe(false);
  });
});

describe("sanitizeSecurityMeta: small, flat and free of personal data", () => {
  it("keeps counts, reason codes and country codes", () => {
    expect(sanitizeSecurityMeta({ run, count: 3, countryCode: "IL", channel: "sms", ok: false, reasonCode: "budget" })).toEqual({
      run,
      count: 3,
      countryCode: "IL",
      channel: "sms",
      ok: false,
      reasonCode: "budget",
    });
  });

  it("drops personal keys, personal-looking values, nested objects and too much", () => {
    const cleaned = sanitizeSecurityMeta({
      email: "guest@example.com",
      guestPhone: "+972500000000",
      ipAddress: "203.0.113.7",
      code: "123456",
      apiKey: "abc",
      sessionId: "s1",
      firstName: "Dana",
      note: "write to guest@example.com",
      number: "+972 50 000 0000",
      server: "198.51.100.4",
      v6: "2001:db8::1",
      shortCode: "4821",
      nested: { a: 1 },
      list: [1, 2],
      bad: Number.NaN,
      "weird key": 1,
      long: "x".repeat(500),
    });
    expect(cleaned).toEqual({ long: "x".repeat(120) });
    const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(sanitizeSecurityMeta(many) ?? {})).toHaveLength(20);
    expect(sanitizeSecurityMeta(null)).toBeNull();
    expect(sanitizeSecurityMeta({ email: "a@b.co" })).toBeNull();
  });
});

describe("recordSecurityEvent", () => {
  it("stores the type, the user, a HASH of the IP and the cleaned meta — never the raw values", async () => {
    await expect(recordSecurityEvent({ type: "login_code_locked", ip: "198.51.100.23", meta: { run, channel: "email", email: "guest@example.com" } })).resolves.toBe(true);
    await expect(recordSecurityEvent({ type: "csp_report", meta: { run, directive: "img-src" } })).resolves.toBe(true);
    await expect(recordSecurityEvent({ type: "sms_budget_reached", ip: null, meta: { run } })).resolves.toBe(true);
    const rows = await mine();
    expect(rows.map((r) => r.type)).toEqual(["login_code_locked", "csp_report", "sms_budget_reached"]);
    expect(rows[0]!.ipHash).toBe(hmacHash("ip:198.51.100.23"));
    expect(rows[0]!.meta).toEqual({ run, channel: "email" });
    // No `ip` given: the current request's IP, hashed.
    expect(rows[1]!.ipHash).toBe(hmacHash("ip:203.0.113.7"));
    expect(rows[2]!.ipHash).toBeNull();
    const stored = JSON.stringify(rows);
    expect(stored).not.toContain("198.51.100.23");
    expect(stored).not.toContain("203.0.113.7");
    expect(stored).not.toContain("guest@example.com");
  });

  it("never throws: an unknown type or a failing database returns false", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordSecurityEvent({ type: "made_up" as never, meta: { run } })).resolves.toBe(false);
    const create = vi.spyOn(db.securityEvent, "create").mockRejectedValueOnce(new Error("connection refused"));
    await expect(recordSecurityEvent({ type: "totp_locked", ip: null, meta: { run } })).resolves.toBe(false);
    create.mockRestore();
    spy.mockRestore();
  });
});

describe("purgeOldSecurityEvents (90-day retention)", () => {
  it("deletes events older than 90 days and keeps newer ones", async () => {
    const now = new Date();
    const day = 24 * 3600 * 1000;
    await db.securityEvent.createMany({
      data: [
        { type: "csp_report", meta: { run, age: "old" }, createdAt: new Date(now.getTime() - (SECURITY_EVENT_RETENTION_DAYS + 1) * day) },
        { type: "csp_report", meta: { run, age: "recent" }, createdAt: new Date(now.getTime() - (SECURITY_EVENT_RETENTION_DAYS - 1) * day) },
      ],
    });
    expect(await purgeOldSecurityEvents(now)).toBeGreaterThanOrEqual(1);
    const left = (await mine()).map((r) => (r.meta as { age?: string }).age).filter(Boolean);
    expect(left).toEqual(["recent"]);
  });
});
