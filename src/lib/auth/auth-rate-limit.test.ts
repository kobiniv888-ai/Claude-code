/**
 * Better Auth's limiter in our Postgres store (SECURITY_REPORT 12.5.b): the auth instance uses our
 * storage (not per-instance memory), it refuses when the store fails (fail closed), and it keeps
 * the client IP only hashed.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ keys: [] as string[], result: null as null | { ok: boolean; failed?: boolean; resetAt: Date } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async (key: string) => {
    state.keys.push(key);
    return { remaining: 0, ...state.result! };
  },
}));

const { authIpAddressHeaders, betterAuthRateLimitStorage } = await import("./auth-rate-limit");

beforeEach(() => {
  state.keys = [];
  state.result = { ok: true, resetAt: new Date(Date.now() + 10_000) };
});

describe("Better Auth's rate limit storage", () => {
  it("allows within the limit, keyed by a hash (never the IP itself)", async () => {
    expect(await betterAuthRateLimitStorage.consume("203.0.113.7/sign-in/social", { window: 10, max: 3 })).toEqual({ allowed: true, retryAfter: null });
    expect(state.keys[0]).toMatch(/^ba:[0-9a-f]{64}$/);
    expect(state.keys[0]).not.toContain("203.0.113.7");
  });

  it("refuses over the limit with the seconds to wait", async () => {
    state.result = { ok: false, resetAt: new Date(Date.now() + 7_000) };
    const answer = await betterAuthRateLimitStorage.consume("k", { window: 10, max: 3 });
    expect(answer.allowed).toBe(false);
    expect(answer.retryAfter).toBeGreaterThanOrEqual(6);
  });

  it("refuses when the store cannot be checked (fail closed)", async () => {
    state.result = { ok: false, failed: true, resetAt: new Date(Date.now() + 30_000) };
    expect((await betterAuthRateLimitStorage.consume("k", { window: 10, max: 3 })).allowed).toBe(false);
  });

  it("the auth instance is configured with it (not the per-instance memory store)", () => {
    const source = readFileSync(path.join(__dirname, "server.ts"), "utf8");
    expect(source).toMatch(/customStorage:\s*betterAuthRateLimitStorage/);
    expect(source).toMatch(/ipAddressHeaders:\s*authIpAddressHeaders\(process\.env\)/);
  });

  it("reads the client IP from the same headers as getClientIp", () => {
    expect(authIpAddressHeaders({ CLIENT_IP_HEADER: "CF-Connecting-IP" })).toEqual(["cf-connecting-ip"]);
    expect(authIpAddressHeaders({ VERCEL: "1" })).toEqual(["x-vercel-forwarded-for", "x-forwarded-for"]);
    expect(authIpAddressHeaders({})).toEqual(["x-forwarded-for"]);
  });
});
