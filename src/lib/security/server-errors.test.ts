/**
 * Server errors as security events for the error-spike alert (SECURITY_REPORT 16.3,
 * ops-alerts-1): recorded with the kind only, capped per server instance, never throwing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const recorded = vi.hoisted(() => ({ calls: [] as unknown[], fail: false }));
vi.mock("./events", () => ({
  recordSecurityEvent: async (input: unknown) => {
    if (recorded.fail) throw new Error("db down");
    recorded.calls.push(input);
    return true;
  },
}));

beforeEach(() => {
  recorded.calls = [];
  recorded.fail = false;
  vi.resetModules();
});

describe("recordServerError", () => {
  it("records the kind and the job, nothing else", async () => {
    const { recordServerError } = await import("./server-errors");
    await recordServerError("cron", "cleanup");
    expect(recorded.calls).toEqual([{ type: "server_error", ip: null, meta: { kind: "cron", job: "cleanup" } }]);
  });

  it("stops at the hourly cap per server, and starts again the next hour", async () => {
    const { takeServerErrorSlot, SERVER_ERROR_EVENTS_PER_HOUR } = await import("./server-errors");
    const t0 = 10_000_000;
    for (let i = 0; i < SERVER_ERROR_EVENTS_PER_HOUR; i++) expect(takeServerErrorSlot(t0 + i)).toBe(true);
    expect(takeServerErrorSlot(t0 + 5000)).toBe(false);
    expect(takeServerErrorSlot(t0 + 3600_000)).toBe(true);
  });

  it("never throws", async () => {
    recorded.fail = true;
    const { recordServerError } = await import("./server-errors");
    await expect(recordServerError("render")).resolves.toBeUndefined();
  });
});
