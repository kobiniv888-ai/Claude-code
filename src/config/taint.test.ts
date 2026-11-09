/**
 * SECURITY_REPORT 5.k: the one switch for React's taint API. next.config.ts takes
 * experimental.taint from reactTaintEnabled(); the committed value is ON and decides on the real
 * site, and only a development or staging site may override it (REACT_TAINT, for a speed A/B).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { REACT_TAINT, reactTaintEnabled } from "./taint";

async function loadNextConfig(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const mod = await import("../../next.config");
  return mod.default;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("reactTaintEnabled (5.k)", () => {
  it("is ON in the committed config", () => {
    expect(REACT_TAINT).toBe(true);
    expect(reactTaintEnabled({ SITE_ENV: "production" })).toBe(true);
    expect(reactTaintEnabled({ SITE_ENV: "development" })).toBe(true);
  });

  it("lets a development or staging site switch it off or on for an A/B", () => {
    for (const SITE_ENV of ["development", "staging"]) {
      expect(reactTaintEnabled({ SITE_ENV, REACT_TAINT: "off" })).toBe(false);
      expect(reactTaintEnabled({ SITE_ENV, REACT_TAINT: " OFF " })).toBe(false);
      expect(reactTaintEnabled({ SITE_ENV, REACT_TAINT: "on" })).toBe(true);
    }
  });

  it("ignores the override on the real site and when SITE_ENV is missing or wrong (fail closed)", () => {
    for (const SITE_ENV of ["production", undefined, "", "prod"]) {
      expect(reactTaintEnabled({ SITE_ENV, REACT_TAINT: "off" })).toBe(REACT_TAINT);
    }
  });

  it("ignores values it does not know", () => {
    for (const REACT_TAINT_VALUE of ["", "false", "0", "no", "disabled"]) {
      expect(reactTaintEnabled({ SITE_ENV: "development", REACT_TAINT: REACT_TAINT_VALUE })).toBe(REACT_TAINT);
    }
  });
});

describe("next.config.ts experimental.taint", () => {
  it("follows the switch", async () => {
    const production = { SITE_ENV: "production", NEXT_PUBLIC_MEDIA_BASE_URL: "https://media.bayit.example" };
    expect((await loadNextConfig({ ...production, REACT_TAINT: "off" })).experimental?.taint).toBe(true);
    expect((await loadNextConfig({ SITE_ENV: "development", REACT_TAINT: "" })).experimental?.taint).toBe(true);
    expect((await loadNextConfig({ SITE_ENV: "development", REACT_TAINT: "off" })).experimental?.taint).toBe(false);
  });
});
