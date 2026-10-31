/**
 * Runs against the local database (DATABASE_URL in .env). Uses unique keys and removes them afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/request", () => ({ getIpHash: async () => "test-ip-hash" }));

const { assertRateLimit, rateLimit, rateLimitByIp, resetRateLimit } = await import("./rate-limit");
const { db } = await import("@/lib/db");
const { RateLimitError } = await import("@/lib/errors");

const prefix = `vitest:${randomUUID()}`;
const key = (name: string) => `${prefix}:${name}`;

afterAll(async () => {
  await db.rateLimit.deleteMany({ where: { key: { startsWith: prefix } } });
  await db.$disconnect();
});

describe("rateLimit (fixed window, Postgres)", () => {
  it("allows up to the limit, then blocks", async () => {
    const opts = { limit: 3, windowSeconds: 60 };
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await rateLimit(key("basic"), opts));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0, 0]);
    const resetIn = results[0].resetAt.getTime() - Date.now();
    expect(resetIn).toBeGreaterThan(55_000);
    expect(resetIn).toBeLessThanOrEqual(60_000);
    // The window does not move while it is open.
    expect(results[4].resetAt.getTime()).toBe(results[0].resetAt.getTime());
  });

  it("is atomic under concurrent hits", async () => {
    const opts = { limit: 10, windowSeconds: 60 };
    const results = await Promise.all(Array.from({ length: 25 }, () => rateLimit(key("concurrent"), opts)));
    expect(results.filter((r) => r.ok)).toHaveLength(10);
    const row = await db.rateLimit.findUnique({ where: { key: key("concurrent") } });
    expect(row?.count).toBe(25);
  });

  it("starts a new window after the old one ends", async () => {
    const opts = { limit: 1, windowSeconds: 1 };
    expect((await rateLimit(key("window"), opts)).ok).toBe(true);
    expect((await rateLimit(key("window"), opts)).ok).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect((await rateLimit(key("window"), opts)).ok).toBe(true);
  });

  it("assertRateLimit throws RateLimitError with the reset time", async () => {
    const opts = { limit: 1, windowSeconds: 30 };
    await assertRateLimit(key("assert"), opts);
    const error = await assertRateLimit(key("assert"), opts).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as InstanceType<typeof RateLimitError>).retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resetRateLimit clears a key", async () => {
    const opts = { limit: 1, windowSeconds: 60 };
    await rateLimit(key("reset"), opts);
    expect((await rateLimit(key("reset"), opts)).ok).toBe(false);
    await resetRateLimit(key("reset"));
    expect((await rateLimit(key("reset"), opts)).ok).toBe(true);
  });

  it("rateLimitByIp keys by the hashed IP", async () => {
    await rateLimitByIp(key("ip"), { limit: 5, windowSeconds: 60 });
    const row = await db.rateLimit.findUnique({ where: { key: `${key("ip")}:ip:test-ip-hash` } });
    expect(row?.count).toBe(1);
  });

  it("rejects bad options", async () => {
    await expect(rateLimit(key("bad"), { limit: 0, windowSeconds: 60 })).rejects.toThrow();
    await expect(rateLimit(" ", { limit: 1, windowSeconds: 60 })).rejects.toThrow();
  });
});
