/**
 * Which header getClientIp trusts (src/lib/request.ts; SECURITY_REPORT 12.5.b, 2.2.j, client-ip-trust):
 * CLIENT_IP_HEADER when it is set (Cloudflare's cf-connecting-ip, on Vercel too), else Vercel's
 * own header on Vercel, else the development fallback. A staging or production site off Vercel
 * without CLIENT_IP_HEADER refuses to start (src/lib/startup-check.ts), so the client-controlled
 * fallback never runs there.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => state.headers, cookies: async () => ({ get: () => undefined }) }));

const { getClientIp } = await import("@/lib/request");

const spoofed = { "x-forwarded-for": "6.6.6.6, 10.0.0.1", "x-real-ip": "7.7.7.7" };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getClientIp: one trusted source", () => {
  it("CLIENT_IP_HEADER: only that header, never the visitor's X-Forwarded-For", async () => {
    vi.stubEnv("CLIENT_IP_HEADER", "CF-Connecting-IP");
    vi.stubEnv("VERCEL", "1");
    state.headers = new Headers({ ...spoofed, "cf-connecting-ip": "203.0.113.5", "x-vercel-forwarded-for": "198.51.100.9" });
    expect(await getClientIp()).toBe("203.0.113.5");
    // The trusted header is missing: no IP (the limits then use one shared "unknown" bucket), never a spoofable one.
    state.headers = new Headers(spoofed);
    expect(await getClientIp()).toBeNull();
  });

  it("on Vercel without CLIENT_IP_HEADER: Vercel's own header first", async () => {
    vi.stubEnv("CLIENT_IP_HEADER", "");
    vi.stubEnv("VERCEL", "1");
    state.headers = new Headers({ ...spoofed, "x-vercel-forwarded-for": "198.51.100.9" });
    expect(await getClientIp()).toBe("198.51.100.9");
  });

  it("the development fallback: the first X-Forwarded-For entry, then X-Real-IP; ports and IPv6-mapped forms cleaned", async () => {
    vi.stubEnv("CLIENT_IP_HEADER", "");
    vi.stubEnv("VERCEL", "");
    state.headers = new Headers({ "x-forwarded-for": "::ffff:192.0.2.1, 10.0.0.1" });
    expect(await getClientIp()).toBe("192.0.2.1");
    state.headers = new Headers({ "x-real-ip": "192.0.2.7:4431" });
    expect(await getClientIp()).toBe("192.0.2.7");
    state.headers = new Headers({ "x-forwarded-for": "not an ip" });
    expect(await getClientIp()).toBeNull();
  });
});
