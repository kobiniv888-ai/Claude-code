/**
 * logOut (./logout.ts), round 3 phase 5 hardening (lists-alerts-3): places saved on the device
 * while signed out go into the account BEFORE the device's private data (with that copy) is
 * cleared, and a slow merge never holds the logout up for long.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const device = vi.hoisted(() => ({ raw: null as string | null, merge: null as null | (() => Promise<string>) }));

vi.mock("@/lib/lists/device-store", () => ({ readDeviceRaw: () => device.raw }));
vi.mock("@/lib/lists/merge-client", () => ({
  mergeDeviceListsIntoAccount: vi.fn(async () => {
    calls.push("merge");
    return device.merge ? device.merge() : "merged";
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
    expect(calls).toEqual(["merge", "signOut", "clear", "caches", "flag", "go:/he"]);
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
