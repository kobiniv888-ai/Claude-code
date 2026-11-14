import { afterEach, describe, expect, it, vi } from "vitest";
import { demoAllowed, isProductionSite, readSiteEnv, siteEnv, testModeAllowed, testModeOn, testModeRequested } from "./site-env";

describe("SITE_ENV (founder's decision 1)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads exactly development, staging or production", () => {
    expect(readSiteEnv({ SITE_ENV: "development" })).toBe("development");
    expect(readSiteEnv({ SITE_ENV: " staging " })).toBe("staging");
    expect(readSiteEnv({ SITE_ENV: "production" })).toBe("production");
    for (const bad of [undefined, "", "  ", "Production", "prod", "dev", "test", "preview"]) {
      expect(readSiteEnv({ SITE_ENV: bad }), String(bad)).toBeNull();
    }
  });

  it("siteEnv() throws a clear error when missing or invalid", () => {
    expect(siteEnv({ SITE_ENV: "staging" })).toBe("staging");
    expect(() => siteEnv({})).toThrow(/SITE_ENV is not set/);
    expect(() => siteEnv({ SITE_ENV: "prod" })).toThrow(/"prod" is not valid/);
  });

  it("never looks at NODE_ENV", () => {
    expect(isProductionSite({ NODE_ENV: "development", SITE_ENV: "production" })).toBe(true);
    expect(isProductionSite({ NODE_ENV: "production", SITE_ENV: "staging" })).toBe(false);
    expect(testModeOn({ NODE_ENV: "production", SITE_ENV: "staging", AUTH_TEST_MODE: "true" })).toBe(true);
    expect(testModeOn({ NODE_ENV: "development", SITE_ENV: "production", AUTH_TEST_MODE: "true" })).toBe(false);
  });

  it("fails closed: missing or invalid SITE_ENV counts as production", () => {
    expect(isProductionSite({})).toBe(true);
    expect(isProductionSite({ SITE_ENV: "dev" })).toBe(true);
    expect(testModeAllowed({})).toBe(false);
    expect(testModeOn({ AUTH_TEST_MODE: "true" })).toBe(false);
    expect(demoAllowed({})).toBe(false);
  });

  it("test mode: only AUTH_TEST_MODE=true on development or staging", () => {
    expect(testModeOn({ SITE_ENV: "development", AUTH_TEST_MODE: "true" })).toBe(true);
    expect(testModeOn({ SITE_ENV: "staging", AUTH_TEST_MODE: " TRUE " })).toBe(true);
    expect(testModeOn({ SITE_ENV: "production", AUTH_TEST_MODE: "true" })).toBe(false);
    for (const value of [undefined, "", "false", "1", "yes", "on"]) {
      expect(testModeOn({ SITE_ENV: "development", AUTH_TEST_MODE: value }), String(value)).toBe(false);
    }
    expect(testModeRequested({ AUTH_TEST_MODE: "true" })).toBe(true);
    expect(testModeAllowed({ SITE_ENV: "production" })).toBe(false);
  });

  it("demo data: development and staging only", () => {
    expect(demoAllowed({ SITE_ENV: "development" })).toBe(true);
    expect(demoAllowed({ SITE_ENV: "staging" })).toBe(true);
    expect(demoAllowed({ SITE_ENV: "production" })).toBe(false);
  });

  it("reads process.env by default", () => {
    vi.stubEnv("SITE_ENV", "production");
    expect(isProductionSite()).toBe(true);
    expect(demoAllowed()).toBe(false);
    vi.stubEnv("SITE_ENV", "development");
    vi.stubEnv("AUTH_TEST_MODE", "true");
    expect(siteEnv()).toBe("development");
    expect(testModeOn()).toBe(true);
  });
});
