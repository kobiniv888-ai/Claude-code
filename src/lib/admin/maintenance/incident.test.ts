/**
 * The incident tools' work (SECURITY_REPORT 12.5.c, 17.1) against a FAKE database: "sign everyone
 * out" deletes every session but the caller's (staff included) and their staff markers; maintenance
 * mode is saved with its audit row in one transaction; a failed audit row stops both. A fake, not
 * the shared database: the real thing would sign out everyone working on it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fake = vi.hoisted(() => ({
  calls: [] as { op: string; args: unknown }[],
  events: [] as { type: string; meta?: unknown }[],
  auditFails: false,
  committed: [] as string[],
}));

vi.mock("@/lib/security/events", () => ({
  recordSecurityEvent: async (event: { type: string; meta?: unknown }) => {
    fake.events.push(event);
    return true;
  },
}));

vi.mock("@/lib/db", () => {
  const tx = {
    auditLog: {
      create: async (args: unknown) => {
        if (fake.auditFails) throw new Error("audit table down");
        fake.calls.push({ op: "auditLog.create", args });
        return {};
      },
    },
    session: {
      count: async (args: unknown) => {
        fake.calls.push({ op: "session.count", args });
        return 7;
      },
      deleteMany: async (args: unknown) => {
        fake.calls.push({ op: "session.deleteMany", args });
        return { count: 7 };
      },
    },
    verification: {
      deleteMany: async (args: unknown) => {
        fake.calls.push({ op: "verification.deleteMany", args });
        return { count: 2 };
      },
    },
    siteSetting: {
      upsert: async (args: unknown) => {
        fake.calls.push({ op: "siteSetting.upsert", args });
        return {};
      },
    },
  };
  return {
    db: {
      user: { findUnique: async () => null },
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => {
        const before = fake.calls.length;
        const result = await fn(tx);
        fake.committed.push(...fake.calls.slice(before).map((c) => c.op));
        return result;
      },
    },
  };
});

const { endEverySessionExcept, switchMaintenance } = await import("./incident");
const { maintenanceState, resetMaintenanceCache } = await import("@/lib/maintenance/state");

afterEach(() => {
  fake.calls = [];
  fake.events = [];
  fake.committed = [];
  fake.auditFails = false;
  resetMaintenanceCache();
});

describe("sign everyone out", () => {
  it("deletes every session except the caller's, writes the audit row first, records the event", async () => {
    const ended = await endEverySessionExcept("admin-1", "keep-me");
    expect(ended).toBe(7);
    const ops = fake.calls.map((c) => c.op);
    expect(ops).toEqual(["session.count", "auditLog.create", "session.deleteMany", "verification.deleteMany"]);
    expect(fake.calls.find((c) => c.op === "session.deleteMany")!.args).toEqual({ where: { id: { not: "keep-me" } } });
    // No other filter: guests, hosts and staff alike.
    expect(fake.calls.find((c) => c.op === "verification.deleteMany")!.args).toEqual({
      where: { identifier: { startsWith: "staff-active:" }, NOT: { identifier: "staff-active:keep-me" } },
    });
    const audit = fake.calls.find((c) => c.op === "auditLog.create")!.args as { data: { action: string; actorId: string } };
    expect(audit.data).toMatchObject({ action: "sessions.end_all", actorId: "admin-1" });
    expect(fake.events).toEqual([{ type: "all_sessions_ended", userId: "admin-1", meta: { sessions: 7 } }]);
  });

  it("stops before deleting anything when the audit row cannot be written", async () => {
    fake.auditFails = true;
    await expect(endEverySessionExcept("admin-1", "keep-me")).rejects.toMatchObject({ code: "audit_failed" });
    expect(fake.calls.map((c) => c.op)).toEqual(["session.count"]);
    expect(fake.events).toEqual([]);
  });
});

describe("maintenance mode switch", () => {
  it("saves { on, since, by } with its audit row in one transaction, and this server sees it at once", async () => {
    const at = new Date("2026-11-09T03:00:00.000Z");
    const value = await switchMaintenance("admin-1", true, at);
    expect(value).toEqual({ on: true, since: at.toISOString(), by: "admin-1" });
    expect(fake.committed).toEqual(["auditLog.create", "siteSetting.upsert"]);
    const upsert = fake.calls.find((c) => c.op === "siteSetting.upsert")!.args as { where: { key: string }; create: { value: unknown } };
    expect(upsert.where.key).toBe("maintenanceMode");
    expect(upsert.create.value).toEqual(value);
    expect((await maintenanceState({} as NodeJS.ProcessEnv)).on).toBe(true);
    expect(fake.events).toEqual([{ type: "maintenance_mode_changed", userId: "admin-1", meta: { on: true } }]);
    await switchMaintenance("admin-1", false, at);
    expect((await maintenanceState({} as NodeJS.ProcessEnv)).on).toBe(false);
  });

  it("is not switched when the audit row cannot be written", async () => {
    fake.auditFails = true;
    await expect(switchMaintenance("admin-1", true)).rejects.toMatchObject({ code: "audit_failed" });
    expect(fake.calls.some((c) => c.op === "siteSetting.upsert")).toBe(false);
    expect(fake.events).toEqual([]);
  });

  it("MAINTENANCE_MODE at the hosting wins over the stored switch (and an unknown value counts as on)", async () => {
    await switchMaintenance("admin-1", false);
    expect(await maintenanceState({ MAINTENANCE_MODE: "on" } as unknown as NodeJS.ProcessEnv)).toMatchObject({ on: true, source: "env" });
    expect(await maintenanceState({ MAINTENANCE_MODE: "maybe" } as unknown as NodeJS.ProcessEnv)).toMatchObject({ on: true, source: "env" });
    expect(await maintenanceState({ MAINTENANCE_MODE: "off" } as unknown as NodeJS.ProcessEnv)).toMatchObject({ on: false });
  });
});
