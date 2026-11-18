/**
 * Sentry wiring (SECURITY_REPORT 16.1; founder's decision 6): no default personal data (no user,
 * no IP, no headers, cookies, query or body), environment = SITE_ENV, release = the commit, the
 * EU region check, and the scrubbing of messages through src/lib/log-scrub.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { SEND_DEFAULT_PII, buildEnvelope, eventOptions, reportError } from "./monitoring";
import { sentryDsnInfo } from "./sentry-dsn";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const eventOf = (body: string) => JSON.parse(body.split("\n")[2]!) as Record<string, unknown>;

describe("Sentry events carry no personal data", () => {
  it("has no user, IP, headers, cookies, query string or body; only the method and the path", () => {
    expect(SEND_DEFAULT_PII).toBe(false);
    const event = eventOf(
      buildEnvelope(new Error("boom for guest@example.com +995 555 12 34 56"), {
        kind: "route",
        route: "/api/x",
        path: "/api/x?token=abc&phone=995555123456#frag",
        method: "POST",
        tags: { job: "x" },
      }),
    );
    expect(event.user).toBeUndefined();
    expect(event.contexts).toBeUndefined();
    const request = event.request as Record<string, unknown>;
    expect(Object.keys(request).sort()).toEqual(["method", "url"]);
    expect(request.url).toBe("/api/x");
    const serialized = JSON.stringify(event);
    for (const secret of ["guest@example.com", "555 12 34 56", "token=abc", "cookie", "authorization", "ip_address"]) {
      expect(serialized.toLowerCase()).not.toContain(secret.toLowerCase());
    }
  });

  it("environment is SITE_ENV and release the deployed commit", () => {
    expect(eventOptions({ SITE_ENV: "production", VERCEL_GIT_COMMIT_SHA: "abc123", NODE_ENV: "production", VERCEL_ENV: "preview" })).toEqual({
      environment: "production",
      release: "abc123",
    });
    expect(eventOptions({ SITE_ENV: "staging", SENTRY_RELEASE: "v1", VERCEL_GIT_COMMIT_SHA: "abc" })).toEqual({ environment: "staging", release: "v1" });
    expect(eventOptions({})).toEqual({ environment: "unknown" });
    const event = eventOf(buildEnvelope(new Error("x"), { kind: "cron" }, eventOptions({ SITE_ENV: "staging", VERCEL_GIT_COMMIT_SHA: "c0ffee" })));
    expect(event).toMatchObject({ environment: "staging", release: "c0ffee" });
  });

  it("reportError sends SITE_ENV as the environment", async () => {
    vi.stubEnv("SENTRY_DSN", "https://pub@o1.ingest.de.sentry.io/7");
    vi.stubEnv("SITE_ENV", "production");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await reportError(new Error("x"), { kind: "action" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://o1.ingest.de.sentry.io/api/7/envelope/");
    expect(eventOf(init.body as string).environment).toBe("production");
  });
});

describe("the EU region check", () => {
  it("recognises Sentry's EU ingest hosts and flags others", () => {
    expect(sentryDsnInfo("https://k@o12.ingest.de.sentry.io/34")).toEqual({ ok: true, eu: true, host: "o12.ingest.de.sentry.io" });
    expect(sentryDsnInfo("https://k@o12.ingest.us.sentry.io/34").eu).toBe(false);
    expect(sentryDsnInfo("https://k@o12.ingest.sentry.io/34").eu).toBe(false);
    expect(sentryDsnInfo("https://o12.ingest.de.sentry.io/34").ok).toBe(false);
    expect(sentryDsnInfo("nonsense").ok).toBe(false);
  });

  it("warns once in the log when the DSN is outside the EU", async () => {
    vi.stubEnv("SENTRY_DSN", "https://pub@o1.ingest.us.sentry.io/8");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await reportError(new Error("x"), { kind: "action" });
    await reportError(new Error("y"), { kind: "action" });
    expect(warn.mock.calls.filter((c) => String(c[0]).includes("EU region"))).toHaveLength(1);
  });
});
