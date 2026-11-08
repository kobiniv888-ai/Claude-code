/**
 * POST /api/csp-report (SECURITY_REPORT 10.2.c): a browser's violation report becomes a
 * "csp_report" security event with only short, non-personal values; the endpoint is rate-limited
 * per IP and site-wide, fails closed when the limit store breaks, and refuses big or odd bodies.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  events: [] as { type: string; meta?: Record<string, unknown> | null }[],
  perIp: { ok: true, failed: false },
  siteWide: { ok: true, failed: false },
  keys: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimitByIp: async (prefix: string) => {
    state.keys.push(`ip:${prefix}`);
    return { ...state.perIp, remaining: 0, resetAt: new Date() };
  },
  rateLimit: async (key: string) => {
    state.keys.push(key);
    return { ...state.siteWide, remaining: 0, resetAt: new Date() };
  },
}));
vi.mock("@/lib/security/events", () => ({
  recordSecurityEvent: async (event: { type: string; meta?: Record<string, unknown> | null }) => {
    state.events.push(event);
    return true;
  },
}));

const { POST } = await import("./route");

const REPORT = {
  "csp-report": {
    "document-uri": "https://bayit.example/he/account/trips/BT-12345?token=abc",
    "effective-directive": "img-src",
    "blocked-uri": "https://tracker.example/p.gif?email=someone%40example.com",
    disposition: "report",
  },
};

function post(body: string, type = "application/csp-report", headers: Record<string, string> = {}) {
  return POST(new Request("http://localhost/api/csp-report", { method: "POST", body, headers: { "content-type": type, ...headers } }));
}

describe("POST /api/csp-report", () => {
  beforeEach(() => {
    state.events = [];
    state.keys = [];
    state.perIp = { ok: true, failed: false };
    state.siteWide = { ok: true, failed: false };
  });

  it("records a csp_report event with the directive, the blocked origin and the page path only", async () => {
    const res = await post(JSON.stringify(REPORT));
    expect(res.status).toBe(204);
    expect(state.events).toEqual([
      { type: "csp_report", meta: { directive: "img-src", blocked: "https://tracker.example", page: "/he/account/trips/:id", disposition: "report" } },
    ]);
    expect(JSON.stringify(state.events)).not.toMatch(/example\.com|token|abc|12345/);
    expect(state.keys).toEqual(["ip:csp-report", "csp-report:all"]);
  });

  it("reads Reporting API batches", async () => {
    const batch = [{ type: "csp-violation", body: { documentURL: "https://bayit.example/he", effectiveDirective: "media-src", blockedURL: "https://cdn.example/v.mp4" } }];
    const res = await post(JSON.stringify(batch), "application/reports+json");
    expect(res.status).toBe(204);
    expect(state.events[0]?.meta).toMatchObject({ directive: "media-src", blocked: "https://cdn.example", page: "/he" });
  });

  it("writes nothing over the per-IP or the site-wide limit, or when the limit store fails (fail closed)", async () => {
    state.perIp = { ok: false, failed: false };
    expect((await post(JSON.stringify(REPORT))).status).toBe(429);
    state.perIp = { ok: true, failed: false };
    state.siteWide = { ok: false, failed: false };
    expect((await post(JSON.stringify(REPORT))).status).toBe(429);
    state.siteWide = { ok: false, failed: true };
    expect((await post(JSON.stringify(REPORT))).status).toBe(429);
    expect(state.events).toEqual([]);
  });

  it("refuses other content types, bodies over 16 KB and broken JSON", async () => {
    expect((await post(JSON.stringify(REPORT), "text/plain")).status).toBe(415);
    expect((await post("x".repeat(17 * 1024))).status).toBe(413);
    expect((await post("{}", "application/csp-report", { "content-length": String(1024 * 1024) })).status).toBe(413);
    expect((await post("{not json")).status).toBe(400);
    expect(state.events).toEqual([]);
  });
});
