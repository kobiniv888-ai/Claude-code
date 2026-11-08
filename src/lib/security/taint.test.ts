/**
 * SECURITY_REPORT 5.k: the taint helpers against React's real experimental server build — the one
 * Next.js uses for the app directory when next.config.ts sets experimental.taint (the unit tests
 * themselves run on React's stable build, where the API does not exist and the helpers do nothing).
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const require = createRequire(import.meta.url);
type Registry = {
  TaintRegistryObjects: WeakMap<object, string>;
  TaintRegistryValues: Map<string | bigint, { message: string; count: number }>;
};
type ExperimentalReact = {
  experimental_taintObjectReference: (message: string, object: object) => void;
  experimental_taintUniqueValue: (message: string, lifetime: object, value: string | bigint) => void;
  __SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: Registry;
};
const reactServer = require("next/dist/compiled/react-experimental/cjs/react.react-server.production.js") as ExperimentalReact;
const registry = reactServer.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

const taint = await import("./taint");

afterEach(() => taint.setTaintApiForTests(null));

describe("taint helpers (5.k)", () => {
  it("is switched on in next.config.ts (experimental.taint)", () => {
    const config = fs.readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toMatch(/experimental:\s*\{[^}]*\btaint:\s*true/);
  });

  it("do nothing on React's stable build (unit tests, scripts)", () => {
    expect(taint.taintAvailable()).toBe(false);
    expect(() => taint.taintObject("row", { address: "x" })).not.toThrow();
    expect(taint.taintServerSecrets({ BETTER_AUTH_SECRET: "x".repeat(40) })).toBe(0);
  });

  it("taint secret settings by value, once, and never NEXT_PUBLIC_ or short values", () => {
    taint.setTaintApiForTests(reactServer);
    const env = {
      BETTER_AUTH_SECRET: "test-secret-0123456789-abcdefghijklmnop",
      HASH_SALT: "test-salt-0123456789abcd",
      CUSTOM_API_KEY: "custom-key-0123456789-abcdef",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "public-site-key-0123456789",
      CRON_SECRET: "short",
      SITE_ENV: "development",
    };
    expect(taint.secretSettingNames(env)).toEqual(["BETTER_AUTH_SECRET", "CUSTOM_API_KEY", "HASH_SALT"]);
    expect(taint.taintServerSecrets(env)).toBe(3);
    expect(registry.TaintRegistryValues.get(env.BETTER_AUTH_SECRET)?.message).toContain("BETTER_AUTH_SECRET");
    expect(registry.TaintRegistryValues.has(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)).toBe(false);
    expect(registry.TaintRegistryValues.has("short")).toBe(false);
    // Once per React instance.
    expect(taint.taintServerSecrets(env)).toBe(0);
  });

  it("taint raw rows by reference and session tokens by value", () => {
    taint.setTaintApiForTests(reactServer);
    const row = { id: "l1", address: "1 Test Street", lat: 41.7101, lng: 44.7702 };
    taint.taintObject("raw listing row", row);
    expect(registry.TaintRegistryObjects.get(row)).toContain("raw listing row");
    // A DTO made from the fields is a new object: not tainted.
    expect(registry.TaintRegistryObjects.has({ id: row.id })).toBe(false);

    const session = { token: "sess-token-0123456789abcdefghij" };
    taint.taintValue("session token", session, session.token);
    expect(registry.TaintRegistryValues.get(session.token)?.message).toContain("session token");
    // Values too short to be unique are left alone.
    taint.taintValue("x", session, "abc");
    expect(registry.TaintRegistryValues.has("abc")).toBe(false);
  });

  it("never throw, whatever they are given", () => {
    taint.setTaintApiForTests(reactServer);
    for (const value of [null, undefined, 42, "text", Symbol("s")]) expect(() => taint.taintObject("x", value)).not.toThrow();
    expect(() => taint.taintValue("x", {}, 123)).not.toThrow();
  });
});
