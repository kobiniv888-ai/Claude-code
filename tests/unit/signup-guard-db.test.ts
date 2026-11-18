/**
 * SECURITY_REPORT 3.8.b (founder's answer Q20: 3 accounts per device in 30 days, flag only) against
 * the local database: the 4th new account on one device is flagged with a "signup_device_cap"
 * security event and listed on Admin → Flags → "One device"; nothing is ever refused. Older
 * accounts (over 30 days) and demo accounts don't count; "mark reviewed" (an audit entry) closes
 * the flag until a newer event. Rows are this test's own and are removed afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/request", () => ({ getDeviceHash: async () => null, getClientIp: async () => null }));

const { db } = await import("@/lib/db");
const guard = await import("@/lib/security/signup-guard");

const prefix = `sgd${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const users: string[] = [];
const DAY = 24 * 3600 * 1000;
const NOW = new Date();

async function accountOnDevice(name: string, deviceHash: string, opts: { daysAgo?: number; isDemo?: boolean } = {}) {
  const id = `${prefix}-${name}`;
  const createdAt = new Date(NOW.getTime() - (opts.daysAgo ?? 0) * DAY);
  await db.user.create({ data: { id, name, email: `${id}@example.com`, createdAt, isDemo: opts.isDemo ?? false } });
  await db.deviceLink.create({ data: { deviceHash, userId: id, firstSeenAt: createdAt, lastSeenAt: createdAt } });
  users.push(id);
  return id;
}

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { targetId: { in: users } } });
  await db.securityEvent.deleteMany({ where: { userId: { in: users } } });
  await db.deviceLink.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
});

describe("accounts per device (3.8.b)", () => {
  it("the rule: more than 3 in 30 days", () => {
    expect(guard.SIGNUP_DEVICE_ACCOUNT_CAP).toBe(3);
    expect(guard.SIGNUP_DEVICE_WINDOW_DAYS).toBe(30);
    expect(guard.overSignupDeviceCap(3)).toBe(false);
    expect(guard.overSignupDeviceCap(4)).toBe(true);
  });

  it("flags the 4th new account on one device, never the first three; old and demo accounts don't count", async () => {
    const device = `${prefix}-device-a`;
    // Not counted: an account made 40 days ago and a demo account.
    await accountOnDevice("old", device, { daysAgo: 40 });
    await accountOnDevice("demo", device, { isDemo: true });
    const first = await accountOnDevice("a1", device, { daysAgo: 10 });
    expect(await guard.checkSignupDevice(first, { deviceHash: device, now: NOW })).toEqual({ accounts: 1, flagged: false });
    await accountOnDevice("a2", device, { daysAgo: 5 });
    const third = await accountOnDevice("a3", device, { daysAgo: 1 });
    expect(await guard.checkSignupDevice(third, { deviceHash: device, now: NOW })).toEqual({ accounts: 3, flagged: false });
    expect(await db.securityEvent.count({ where: { type: "signup_device_cap", userId: { in: users } } })).toBe(0);

    const fourth = await accountOnDevice("a4", device);
    expect(await guard.checkSignupDevice(fourth, { deviceHash: device, now: NOW })).toEqual({ accounts: 4, flagged: true });
    const events = await db.securityEvent.findMany({ where: { type: "signup_device_cap", userId: fourth } });
    expect(events).toHaveLength(1);
    expect(events[0]!.meta).toMatchObject({ accounts: 4, windowDays: 30, cap: 3 });

    // The account exists and can go on: nothing was refused or changed.
    expect(await db.user.findUnique({ where: { id: fourth }, select: { status: true } })).toEqual({ status: "ACTIVE" });
  });

  it("lists the flag for the admin until it is marked reviewed; a newer event opens it again", async () => {
    const fourth = `${prefix}-a4`;
    const open = await guard.listDeviceFlags("open");
    const row = open.rows.find((r) => r.id === fourth);
    expect(row).toMatchObject({ accounts: 4, open: true, reviewedAt: null });

    await db.auditLog.create({ data: { action: guard.DEVICE_FLAG_REVIEWED_ACTION, targetType: "User", targetId: fourth, details: { note: "test" } } });
    expect((await guard.listDeviceFlags("open")).rows.some((r) => r.id === fourth)).toBe(false);
    expect((await guard.listDeviceFlags("reviewed")).rows.some((r) => r.id === fourth)).toBe(true);
    expect(await guard.deviceFlagSummary(fourth)).toMatchObject({ open: false });

    await new Promise((resolve) => setTimeout(resolve, 5));
    await db.securityEvent.create({ data: { type: "signup_device_cap", userId: fourth, meta: { accounts: 5 } } });
    expect(await guard.deviceFlagSummary(fourth)).toMatchObject({ open: true, accounts: 5 });
  });

  it("no device id (cookie blocked): nothing to count, nothing flagged, but the sign-up is recorded (LP-8)", async () => {
    const before = await guard.countSignupsWithoutDevice();
    expect(await guard.checkSignupDevice(`${prefix}-a1`, { deviceHash: null })).toBeNull();
    expect(await db.securityEvent.count({ where: { type: "signup_no_device", userId: `${prefix}-a1` } })).toBe(1);
    expect(await guard.countSignupsWithoutDevice()).toBe(before + 1);
  });

  it("deleting accounts does not reset the count: sign up 4, delete 2, the next one is still flagged (LP-8)", async () => {
    const device = `${prefix}-device-b`;
    const made: string[] = [];
    for (const n of [1, 2, 3, 4]) {
      const id = await accountOnDevice(`b${n}`, device);
      made.push(id);
      await guard.checkSignupDevice(id, { deviceHash: device, now: NOW });
    }
    // Two accounts deleted: their device links go, their events stay (userId becomes null).
    const gone = made.slice(0, 2);
    const goneEvents = (await db.securityEvent.findMany({ where: { userId: { in: gone } }, select: { id: true } })).map((e) => e.id);
    await db.deviceLink.deleteMany({ where: { userId: { in: gone } } });
    await db.user.deleteMany({ where: { id: { in: gone } } });
    try {
      const next = await accountOnDevice("b5", device);
      const result = await guard.checkSignupDevice(next, { deviceHash: device, now: NOW });
      expect(result).toEqual({ accounts: 5, flagged: true });
      // The event keeps a keyed mark of the device, never the device hash itself.
      const [event] = await db.securityEvent.findMany({ where: { type: "signup_device", userId: next }, select: { meta: true } });
      expect((event!.meta as { d: string }).d).toMatch(/^[a-p]{32}$/);
      expect(JSON.stringify(event!.meta)).not.toContain(device);
    } finally {
      await db.securityEvent.deleteMany({ where: { id: { in: goneEvents } } });
    }
  });
});
