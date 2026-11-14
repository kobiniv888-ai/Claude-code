/**
 * logOut (./logout.ts): round 3 phase 5 hardening (lists-alerts-3) — places saved on the device
 * while signed out go into the account BEFORE the device's private data (with that copy) is
 * cleared, and a slow merge never holds the logout up for long — and SECURITY_REPORT 3.5.d: the
 * session ends on the SERVER first (logOutHere / logOutEverywhere); when that fails nothing is
 * cleared and the page stays, so nobody believes a session is over that still works.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const device = vi.hoisted(() => ({ raw: null as string | null, merge: null as null | (() => Promise<string>) }));
const server = vi.hoisted(() => ({ result: { ok: true } as { ok: boolean; error?: string } }));

vi.mock("@/lib/lists/device-store", () => ({ readDeviceRaw: () => device.raw }));
vi.mock("@/lib/lists/merge-client", () => ({
  mergeDeviceListsIntoAccount: vi.fn(async () => {
    calls.push("merge");
    return device.merge ? device.merge() : "merged";
  }),
}));
vi.mock("./logout-actions", () => ({
  logOutHere: vi.fn(async () => {
    calls.push("server:here");
    return server.result;
  }),
  logOutEverywhere: vi.fn(async () => {
    calls.push("server:everywhere");
    return server.result.ok ? { ok: true, data: { sessions: 2 } } : server.result;
  }),
}));
vi.mock("./client", () => ({
  signOut: vi.fn(async () => {
    calls.push("signOut");
    return {};
  }),
}));
vi.mock("./device-data", () => ({
  clearPrivateDeviceData: () => calls.push("clear"),
  clearPrivateCaches: async () => {
    calls.push("caches");
  },
  markLoggedOut: () => calls.push("flag"),
}));

const { logOut } = await import("./logout");

beforeEach(() => {
  calls.length = 0;
  device.raw = null;
  device.merge = null;
  server.result = { ok: true };
  vi.stubGlobal("window", { location: { assign: (href: string) => calls.push(`go:${href}`) } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("logOut and the device's saved lists", () => {
  it("merges them into the account before the device copy is cleared", async () => {
    device.raw = JSON.stringify({ lists: [], items: [{ listingId: "l1", listKey: "default", savedAt: 1 }], defaultUsedAt: null });
    expect(await logOut({ homeHref: "/he" })).toEqual({ ok: true });
    expect(calls).toEqual(["merge", "server:here", "signOut", "clear", "caches", "flag", "go:/he"]);
  });

  it("does not load the merge when nothing is saved on the device", async () => {
    await logOut({ homeHref: "/he" });
    expect(calls).not.toContain("merge");
  });

  it("waits at most 1.5 s for a slow merge", async () => {
    vi.useFakeTimers();
    device.raw = "{}";
    device.merge = () => new Promise(() => {}); // never answers
    const done = logOut({ homeHref: "/en" });
    await vi.advanceTimersByTimeAsync(1600);
    expect(await done).toEqual({ ok: true });
    expect(calls.indexOf("merge")).toBeLessThan(calls.indexOf("clear"));
  });
});

describe("logOut ends the session on the server first (SECURITY_REPORT 3.5.d)", () => {
  it("stays signed in, clears nothing and does not leave the page when the server could not end the session", async () => {
    server.result = { ok: false, error: "logout_failed" };
    expect(await logOut({ homeHref: "/he" })).toEqual({ ok: false, error: "logout_failed" });
    expect(calls).toEqual(["server:here"]);
  });

  it("everywhere: ends every session on the server, then this browser", async () => {
    expect(await logOut({ homeHref: "/he", everywhere: true, keepLists: false })).toEqual({ ok: true });
    expect(calls).toEqual(["server:everywhere", "signOut", "clear", "caches", "flag", "go:/he"]);
  });

  it("reports a network failure without clearing anything", async () => {
    const actions = await import("./logout-actions");
    vi.mocked(actions.logOutHere).mockRejectedValueOnce(new Error("offline"));
    expect(await logOut({ homeHref: "/he", keepLists: false })).toEqual({ ok: false, error: "network" });
    expect(calls).toEqual([]);
  });
});
