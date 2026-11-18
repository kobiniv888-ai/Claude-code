import { afterEach, describe, expect, it, vi } from "vitest";
import { buildEnvelope, parseDsn, reportError, stripQuery } from "./monitoring";

describe("parseDsn", () => {
  it("builds the envelope URL from a Sentry DSN", () => {
    expect(parseDsn("https://abc123@o42.ingest.sentry.io/4501")).toEqual({
      publicKey: "abc123",
      envelopeUrl: "https://o42.ingest.sentry.io/api/4501/envelope/",
    });
    expect(parseDsn("https://key@sentry.example.com/base/7")?.envelopeUrl).toBe("https://sentry.example.com/base/api/7/envelope/");
  });

  it("rejects empty or malformed values", () => {
    for (const dsn of [undefined, null, "", "  ", "not a url", "https://o42.ingest.sentry.io/4501", "https://k@host/abc", "ftp://k@host/1"]) {
      expect(parseDsn(dsn)).toBeNull();
    }
  });
});

describe("buildEnvelope", () => {
  it("sends the error and route but never the query string", () => {
    const error = Object.assign(new TypeError("boom"), { digest: "123" });
    const lines = buildEnvelope(
      error,
      { kind: "render", route: "/[locale]/search", path: "/he/search?q=+995555000001&token=secret", method: "GET" },
      { eventId: "a".repeat(32), now: new Date("2026-10-31T12:00:00Z"), environment: "production", release: "abc" },
    ).split("\n");
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0])).toEqual({ event_id: "a".repeat(32), sent_at: "2026-10-31T12:00:00.000Z" });
    expect(JSON.parse(lines[1])).toEqual({ type: "event" });
    const event = JSON.parse(lines[2]);
    expect(event.exception.values[0]).toEqual({ type: "TypeError", value: "boom" });
    expect(event.transaction).toBe("/[locale]/search");
    expect(event.request).toEqual({ method: "GET", url: "/he/search" });
    expect(event.tags).toMatchObject({ kind: "render", digest: "123" });
    expect(event.release).toBe("abc");
    expect(lines.join("\n")).not.toContain("secret");
    expect(lines.join("\n")).not.toContain("995555000001");
  });

  it("scrubs personal data and tokens from the message, stack, cause path and tags (5.l, 16.1)", () => {
    const error = new Error("Unique constraint failed for noa@example.com / +972500000017, code 482913, from 203.0.113.42");
    error.stack = `Error: noa@example.com\n    at verify (/app/src/lib/auth.ts:12:3) +972500000017`;
    const body = buildEnvelope(error, {
      kind: "route",
      path: "/api/ical/Xk3vQ9_aZ0-pL7mN2bR8sT4uW6yA1cE5dF7gH9jK0lM.ics",
      tags: { job: "send to dana@example.com" },
    });
    for (const secret of ["noa@example.com", "dana@example.com", "0000017", "482913", "203.0.113.42", "Xk3vQ9_aZ0-pL7mN2bR8sT4uW6yA1cE5dF7gH9jK0lM"]) {
      expect(body).not.toContain(secret);
    }
    const event = JSON.parse(body.split("\n")[2]);
    expect(event.request.url).toBe("/api/ical/[token].ics");
    expect(event.exception.values[0].value).toContain("n***@e…");
  });

  it("handles thrown non-errors", () => {
    const event = JSON.parse(buildEnvelope("plain", { kind: "cron", tags: { job: "cleanup" } }).split("\n")[2]);
    expect(event.exception.values[0]).toEqual({ type: "NonError", value: "plain" });
    expect(event.tags).toMatchObject({ kind: "cron", job: "cleanup" });
    expect(event.request).toBeUndefined();
  });
});

describe("stripQuery", () => {
  it("keeps only the path", () => {
    expect(stripQuery("/en/listing/12?x=1#top")).toBe("/en/listing/12");
    expect(stripQuery("?only=query")).toBe("/");
    expect(stripQuery(undefined)).toBeUndefined();
  });
});

describe("reportError", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("does nothing without SENTRY_DSN", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await reportError(new Error("x"), { kind: "action" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts an envelope and never throws when the request fails", async () => {
    vi.stubEnv("SENTRY_DSN", "https://pub@o1.ingest.sentry.io/99");
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(reportError(new Error("x"), { kind: "action" })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://o1.ingest.sentry.io/api/99/envelope/");
    expect(init.headers["X-Sentry-Auth"]).toContain("sentry_key=pub");
  });
});
