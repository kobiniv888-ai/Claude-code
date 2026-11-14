/**
 * Turnstile FAILS CLOSED (SECURITY_REPORT 3.2.b, 3.8.a; checklist rule 0.4): a missing key outside
 * development, a Cloudflare error, a wrong action or hostname, and Cloudflare's test keys on the real
 * site are all refused.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/request", () => ({ getClientIp: async () => null }));

const { acceptSiteVerify, turnstileHostnames, verifyTurnstile } = await import("./turnstile");

const SITE = { NEXT_PUBLIC_SITE_URL: "https://bayit.example", BETTER_AUTH_URL: "https://bayit.example" };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function siteverify(answer: unknown, status = 200) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(answer), { status, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("verifyTurnstile without a secret key", () => {
  it("fails closed on the real site and on staging (SITE_ENV production, staging or missing)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    for (const site of ["production", "staging", ""]) {
      vi.stubEnv("SITE_ENV", site);
      await expect(verifyTurnstile("dev"), site || "(missing)").resolves.toBe(false);
    }
  });

  it("is skipped only on a development site", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("SITE_ENV", "development");
    await expect(verifyTurnstile("dev")).resolves.toBe(true);
  });
});

describe("verifyTurnstile with a secret key", () => {
  it("refuses when Cloudflare cannot be reached or answers an error (fail closed)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("TURNSTILE_SECRET_KEY", "0x4AAAAAAA-real-secret");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("timeout"))));
    await expect(verifyTurnstile("token", { expectedAction: "login" })).resolves.toBe(false);
    siteverify({ success: true, action: "login" }, 500);
    await expect(verifyTurnstile("token", { expectedAction: "login" })).resolves.toBe(false);
  });

  it("refuses a missing or oversized token without asking Cloudflare", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "0x4AAAAAAA-real-secret");
    const fetch = siteverify({ success: true });
    await expect(verifyTurnstile(null)).resolves.toBe(false);
    await expect(verifyTurnstile("x".repeat(2049))).resolves.toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("checks the action and the site's hostname", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "0x4AAAAAAA-real-secret");
    vi.stubEnv("SITE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE.NEXT_PUBLIC_SITE_URL);
    vi.stubEnv("BETTER_AUTH_URL", SITE.BETTER_AUTH_URL);
    siteverify({ success: true, action: "login", hostname: "bayit.example" });
    await expect(verifyTurnstile("token", { expectedAction: "login" })).resolves.toBe(true);
    siteverify({ success: true, action: "report", hostname: "bayit.example" });
    await expect(verifyTurnstile("token", { expectedAction: "login" })).resolves.toBe(false);
    siteverify({ success: true, action: "login", hostname: "evil.example" });
    await expect(verifyTurnstile("token", { expectedAction: "login" })).resolves.toBe(false);
    siteverify({ success: false, "error-codes": ["invalid-input-response"] });
    await expect(verifyTurnstile("token", { expectedAction: "login" })).resolves.toBe(false);
  });
});

describe("acceptSiteVerify (pure)", () => {
  const prod = { SITE_ENV: "production", ...SITE };

  it("a token without an action is refused when one is expected", () => {
    expect(acceptSiteVerify({ success: true, hostname: "bayit.example" }, { expectedAction: "login" }, prod)).toBe(false);
  });

  it("Cloudflare's test keys pass on development and staging, never on the real site", () => {
    const testing = { success: true, hostname: "example.com", metadata: { result_with_testing_key: true } };
    expect(acceptSiteVerify(testing, { expectedAction: "login" }, prod)).toBe(false);
    expect(acceptSiteVerify(testing, { expectedAction: "login" }, { SITE_ENV: "staging", ...SITE })).toBe(true);
    expect(acceptSiteVerify(testing, { expectedAction: "login" }, { SITE_ENV: "development" })).toBe(true);
    expect(acceptSiteVerify(testing, {}, {})).toBe(false);
  });

  it("the hostname is checked outside development only", () => {
    expect(turnstileHostnames({ SITE_ENV: "development" })).toBeNull();
    expect(turnstileHostnames(prod)).toEqual(["bayit.example"]);
    expect(acceptSiteVerify({ success: true, action: "login", hostname: "localhost" }, { expectedAction: "login" }, { SITE_ENV: "development" })).toBe(true);
    // Staging/production with no site address configured: nothing matches (fail closed).
    expect(acceptSiteVerify({ success: true, action: "login", hostname: "bayit.example" }, { expectedAction: "login" }, { SITE_ENV: "production" })).toBe(false);
  });
});
