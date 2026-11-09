/**
 * The operations rules of the startup check (src/lib/ops-startup.ts, through startupProblems):
 * security contact, off-site backup, Sentry (EU), database roles, codespace keys (12.2.b, 2.4.h),
 * maintenance mode. Uses the complete fake production settings of the refuse-to-start probes.
 */
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fakeProductionEnv } from "../../tests/startup/fake-env";
import { isMarkedDevKey, newDevKey, newDevSecret } from "./dev-keys";
import { opsStartupWarnings, sentryDsnInfo } from "./ops-startup";
import { startupProblems, startupWarnings } from "./startup-check";

const OPTIONS = { productionHosts: [], nodeVersion: "22.23.4" };
const problemsOf = (env: Record<string, string>) => startupProblems(env, OPTIONS).join("\n");

describe("production needs the ops settings", () => {
  it("the complete fake production settings start", () => {
    expect(startupProblems(fakeProductionEnv(), OPTIONS)).toEqual([]);
  });

  it("SECURITY_CONTACT_EMAIL is required and must be an address", () => {
    expect(problemsOf({ ...fakeProductionEnv(), SECURITY_CONTACT_EMAIL: "" })).toMatch(/SECURITY_CONTACT_EMAIL is not set/);
    expect(problemsOf({ ...fakeProductionEnv(), SECURITY_CONTACT_EMAIL: "security at bayit" })).toMatch(/not an email address/);
  });

  it("the off-site backup settings are required, with their own key", () => {
    expect(problemsOf({ ...fakeProductionEnv(), BACKUP_ENCRYPTION_KEY: "" })).toMatch(/BACKUP_ENCRYPTION_KEY is not set/);
    expect(problemsOf({ ...fakeProductionEnv(), OFFSITE_S3_BUCKET: "" })).toMatch(/OFFSITE_S3_BUCKET is not set/);
    const env = fakeProductionEnv();
    expect(problemsOf({ ...env, BACKUP_ENCRYPTION_KEY: env.APP_ENCRYPTION_KEY! })).toMatch(/its own key/);
  });

  it("SENTRY_DSN is required; a non-EU region only warns", () => {
    expect(problemsOf({ ...fakeProductionEnv(), SENTRY_DSN: "" })).toMatch(/SENTRY_DSN is not set/);
    expect(problemsOf({ ...fakeProductionEnv(), SENTRY_DSN: "not a dsn" })).toMatch(/not a valid Sentry DSN/);
    const us = { ...fakeProductionEnv(), SENTRY_DSN: "https://abc@o1.ingest.us.sentry.io/2" };
    expect(problemsOf(us)).toBe("");
    expect(startupWarnings(us).join("\n")).toMatch(/not Sentry's EU region/);
    expect(sentryDsnInfo("https://abc@o1.ingest.de.sentry.io/2")).toEqual({ ok: true, eu: true, host: "o1.ingest.de.sentry.io" });
  });

  it("the app never connects as the owner or the migration role", () => {
    for (const role of ["postgres", "neondb_owner", "bayit_migrate"]) {
      expect(problemsOf(fakeProductionEnv({ databaseUrl: `postgresql://${role}:pw@db.example.com:5432/bayit?sslmode=require` }))).toMatch(/can change the schema/);
    }
    const env = fakeProductionEnv();
    expect(problemsOf({ ...env, MIGRATION_DATABASE_URL: env.DATABASE_URL! })).toMatch(/same database role/);
    expect(problemsOf({ ...env, MIGRATION_DATABASE_URL: "postgresql://bayit_migrate:pw@db.example.com/bayit" })).toMatch(/must use TLS/);
    expect(problemsOf({ ...env, MIGRATION_DATABASE_URL: "postgresql://bayit_migrate:pw@db.example.com/bayit?sslmode=require" })).toBe("");
  });
});

describe("codespace keys never start a staging or production site (12.2.b, 2.4.h)", () => {
  it("marks both kinds of development key, and only them", () => {
    expect(isMarkedDevKey(newDevSecret(randomBytes(32).toString("base64")))).toBe(true);
    const key = newDevKey(randomBytes(24));
    expect(Buffer.from(key, "base64")).toHaveLength(32);
    expect(isMarkedDevKey(key)).toBe(true);
    expect(isMarkedDevKey(randomBytes(32).toString("base64"))).toBe(false);
    expect(isMarkedDevKey("")).toBe(false);
  });

  it("refuses a marked secret on production and staging, not in development", () => {
    const marked = { BETTER_AUTH_SECRET: newDevSecret(randomBytes(32).toString("base64")), APP_ENCRYPTION_KEY: newDevKey(randomBytes(24)) };
    const prod = problemsOf({ ...fakeProductionEnv(), ...marked });
    expect(prod).toMatch(/BETTER_AUTH_SECRET is a codespace development key/);
    expect(prod).toMatch(/APP_ENCRYPTION_KEY is a codespace development key/);
    const staging = { ...fakeProductionEnv({ siteUrl: "https://staging.bayit.example.com" }), SITE_ENV: "staging", SITE_URL: "", ...marked };
    expect(problemsOf(staging)).toMatch(/codespace development key/);
    const dev = {
      SITE_ENV: "development",
      DATABASE_URL: "postgresql://bayit:bayit@localhost:5432/bayit",
      BETTER_AUTH_URL: "http://localhost:3000",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      HASH_SALT: newDevSecret(randomBytes(16).toString("hex")),
      ...marked,
    };
    expect(problemsOf(dev)).not.toMatch(/codespace development key/);
  });
});

describe("maintenance mode setting", () => {
  it("warns when it is on, and when its value is unknown (it counts as on)", () => {
    expect(opsStartupWarnings({ MAINTENANCE_MODE: "on" }, "production").join()).toMatch(/MAINTENANCE_MODE is on/);
    expect(opsStartupWarnings({ MAINTENANCE_MODE: "maybe" }, "production").join()).toMatch(/counts as ON/);
    expect(opsStartupWarnings({ MAINTENANCE_MODE: "off" }, "production")).toEqual([]);
  });
});
