/**
 * The staff session (SECURITY_REPORT 3.5.a/c): the Strict staff cookie lives as long as the session
 * (not a fixed 12 hours), and the 12 IDLE hours are the server-side marker's job — an admin active
 * every hour still passes after 12 h + 1 min, one idle for 12 hours is asked for the code again.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cookieSets: [] as { name: string; value: string; opts: Record<string, unknown> }[],
  marker: null as null | { id: string; expiresAt: Date },
  sessionExpiresAt: null as Date | null,
  cleared: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: (name: string, value: string, opts: Record<string, unknown>) => void state.cookieSets.push({ name, value, opts }),
  }),
}));
vi.mock("@/lib/security/events", () => ({ recordSecurityEvent: async () => true }));
vi.mock("@/lib/db", () => ({
  db: {
    session: {
      findUnique: async () => (state.sessionExpiresAt ? { expiresAt: state.sessionExpiresAt } : null),
      updateMany: async () => {
        state.cleared++;
        return { count: 1 };
      },
    },
    verification: {
      findFirst: async () => state.marker,
      update: async ({ data }: { data: { expiresAt: Date } }) => {
        state.marker = { id: "m1", expiresAt: data.expiresAt };
        return state.marker;
      },
      deleteMany: async () => {
        state.marker = null;
        return { count: 1 };
      },
      create: async ({ data }: { data: { expiresAt: Date } }) => {
        state.marker = { id: "m1", expiresAt: data.expiresAt };
        return state.marker;
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

const { checkStaffSessionIdle, issueStaffCookie, markStaffSessionActive } = await import("./staff-session");
const HOUR = 3600_000;

beforeEach(() => {
  state.cookieSets = [];
  state.marker = null;
  state.cleared = 0;
});

describe("the staff cookie", () => {
  it("lives as long as the session (at most 30 days), not 12 hours", async () => {
    const now = new Date("2026-11-08T10:00:00Z");
    state.sessionExpiresAt = new Date(now.getTime() + 20 * 24 * HOUR);
    await issueStaffCookie("s1", now);
    expect(state.cookieSets[0]?.opts).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/", maxAge: 20 * 24 * 3600 });
    state.sessionExpiresAt = new Date(now.getTime() + 90 * 24 * HOUR);
    await issueStaffCookie("s1", now);
    expect(state.cookieSets[1]?.opts.maxAge).toBe(30 * 24 * 3600);
  });
});

describe("12 idle hours (the server-side marker)", () => {
  it("an admin active every hour still passes at 12 h + 1 min; the cookie is never touched by the check", async () => {
    const start = new Date("2026-11-08T08:00:00Z");
    await markStaffSessionActive("s1", start);
    for (let h = 1; h <= 12; h++) {
      expect(await checkStaffSessionIdle({ userId: "u1", sessionId: "s1" }, new Date(start.getTime() + h * HOUR))).toBe("active");
    }
    expect(await checkStaffSessionIdle({ userId: "u1", sessionId: "s1" }, new Date(start.getTime() + 12 * HOUR + 60_000))).toBe("active");
    expect(state.cookieSets).toEqual([]);
    expect(state.cleared).toBe(0);
  });

  it("an admin idle for 12 hours is asked for the code again", async () => {
    const start = new Date("2026-11-08T08:00:00Z");
    await markStaffSessionActive("s1", start);
    expect(await checkStaffSessionIdle({ userId: "u1", sessionId: "s1" }, new Date(start.getTime() + 12 * HOUR + 60_000))).toBe("idle");
    expect(state.cleared).toBe(1);
  });
});
