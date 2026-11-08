/**
 * Hardening A3: one person cannot fill the site-wide address-search queue. The per-user and per-IP
 * windows stay well under the upstream budget (~54/min), and each person may have at most two
 * searches waiting for the shared slot.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pending: [] as (() => void)[],
  limits: [] as { key: string; limit: number; windowSeconds: number }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUserForAction: async () => ({ id: "owner-1" }) }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async (key: string, options: { limit: number; windowSeconds: number }) => {
    state.limits.push({ key, ...options });
    return { ok: true, remaining: 1, resetAt: new Date() };
  },
  rateLimitByIp: async (prefix: string, options: { limit: number; windowSeconds: number }) => {
    state.limits.push({ key: `${prefix}:ip`, ...options });
    return { ok: true, remaining: 1, resetAt: new Date() };
  },
  rateLimitHeaders: () => ({}),
}));
vi.mock("@/lib/geocode", async () => {
  const core = await import("@/lib/geocode/core");
  return {
    OSM_ATTRIBUTION: "OSM",
    QueueFullError: core.QueueFullError,
    GeocodeUnavailableError: class extends Error {},
    geocodeAddress: () => new Promise((resolve) => state.pending.push(() => resolve([]))),
  };
});

const { GET } = await import("./route");

function request(q: string) {
  const url = new URL(`http://localhost/api/geocode?q=${encodeURIComponent(q)}&locale=he`);
  return GET({ nextUrl: url } as Parameters<typeof GET>[0]);
}

describe("GET /api/geocode", () => {
  beforeEach(() => {
    state.pending.length = 0;
    state.limits.length = 0;
  });

  it("keeps each requester well under the upstream budget (~54 a minute)", async () => {
    const first = request("Chavchavadze 12");
    await vi.waitFor(() => expect(state.pending).toHaveLength(1));
    for (const { key, limit, windowSeconds } of state.limits) {
      expect(limit * (60 / windowSeconds), key).toBeLessThanOrEqual(15);
    }
    state.pending.forEach((resolve) => resolve());
    expect((await first).status).toBe(200);
  });

  it("refuses a third search while two of the same person's searches are still waiting", async () => {
    const a = request("Rustaveli 1");
    const b = request("Rustaveli 2");
    await vi.waitFor(() => expect(state.pending).toHaveLength(2));
    const third = await request("Rustaveli 3");
    expect(third.status).toBe(429);
    expect(await third.json()).toEqual({ error: "rate_limited" });

    state.pending.forEach((resolve) => resolve());
    expect((await a).status).toBe(200);
    expect((await b).status).toBe(200);

    // The slots are given back once the searches finish.
    const next = request("Rustaveli 4");
    await vi.waitFor(() => expect(state.pending).toHaveLength(3));
    state.pending[2]();
    expect((await next).status).toBe(200);
  });
});
