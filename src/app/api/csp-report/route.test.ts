/**
 * POST /api/csp-report (SECURITY_REPORT 10.2.c): a browser's violation report becomes a
 * "csp_report" security event with only short, non-personal values; the endpoint is rate-limited
 * per IP, writes each kind of violation once an hour (repeats never use the site-wide cap), caps NEW
 * kinds site-wide with one "csp_report_capped" event per hour, fails closed when the limit store
 * breaks, and refuses big or odd bodies.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  events: [] as { type: string; meta?: Record<string, unknown> | null }[],
  /** An in-memory fixed-window store with the real rateLimit's answers (ok / failed / failOpen). */
  counts: new Map<string, number>(),
  perIpOk: true,
  storeBroken: false,
  keys: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limit", () => {
  const hit = (key: string, limit: number, failOpen = false) => {
    state.keys.push(key);
    if (state.storeBroken) return { ok: failOpen, failed: true, remaining: 0, resetAt: new Date() };
    const count = (state.counts.get(key) ?? 0) + 1;
    state.counts.set(key, count);
    return { ok: count <= limit, remaining: Math.max(0, limit - count), resetAt: new Date() };
  };
  return {
    rateLimitByIp: async (prefix: string) => {
      state.keys.push(`ip:${prefix}`);
      return { ok: state.perIpOk, remaining: 0, resetAt: new Date() };
    },
    rateLimit: async (key: string, opts: { limit: number; failOpen?: boolean }) => hit(key, opts.limit, opts.failOpen),
    resetRateLimit: async (key: string) => {
      state.counts.delete(key);
    },
  };
});
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

function report(blocked: string, page = "https://bayit.example/he") {
  return JSON.stringify({ "csp-report": { "document-uri": page, "effective-directive": "img-src", "blocked-uri": blocked, disposition: "report" } });
}

function post(body: string, type = "application/csp-report", headers: Record<string, string> = {}) {
  return POST(new Request("http://localhost/api/csp-report", { method: "POST", body, headers: { "content-type": type, ...headers } }));
}

const cspEvents = () => state.events.filter((e) => e.type === "csp_report");

describe("POST /api/csp-report", () => {
  beforeEach(() => {
    state.events = [];
    state.keys = [];
    state.counts = new Map();
    state.perIpOk = true;
    state.storeBroken = false;
  });

  it("records a csp_report event with the directive, the blocked origin and the page path only", async () => {
    const res = await post(JSON.stringify(REPORT));
    expect(res.status).toBe(204);
    expect(state.events).toEqual([
      { type: "csp_report", meta: { directive: "img-src", blocked: "https://tracker.example", page: "/he/account/trips/:id", disposition: "report" } },
    ]);
    expect(JSON.stringify(state.events)).not.toMatch(/example\.com|token|abc|12345/);
    expect(state.keys[0]).toBe("ip:csp-report");
    expect(state.keys).toContain("csp-report:all");
    // The signature key holds a hash only (no page, origin or query).
    const signature = state.keys.find((k) => k.startsWith("csp-report:sig:"))!;
    expect(signature).toMatch(/^csp-report:sig:[0-9a-f]{32}$/);
  });

  it("reads Reporting API batches", async () => {
    const batch = [{ type: "csp-violation", body: { documentURL: "https://bayit.example/he", effectiveDirective: "media-src", blockedURL: "https://cdn.example/v.mp4" } }];
    const res = await post(JSON.stringify(batch), "application/reports+json");
    expect(res.status).toBe(204);
    expect(state.events[0]?.meta).toMatchObject({ directive: "media-src", blocked: "https://cdn.example", page: "/he" });
  });

  // csp-report-cap-1: one client (or one recurring violation) must not blind the trial.
  it("writes a repeated kind once an hour, and 600 repeats leave the site-wide cap untouched for a new kind", async () => {
    for (let i = 0; i < 600; i++) expect((await post(report("https://same.example/x.png"))).status).toBe(204);
    expect(cspEvents()).toHaveLength(1);
    expect(state.counts.get("csp-report:all")).toBe(1);
    expect((await post(report("https://new.example/y.png"))).status).toBe(204);
    expect(cspEvents().map((e) => e.meta?.blocked)).toEqual(["https://same.example", "https://new.example"]);
  });

  it("caps new kinds site-wide and writes exactly one csp_report_capped event in that hour", async () => {
    for (let i = 0; i < 600; i++) expect((await post(report(`https://k${i}.example/x.png`))).status, `kind ${i}`).toBe(204);
    expect(cspEvents()).toHaveLength(600);
    for (let i = 0; i < 25; i++) expect((await post(report(`https://over${i}.example/x.png`))).status).toBe(429);
    expect(cspEvents()).toHaveLength(600);
    expect(state.events.filter((e) => e.type === "csp_report_capped")).toEqual([{ type: "csp_report_capped", meta: { limit: 600 } }]);
    // A refused kind is not remembered as written: it is written once the cap has room again.
    state.counts.delete("csp-report:all");
    expect((await post(report("https://over3.example/x.png"))).status).toBe(204);
    expect(cspEvents().at(-1)?.meta?.blocked).toBe("https://over3.example");
  });

  it("writes nothing over the per-IP limit, or when the signature / cap store fails (fail closed)", async () => {
    state.perIpOk = false;
    expect((await post(JSON.stringify(REPORT))).status).toBe(429);
    expect(state.keys).toEqual(["ip:csp-report"]);
    state.perIpOk = true;
    // The per-IP check passes, then the store breaks: the "first this hour?" marker answers
    // failed (it never fails open) and nothing is written.
    state.storeBroken = true;
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
