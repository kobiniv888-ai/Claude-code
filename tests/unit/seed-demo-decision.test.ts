import { describe, expect, it } from "vitest";
import { isLocalDatabaseUrl, seedDemoDecision } from "../../prisma/seed/demo-decision";

/**
 * seed-demo-into-prod (SECURITY_REPORT 19.i, 3.4.c, decision 1): `npm run db:seed` run from a
 * codespace (SITE_ENV=development in .env) against the production database must not add the demo
 * users, staff, listings or scam alert.
 */

const PROD_URL = "postgresql://bayit:secret@prod-db.example.com:5432/bayit?sslmode=require";
const LOCAL_URL = "postgresql://bayit:bayit@localhost:5432/bayit";

describe("seedDemoDecision", () => {
  it("a codespace .env (development) pointed at a remote database: no demo data", () => {
    expect(seedDemoDecision({ siteEnvBeforeDotenv: undefined, siteEnv: "development", databaseUrl: PROD_URL, seedDemo: undefined })).toEqual({ demo: false, reason: "remote_database" });
  });

  it("SITE_ENV=production anywhere: never", () => {
    expect(seedDemoDecision({ siteEnvBeforeDotenv: "production", siteEnv: "production", databaseUrl: LOCAL_URL, seedDemo: "yes" }).demo).toBe(false);
    expect(seedDemoDecision({ siteEnvBeforeDotenv: undefined, siteEnv: "production", databaseUrl: LOCAL_URL, seedDemo: undefined }).demo).toBe(false);
  });

  it("no SITE_ENV: no demo data", () => {
    expect(seedDemoDecision({ siteEnvBeforeDotenv: undefined, siteEnv: undefined, databaseUrl: LOCAL_URL, seedDemo: "yes" }).demo).toBe(false);
  });

  it("development on this machine, or development/staging set on the command line: demo data", () => {
    expect(seedDemoDecision({ siteEnvBeforeDotenv: undefined, siteEnv: "development", databaseUrl: LOCAL_URL, seedDemo: undefined })).toEqual({ demo: true, reason: "local_database" });
    expect(seedDemoDecision({ siteEnvBeforeDotenv: "staging", siteEnv: "staging", databaseUrl: PROD_URL, seedDemo: undefined })).toEqual({ demo: true, reason: "real_env" });
  });

  it("a remote staging database seeded on purpose: SEED_DEMO=yes", () => {
    expect(seedDemoDecision({ siteEnvBeforeDotenv: undefined, siteEnv: "development", databaseUrl: PROD_URL, seedDemo: "yes" })).toEqual({ demo: true, reason: "seed_demo_flag" });
  });
});

describe("isLocalDatabaseUrl", () => {
  it("knows this machine from a remote host", () => {
    for (const url of [LOCAL_URL, "postgres://u@127.0.0.1/db", "postgresql://u@[::1]:5432/db", "postgresql://u@db.localhost/db"]) expect(isLocalDatabaseUrl(url), url).toBe(true);
    for (const url of [PROD_URL, "postgresql://u@10.0.0.5/db", "", undefined, "not a url"]) expect(isLocalDatabaseUrl(url), String(url)).toBe(false);
  });
});
