/**
 * Rate limits fail CLOSED when their store breaks (SECURITY_REPORT 12.5.b, L6, C13): a limited
 * action is refused, unless the caller opted into `failOpen` for a harmless counter.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/request", () => ({ getIpHash: async () => "test-ip-hash" }));
const queryRaw = vi.fn();
vi.mock("@/lib/db", () => ({ db: { $queryRaw: queryRaw, rateLimit: { deleteMany: vi.fn(async () => ({ count: 0 })) } } }));

const { STORE_ERROR_RETRY_SECONDS, assertRateLimit, assertRateLimitByIp, rateLimit, rateLimitByIp } = await import("./rate-limit");
const { RateLimitError } = await import("@/lib/errors");

const OPTS = { limit: 5, windowSeconds: 60 };

describe("rate limits when the store fails", () => {
  afterEach(() => {
    queryRaw.mockReset();
    vi.restoreAllMocks();
  });

  function breakStore() {
    vi.spyOn(console, "error").mockImplementation(() => {});
    queryRaw.mockRejectedValue(new Error("connection refused"));
  }

  it("refuses by default (fail closed) and says the store failed", async () => {
    breakStore();
    const result = await rateLimit("auth:otp-send:phone:x", OPTS);
    expect(result).toMatchObject({ ok: false, remaining: 0, failed: true });
    const wait = result.resetAt.getTime() - Date.now();
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(STORE_ERROR_RETRY_SECONDS * 1000);
    expect((await rateLimitByIp("auth:otp-send", OPTS)).ok).toBe(false);
  });

  it("assertRateLimit and assertRateLimitByIp throw RateLimitError (the action never runs)", async () => {
    breakStore();
    const action = vi.fn();
    await expect(assertRateLimit("booking:create:x", OPTS).then(action)).rejects.toBeInstanceOf(RateLimitError);
    await expect(assertRateLimitByIp("booking:create", OPTS).then(action)).rejects.toBeInstanceOf(RateLimitError);
    expect(action).not.toHaveBeenCalled();
  });

  it("failOpen: true lets a harmless counter through, marked as failed", async () => {
    breakStore();
    await expect(rateLimit("alert:host-unreachable:x", { ...OPTS, failOpen: true })).resolves.toMatchObject({ ok: true, failed: true });
  });

  it("a working store answers normally (no `failed`)", async () => {
    queryRaw.mockResolvedValue([{ count: 6, resetAt: new Date(Date.now() + 60_000) }]);
    const result = await rateLimit("x", OPTS);
    expect(result.ok).toBe(false);
    expect(result.failed).toBeUndefined();
    queryRaw.mockResolvedValue([{ count: 1, resetAt: new Date(Date.now() + 60_000) }]);
    await expect(rateLimit("x", OPTS)).resolves.toMatchObject({ ok: true, remaining: 4 });
  });
});
