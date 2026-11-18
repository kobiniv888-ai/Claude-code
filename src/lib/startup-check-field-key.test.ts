/**
 * FIELD_ENCRYPTION_KEY in the start-up check (SECURITY_REPORT 12.3.c, D7): required on staging and
 * production, 32 bytes of base64, a key of its own (never APP_ENCRYPTION_KEY or another secret),
 * and the rotation's previous key different from the current one. Fake values only.
 */
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fakeProductionEnv } from "../../tests/startup/fake-env";
import { startupProblems, startupWarnings, type StartupEnv } from "./startup-check";

const key = () => randomBytes(32).toString("base64");
const problemsOf = (env: StartupEnv) => startupProblems(env, { productionHosts: [], nodeVersion: "22.12.0" }).join("\n");

const PROD = fakeProductionEnv();
const STAGING = { ...PROD, SITE_ENV: "staging" };
const DEV: StartupEnv = {
  SITE_ENV: "development",
  DATABASE_URL: "postgresql://bayit:bayit@localhost:5432/bayit",
  BETTER_AUTH_SECRET: PROD.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: "http://localhost:3000",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  APP_ENCRYPTION_KEY: PROD.APP_ENCRYPTION_KEY,
  HASH_SALT: PROD.HASH_SALT,
};

describe("FIELD_ENCRYPTION_KEY", () => {
  it("a complete production and staging setup passes", () => {
    expect(problemsOf(PROD)).toBe("");
    expect(problemsOf(STAGING)).toBe("");
  });

  it("missing → refuse on production and staging", () => {
    for (const env of [PROD, STAGING]) {
      expect(problemsOf({ ...env, FIELD_ENCRYPTION_KEY: "" })).toMatch(/FIELD_ENCRYPTION_KEY is not set/);
      expect(problemsOf({ ...env, FIELD_ENCRYPTION_KEY: undefined })).toMatch(/FIELD_ENCRYPTION_KEY is not set/);
    }
  });

  it("missing on a development site: starts, with a warning (development key)", () => {
    expect(problemsOf(DEV)).toBe("");
    expect(startupWarnings(DEV).join("\n")).toMatch(/FIELD_ENCRYPTION_KEY is not set/);
    expect(startupWarnings({ ...DEV, FIELD_ENCRYPTION_KEY: key() }).join("\n")).not.toMatch(/FIELD_ENCRYPTION_KEY/);
  });

  it("must be 32 bytes of base64, everywhere it is set", () => {
    for (const env of [PROD, DEV]) {
      expect(problemsOf({ ...env, FIELD_ENCRYPTION_KEY: "not a key" })).toMatch(/FIELD_ENCRYPTION_KEY must be 32 bytes/);
      expect(problemsOf({ ...env, FIELD_ENCRYPTION_KEY: randomBytes(16).toString("base64") })).toMatch(/FIELD_ENCRYPTION_KEY must be 32 bytes/);
    }
  });

  it("not a placeholder", () => {
    expect(problemsOf({ ...PROD, FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") })).toMatch(/placeholder/);
    expect(problemsOf({ ...PROD, FIELD_ENCRYPTION_KEY: Buffer.from("changeme".repeat(4)).toString("base64") })).toMatch(/placeholder/);
  });

  it("must differ from APP_ENCRYPTION_KEY and the other secrets", () => {
    expect(problemsOf({ ...PROD, FIELD_ENCRYPTION_KEY: PROD.APP_ENCRYPTION_KEY })).toMatch(/a key of its own/);
    expect(problemsOf({ ...DEV, FIELD_ENCRYPTION_KEY: DEV.APP_ENCRYPTION_KEY })).toMatch(/a key of its own/);
    const shared = key();
    expect(problemsOf({ ...PROD, FIELD_ENCRYPTION_KEY: shared, BETTER_AUTH_SECRET: shared })).toMatch(/a key of its own/);
    expect(problemsOf({ ...PROD, FIELD_ENCRYPTION_KEY: shared, CRON_SECRET: shared })).toMatch(/a key of its own/);
    // Any other secret setting too (the off-site backup key, provider tokens…), named, never shown.
    expect(problemsOf({ ...PROD, FIELD_ENCRYPTION_KEY: shared, BACKUP_ENCRYPTION_KEY: shared })).toMatch(/same as BACKUP_ENCRYPTION_KEY/);
    expect(problemsOf({ ...PROD, FIELD_ENCRYPTION_KEY: shared, TWILIO_AUTH_TOKEN: shared })).toMatch(/same as TWILIO_AUTH_TOKEN/);
    expect(problemsOf({ ...PROD, FIELD_ENCRYPTION_KEY: shared, BACKUP_ENCRYPTION_KEY: shared })).not.toContain(shared);
    // The same key in another spelling (URL-safe base64 without padding is not accepted as a key,
    // but the same bytes as a standard base64 secret are caught).
    expect(problemsOf({ ...PROD, FIELD_ENCRYPTION_KEY: shared, APP_ENCRYPTION_KEY: ` ${shared} ` })).toMatch(/a key of its own/);
    // A public setting with the same value is not a secret (and never compared).
    expect(problemsOf({ ...PROD, NEXT_PUBLIC_MAP_TILE_KEY: shared, FIELD_ENCRYPTION_KEY: shared })).toBe("");
  });

  it("rotation: the previous key must be a valid, different key", () => {
    expect(problemsOf({ ...PROD, FIELD_ENCRYPTION_KEY_PREVIOUS: key() })).toBe("");
    expect(problemsOf({ ...PROD, FIELD_ENCRYPTION_KEY_PREVIOUS: `${key()},${key()}` })).toBe("");
    expect(problemsOf({ ...PROD, FIELD_ENCRYPTION_KEY_PREVIOUS: "short" })).toMatch(/FIELD_ENCRYPTION_KEY_PREVIOUS must hold 32-byte base64 keys/);
    expect(problemsOf({ ...PROD, FIELD_ENCRYPTION_KEY_PREVIOUS: PROD.FIELD_ENCRYPTION_KEY })).toMatch(/put the OLD key there/);
    expect(problemsOf({ ...PROD, FIELD_ENCRYPTION_KEY_PREVIOUS: PROD.APP_ENCRYPTION_KEY })).toMatch(/must not be APP_ENCRYPTION_KEY/);
    expect(problemsOf({ ...PROD, FIELD_ENCRYPTION_KEY: "", FIELD_ENCRYPTION_KEY_PREVIOUS: key() })).toMatch(/without FIELD_ENCRYPTION_KEY/);
  });
});
