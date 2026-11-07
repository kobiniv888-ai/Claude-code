import "dotenv/config";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const calls = vi.hoisted(() => ({ set: [] as [string, boolean][], kinds: [] as string[] }));
vi.mock("@/lib/alerts/unsubscribe-server", () => ({
  setUnsubscribeSwitch: vi.fn(async (userId: string, kind: string, on: boolean) => {
    calls.set.push([userId, on]);
    calls.kinds.push(kind);
    return true;
  }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ ok: true }),
  rateLimitByIp: async () => ({ ok: true }),
}));

const { GET, POST } = await import("./route");
const { unsubscribeToken } = await import("@/lib/alerts/unsubscribe-token");

const url = (token: string) => `https://bayit.example/api/unsubscribe?t=${encodeURIComponent(token)}`;
const oneClick = (token: string) =>
  new NextRequest(url(token), { method: "POST", body: "List-Unsubscribe=One-Click", headers: { "content-type": "application/x-www-form-urlencoded" } });

beforeEach(() => {
  calls.set.length = 0;
  calls.kinds.length = 0;
});

describe("one-click unsubscribe (RFC 8058)", () => {
  it("a valid token's POST switches the weekly email off", async () => {
    const response = await POST(oneClick(unsubscribeToken("user-1", "weekly_stats")));
    expect(response.status).toBe(200);
    expect(calls.set).toEqual([["user-1", false]]);
    expect(calls.kinds).toEqual(["weekly_stats"]);
  });

  it("switches off only the email the link is for (saved searches, price drops)", async () => {
    await POST(oneClick(unsubscribeToken("user-1", "saved_search")));
    await POST(oneClick(unsubscribeToken("user-2", "price_drop")));
    expect(calls.set).toEqual([["user-1", false], ["user-2", false]]);
    expect(calls.kinds).toEqual(["saved_search", "price_drop"]);
  });

  it("a forged token is refused and changes nothing", async () => {
    const good = unsubscribeToken("user-1", "weekly_stats");
    const forged = `${good.slice(0, -4)}0000`;
    expect((await POST(oneClick(forged))).status).toBe(400);
    expect((await POST(oneClick("nonsense"))).status).toBe(400);
    expect(calls.set).toEqual([]);
  });

  it("GET (a mail scanner following the link) changes nothing and opens the page", async () => {
    const token = unsubscribeToken("user-1", "weekly_stats");
    const response = await GET(new NextRequest(url(token)));
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toMatch(/^\/[a-z]{2}\/unsubscribe$/);
    expect(location.searchParams.get("t")).toBe(token);
    expect(calls.set).toEqual([]);
  });
});
