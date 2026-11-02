import { describe, expect, it } from "vitest";
import { codeDisplayMode, isTestHost, normalizeHost, requestHostsOf } from "./code-display";

const codespace = "fluffy-train-4205.app.github.dev";

describe("isTestHost", () => {
  it("accepts localhost, loopback and Codespaces previews (any port, any case)", () => {
    for (const host of ["localhost", "localhost:3000", "127.0.0.1:4205", "[::1]:3000", "::1", codespace, `${codespace.toUpperCase()}:443`]) {
      expect(isTestHost(host), host).toBe(true);
    }
  });

  it("rejects the real domain and look-alikes", () => {
    for (const host of ["bayit.ge", "www.bayit.ge", "app.github.dev", "evil.com", "localhost.evil.com", "app.github.dev.evil.com", "", null, undefined]) {
      expect(isTestHost(host), String(host)).toBe(false);
    }
  });

  it("normalizes ports and brackets", () => {
    expect(normalizeHost("LocalHost:3000")).toBe("localhost");
    expect(normalizeHost("[::1]:3000")).toBe("::1");
  });
});

describe("codeDisplayMode — may login codes be shown on screen?", () => {
  it("development: always (any host, test mode or not)", () => {
    expect(codeDisplayMode({ NODE_ENV: "development" }, ["bayit.ge"])).toBe("development");
    expect(codeDisplayMode({ NODE_ENV: "test", AUTH_TEST_MODE: "false" }, [])).toBe("development");
  });

  it("test mode on localhost or a Codespaces preview: yes", () => {
    const env = { NODE_ENV: "production", AUTH_TEST_MODE: "true", NEXT_PUBLIC_SITE_URL: "http://localhost:3000" };
    expect(codeDisplayMode(env, ["localhost:3000"])).toBe("test");
    expect(codeDisplayMode({ ...env, AUTH_TEST_MODE: " TRUE " }, ["127.0.0.1:3000"])).toBe("test");
    expect(
      codeDisplayMode(
        { NODE_ENV: "production", AUTH_TEST_MODE: "true", NEXT_PUBLIC_SITE_URL: `https://${codespace}`, BETTER_AUTH_URL: `https://${codespace}` },
        // The Codespaces forwarder: Host localhost, X-Forwarded-Host the preview address.
        ["localhost:3000", codespace],
      ),
    ).toBe("test");
  });

  it("test mode on a real domain: never", () => {
    const env = { NODE_ENV: "production", AUTH_TEST_MODE: "true", NEXT_PUBLIC_SITE_URL: "https://bayit.ge" };
    expect(codeDisplayMode(env, ["bayit.ge"])).toBeNull();
    // A forged "Host: localhost" does not help while the site address is the real domain.
    expect(codeDisplayMode(env, ["localhost"])).toBeNull();
    // A real domain anywhere in the forwarded chain turns it off.
    expect(codeDisplayMode({ NODE_ENV: "production", AUTH_TEST_MODE: "true" }, ["localhost:3000", "bayit.ge"])).toBeNull();
    // No host at all: off.
    expect(codeDisplayMode({ NODE_ENV: "production", AUTH_TEST_MODE: "true" }, [])).toBeNull();
  });

  it("production without test mode: never, even on localhost", () => {
    expect(codeDisplayMode({ NODE_ENV: "production" }, ["localhost:3000"])).toBeNull();
    expect(codeDisplayMode({ NODE_ENV: "production", AUTH_TEST_MODE: "1" }, ["localhost:3000"])).toBeNull();
    expect(codeDisplayMode({ NODE_ENV: "production", AUTH_TEST_MODE: "false" }, [codespace])).toBeNull();
  });
});

describe("requestHostsOf", () => {
  it("reads Host and every X-Forwarded-Host entry", () => {
    const headers = new Headers({ host: "localhost:3000", "x-forwarded-host": `${codespace}, proxy.internal` });
    expect(requestHostsOf(headers)).toEqual(["localhost:3000", codespace, "proxy.internal"]);
    expect(requestHostsOf(null)).toEqual([]);
  });
});
