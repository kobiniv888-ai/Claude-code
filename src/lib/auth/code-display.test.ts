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

describe("codeDisplayMode — may login codes be shown on screen? (SITE_ENV, founder's decision 1)", () => {
  const LOCAL = { NEXT_PUBLIC_SITE_URL: "http://localhost:3000", BETTER_AUTH_URL: "http://localhost:3000" };

  it("only in test mode: AUTH_TEST_MODE=true on SITE_ENV development or staging — never because of NODE_ENV", () => {
    expect(codeDisplayMode({ NODE_ENV: "development", SITE_ENV: "development", ...LOCAL }, ["localhost:3000"])).toBeNull();
    expect(codeDisplayMode({ NODE_ENV: "development", ...LOCAL, AUTH_TEST_MODE: "true" }, ["localhost:3000"])).toBeNull();
    expect(codeDisplayMode({ NODE_ENV: "test", SITE_ENV: "development", AUTH_TEST_MODE: "false", ...LOCAL }, ["localhost:3000"])).toBeNull();
    expect(codeDisplayMode({ NODE_ENV: "development", SITE_ENV: "development", AUTH_TEST_MODE: "true", ...LOCAL }, ["localhost:3000"])).toBe("development");
  });

  it("the real site never, whatever else is set", () => {
    const env = { NODE_ENV: "production", SITE_ENV: "production", AUTH_TEST_MODE: "true", ...LOCAL };
    expect(codeDisplayMode(env, ["localhost:3000"])).toBeNull();
    expect(codeDisplayMode({ ...env, NODE_ENV: "development" }, ["localhost:3000"])).toBeNull();
    expect(codeDisplayMode({ ...env, SITE_ENV: "prod" }, ["localhost:3000"])).toBeNull();
  });

  it("development: localhost or a Codespaces preview, request and configured address alike", () => {
    const env = { NODE_ENV: "production", SITE_ENV: "development", AUTH_TEST_MODE: "true", NEXT_PUBLIC_SITE_URL: "http://localhost:3000" };
    expect(codeDisplayMode(env, ["localhost:3000"])).toBe("test");
    expect(codeDisplayMode({ ...env, AUTH_TEST_MODE: " TRUE " }, ["127.0.0.1:3000"])).toBe("test");
    expect(
      codeDisplayMode(
        { NODE_ENV: "production", SITE_ENV: "development", AUTH_TEST_MODE: "true", NEXT_PUBLIC_SITE_URL: `https://${codespace}`, BETTER_AUTH_URL: `https://${codespace}` },
        // The Codespaces forwarder: Host localhost, X-Forwarded-Host the preview address.
        ["localhost:3000", codespace],
      ),
    ).toBe("test");
  });

  it("development on a real domain: never (a forged Host does not help)", () => {
    const env = { NODE_ENV: "production", SITE_ENV: "development", AUTH_TEST_MODE: "true", NEXT_PUBLIC_SITE_URL: "https://bayit.ge" };
    expect(codeDisplayMode(env, ["bayit.ge"])).toBeNull();
    expect(codeDisplayMode(env, ["localhost"])).toBeNull();
    expect(codeDisplayMode({ ...env, ...LOCAL }, ["localhost:3000", "bayit.ge"])).toBeNull();
  });

  it("staging: only the site's own configured address (behind its password)", () => {
    const env = {
      NODE_ENV: "production",
      SITE_ENV: "staging",
      AUTH_TEST_MODE: "true",
      NEXT_PUBLIC_SITE_URL: "https://bayit-staging.example.com",
      BETTER_AUTH_URL: "https://bayit-staging.example.com",
    };
    expect(codeDisplayMode(env, ["bayit-staging.example.com"])).toBe("test");
    expect(codeDisplayMode(env, ["bayit-staging.example.com:443", "bayit-staging.example.com"])).toBe("test");
    expect(codeDisplayMode(env, ["bayit.ge"])).toBeNull();
    expect(codeDisplayMode(env, ["bayit-staging.example.com", "evil.example"])).toBeNull();
    expect(codeDisplayMode({ ...env, AUTH_TEST_MODE: "false" }, ["bayit-staging.example.com"])).toBeNull();
  });

  it("no site address configured, or a request without a host: never", () => {
    expect(codeDisplayMode({ SITE_ENV: "development", AUTH_TEST_MODE: "true" }, ["localhost:3000"])).toBeNull();
    expect(codeDisplayMode({ SITE_ENV: "development", AUTH_TEST_MODE: "true", ...LOCAL }, [])).toBeNull();
  });

  it("a job without a request (null): the configured address decides", () => {
    expect(codeDisplayMode({ NODE_ENV: "development", SITE_ENV: "development", AUTH_TEST_MODE: "true", ...LOCAL }, null)).toBe("development");
    expect(codeDisplayMode({ SITE_ENV: "development", AUTH_TEST_MODE: "true", NEXT_PUBLIC_SITE_URL: "https://bayit.ge" }, null)).toBeNull();
    expect(codeDisplayMode({ SITE_ENV: "production", AUTH_TEST_MODE: "true", ...LOCAL }, null)).toBeNull();
  });

  it("unclear AUTH_TEST_MODE values are off", () => {
    for (const value of ["1", "yes", "false", ""]) {
      expect(codeDisplayMode({ SITE_ENV: "development", AUTH_TEST_MODE: value, ...LOCAL }, ["localhost:3000"]), value).toBeNull();
    }
  });
});

describe("codeDisplayMode — never for the real site's names (src/config/production-hosts.ts)", () => {
  const REAL = ["bayit.example.com", "www.bayit.example.com"];
  const STAGING = {
    NODE_ENV: "production",
    SITE_ENV: "staging",
    AUTH_TEST_MODE: "true",
    NEXT_PUBLIC_SITE_URL: "https://staging.bayit-test.example.com",
    BETTER_AUTH_URL: "https://staging.bayit-test.example.com",
  };

  it("a staging label on the real domain shows no codes; the staging host itself still does", () => {
    const onReal = { ...STAGING, NEXT_PUBLIC_SITE_URL: "https://bayit.example.com", BETTER_AUTH_URL: "https://bayit.example.com" };
    expect(codeDisplayMode(onReal, ["bayit.example.com"], REAL)).toBeNull();
    expect(codeDisplayMode(onReal, null, REAL)).toBeNull();
    expect(codeDisplayMode(STAGING, ["staging.bayit-test.example.com"], REAL)).toBe("test");
    // A forged Host naming the real domain on the staging site: no codes either.
    expect(codeDisplayMode(STAGING, ["staging.bayit-test.example.com", "WWW.bayit.example.com:443"], REAL)).toBeNull();
  });
});

describe("requestHostsOf", () => {
  it("reads Host and every X-Forwarded-Host entry", () => {
    const headers = new Headers({ host: "localhost:3000", "x-forwarded-host": `${codespace}, proxy.internal` });
    expect(requestHostsOf(headers)).toEqual(["localhost:3000", codespace, "proxy.internal"]);
    expect(requestHostsOf(null)).toEqual([]);
  });
});
