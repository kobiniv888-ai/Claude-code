/**
 * The start-up settings check (SECURITY_REPORT 2.2.j, 3.4.b, 20.8, 12.2; founder's decision 1):
 * one test per rule. Fake values only (example.com addresses, made-up keys).
 */
import { describe, expect, it } from "vitest";
import { formatStartupProblems, looksLikePlaceholder, startupProblems, startupWarnings, type StartupEnv } from "./startup-check";

const SECRET = "Zk3pQ9vL2mX7wR4tY8uB1nC6hJ0sD5fGaE3kW9qT2zU=";
const KEY = "q1w2e3r4t5y6u7i8o9p0a1s2d3f4g5h6j7k8l9z0x1c="; // 32 bytes in base64
const SALT = "9f8e7d6c5b4a39281706f5e4d3c2b1a0";

/** A complete development site, like the codespace. */
const DEV: StartupEnv = {
  SITE_ENV: "development",
  DATABASE_URL: "postgresql://bayit:bayit@localhost:5432/bayit",
  BETTER_AUTH_SECRET: SECRET,
  BETTER_AUTH_URL: "http://localhost:3000",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  APP_ENCRYPTION_KEY: KEY,
  HASH_SALT: SALT,
};

/** A complete real site. */
const PROD: StartupEnv = {
  ...DEV,
  SITE_ENV: "production",
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://app:pw@db.example.com:5432/bayit?sslmode=require",
  BETTER_AUTH_URL: "https://bayit.example.com",
  NEXT_PUBLIC_SITE_URL: "https://bayit.example.com",
  SITE_URL: "https://bayit.example.com",
  CRON_SECRET: "0c4f3a9b8e7d6c5b4a39281706f5e4d3c2b1a0ff9e8d7c6b",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4AAAAAAAexamplesitekeyAB".replace("example", "zq7wrtk"),
  TURNSTILE_SECRET_KEY: "0x4AAAAAAAzq7wrtkSecretKey1234567",
  RESEND_API_KEY: "re_9Kq2Lm4Np6Rs8Tu0Vw",
  EMAIL_FROM: "Bayit <no-reply@bayit.example.com>",
  TWILIO_ACCOUNT_SID: `AC${"a1b2c3d4".repeat(4)}`,
  TWILIO_AUTH_TOKEN: "f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8",
  TWILIO_MESSAGING_SERVICE_SID: `MG${"0f1e2d3c".repeat(4)}`,
  STORAGE_DRIVER: "s3",
  S3_ACCESS_KEY_ID: "AKIAFAKE0000000000",
  S3_SECRET_ACCESS_KEY: "fakeSecretAccessKey000000000000000000000",
  S3_PUBLIC_BUCKET: "bayit-public",
  S3_PRIVATE_BUCKET: "bayit-private",
  S3_PUBLIC_URL: "https://media.bayit.example.com",
  NEXT_PUBLIC_MEDIA_BASE_URL: "https://media.bayit.example.com",
  VAPID_PUBLIC_KEY: "BFakePublicKeyForTests0123456789",
  VAPID_PRIVATE_KEY: "FakePrivateKeyForTests0123456789",
  // Off Vercel: the header our proxy sets with the visitor's IP (Cloudflare here).
  CLIENT_IP_HEADER: "cf-connecting-ip",
};

const STAGING: StartupEnv = {
  ...PROD,
  SITE_ENV: "staging",
  BETTER_AUTH_URL: "https://bayit-staging.example.com",
  NEXT_PUBLIC_SITE_URL: "https://bayit-staging.example.com",
  SITE_URL: "",
};

const problemsOf = (env: StartupEnv) => startupProblems(env).join("\n");
const without = (env: StartupEnv, ...names: string[]) => Object.fromEntries(Object.entries(env).filter(([name]) => !names.includes(name)));

describe("startupProblems: complete settings start", () => {
  it("development, staging and production with everything set have no problems", () => {
    expect(startupProblems(DEV)).toEqual([]);
    expect(startupProblems(STAGING)).toEqual([]);
    expect(startupProblems(PROD)).toEqual([]);
  });
});

describe("SITE_ENV", () => {
  it("missing or invalid → refuse", () => {
    expect(problemsOf(without(DEV, "SITE_ENV"))).toMatch(/SITE_ENV is not set/);
    expect(problemsOf({ ...DEV, SITE_ENV: "prod" })).toMatch(/SITE_ENV="prod" is not valid/);
    expect(problemsOf({ ...PROD, SITE_ENV: "Production" })).toMatch(/is not valid/);
  });

  it("`next dev` only as a development site; Vercel's production deployment only as production", () => {
    expect(problemsOf({ ...STAGING, NODE_ENV: "development" })).toMatch(/next dev/);
    expect(problemsOf({ ...DEV, NODE_ENV: "development" })).toBe("");
    // A Vercel deployment never runs `next dev`; `vercel env pull` / `vercel dev` on a laptop
    // (VERCEL=1, VERCEL_ENV=development) is fine.
    expect(problemsOf({ ...DEV, NODE_ENV: "development", VERCEL: "1", VERCEL_ENV: "development" })).toBe("");
    expect(problemsOf({ ...DEV, NODE_ENV: "development", VERCEL: "1", VERCEL_ENV: "preview" })).toMatch(/never runs on a Vercel deployment/);
    expect(problemsOf({ ...DEV, NODE_ENV: "development", VERCEL: "1", VERCEL_ENV: "production" })).toMatch(/never runs on a Vercel deployment/);
    expect(problemsOf({ ...STAGING, VERCEL_ENV: "production" })).toMatch(/VERCEL_ENV=production/);
    expect(problemsOf({ ...PROD, VERCEL_ENV: "production" })).toBe("");
  });
});

describe("the label matches the address (2.2.j, decision 1)", () => {
  it("SITE_ENV=development runs only on a local or Codespaces address", () => {
    expect(problemsOf({ ...DEV, NEXT_PUBLIC_SITE_URL: "https://bayit.example.com" })).toMatch(/NEXT_PUBLIC_SITE_URL \(bayit\.example\.com\) is a public address/);
    expect(problemsOf({ ...DEV, BETTER_AUTH_URL: "https://bayit.example.com" })).toMatch(/BETTER_AUTH_URL .* is a public address/);
    // A production build labelled "development" on a public host with production-like settings.
    expect(problemsOf({ ...PROD, SITE_ENV: "development" })).toMatch(/is a public address/);
    const codespace = "https://fuzzy-space-3000.app.github.dev";
    expect(problemsOf({ ...DEV, NEXT_PUBLIC_SITE_URL: codespace, BETTER_AUTH_URL: codespace })).toBe("");
    // SITE_URL (the permanent address for outgoing links) may name the real domain in a codespace.
    expect(problemsOf({ ...DEV, SITE_URL: "https://bayit.example.com" })).toBe("");
  });

  it("development and staging never run on one of the real site's host names", () => {
    const hosts = ["bayit.example.com", "www.bayit.example.com"];
    expect(startupProblems(PROD, { productionHosts: hosts })).toEqual([]);
    expect(startupProblems({ ...PROD, SITE_ENV: "staging" }, { productionHosts: hosts }).join("\n")).toMatch(/real site's address \(bayit\.example\.com\)/);
    expect(startupProblems({ ...STAGING, VERCEL_PROJECT_PRODUCTION_URL: "www.bayit.example.com" }, { productionHosts: hosts }).join("\n")).toMatch(
      /VERCEL_PROJECT_PRODUCTION_URL is the real site's address/,
    );
    expect(startupProblems({ ...STAGING, URL: "https://bayit.example.com" }, { productionHosts: hosts }).join("\n")).toMatch(/URL is the real site's address/);
    expect(startupProblems({ ...DEV, URL: "https://BAYIT.example.com:443/" }, { productionHosts: hosts }).join("\n")).toMatch(/real site's address/);
    // The staging site on its own host starts.
    expect(startupProblems(STAGING, { productionHosts: hosts })).toEqual([]);
  });
});

describe("staging and production: platform", () => {
  it("Node.js 22 or newer (20 is out of support; Prisma 7 needs 20.19+/22.12+)", () => {
    expect(startupProblems(PROD, { nodeVersion: "20.18.1" }).join("\n")).toMatch(/Node\.js 20\.18\.1 is too old/);
    expect(startupProblems(STAGING, { nodeVersion: "v20.19.0" }).join("\n")).toMatch(/too old/);
    expect(startupProblems(PROD, { nodeVersion: "22.12.0" })).toEqual([]);
    expect(startupProblems(PROD, { nodeVersion: "24.1.0" })).toEqual([]);
    expect(startupProblems(DEV, { nodeVersion: "20.9.0" })).toEqual([]);
  });

  it("a trusted client-IP source: Vercel, or CLIENT_IP_HEADER behind another proxy", () => {
    expect(problemsOf(without(PROD, "CLIENT_IP_HEADER"))).toMatch(/CLIENT_IP_HEADER is not set/);
    expect(problemsOf(without(STAGING, "CLIENT_IP_HEADER"))).toMatch(/CLIENT_IP_HEADER is not set/);
    expect(problemsOf({ ...without(PROD, "CLIENT_IP_HEADER"), VERCEL: "1" })).toBe("");
    expect(problemsOf(without(DEV, "CLIENT_IP_HEADER"))).toBe("");
  });

  it("the real database is never pushed or seeded by a build", () => {
    expect(problemsOf({ ...PROD, DB_PUSH_ON_BUILD: "true" })).toMatch(/DB_PUSH_ON_BUILD is on with SITE_ENV=production/);
    expect(problemsOf({ ...PROD, SEED_ON_BUILD: "true" })).toMatch(/SEED_ON_BUILD is on with SITE_ENV=production/);
    expect(problemsOf({ ...STAGING, DB_PUSH_ON_BUILD: "true", SEED_ON_BUILD: "true" })).toBe("");
  });
});

describe("test mode", () => {
  it("production + AUTH_TEST_MODE=true → refuse (any truthy spelling too)", () => {
    for (const on of ["true", "TRUE", " true "]) expect(problemsOf({ ...PROD, AUTH_TEST_MODE: on }), on).toMatch(/AUTH_TEST_MODE is on with SITE_ENV=production/);
    expect(problemsOf({ ...PROD, AUTH_TEST_MODE: "1" })).toMatch(/AUTH_TEST_MODE/);
    expect(problemsOf({ ...PROD, AUTH_TEST_MODE: "false" })).toBe("");
  });

  it("staging and development may use it; staging then needs no email or SMS provider", () => {
    expect(problemsOf({ ...DEV, AUTH_TEST_MODE: "true" })).toBe("");
    expect(problemsOf({ ...STAGING, AUTH_TEST_MODE: "true" })).toBe("");
    const bare = without(STAGING, "RESEND_API_KEY", "EMAIL_FROM", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_MESSAGING_SERVICE_SID");
    expect(problemsOf({ ...bare, AUTH_TEST_MODE: "true" })).toBe("");
    expect(problemsOf({ ...bare, AUTH_TEST_MODE: "false" })).toMatch(/RESEND_API_KEY[\s\S]*TWILIO_ACCOUNT_SID/);
    expect(startupWarnings({ ...STAGING, AUTH_TEST_MODE: "true" })[0]).toMatch(/behind its password/);
  });

  it("an unclear value is refused everywhere", () => {
    expect(problemsOf({ ...DEV, AUTH_TEST_MODE: "yes" })).toMatch(/must be "true" or "false"/);
  });
});

describe("always required", () => {
  for (const name of ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "NEXT_PUBLIC_SITE_URL", "APP_ENCRYPTION_KEY", "HASH_SALT"]) {
    it(`${name} missing → refuse (development too)`, () => {
      expect(problemsOf(without(DEV, name))).toContain(name);
      expect(problemsOf({ ...DEV, [name]: "   " })).toContain(name);
    });
  }

  it("BETTER_AUTH_SECRET: 32+ characters and not a placeholder", () => {
    expect(problemsOf({ ...DEV, BETTER_AUTH_SECRET: "short-secret-123" })).toMatch(/BETTER_AUTH_SECRET is too short/);
    expect(problemsOf({ ...DEV, BETTER_AUTH_SECRET: "change-me-change-me-change-me-change-me" })).toMatch(/placeholder/);
    expect(problemsOf({ ...DEV, BETTER_AUTH_SECRET: "a".repeat(40) })).toMatch(/placeholder/);
    expect(problemsOf({ ...DEV, BETTER_AUTH_SECRET: "your-secret-here-0123456789abcdefghij" })).toMatch(/placeholder/);
  });

  it("APP_ENCRYPTION_KEY: exactly 32 bytes of base64", () => {
    expect(problemsOf({ ...DEV, APP_ENCRYPTION_KEY: "not base64 !!" })).toMatch(/APP_ENCRYPTION_KEY must be 32 bytes/);
    expect(problemsOf({ ...DEV, APP_ENCRYPTION_KEY: Buffer.alloc(16, 7).toString("base64") })).toMatch(/APP_ENCRYPTION_KEY must be 32 bytes/);
  });

  it("HASH_SALT: 16+ characters", () => {
    expect(problemsOf({ ...DEV, HASH_SALT: "abc123" })).toMatch(/HASH_SALT is too short/);
  });

  it("the three secrets must differ", () => {
    expect(problemsOf({ ...DEV, HASH_SALT: SECRET })).toMatch(/three different values/);
  });

  it("DATABASE_URL must be postgres; site addresses must be URLs", () => {
    expect(problemsOf({ ...DEV, DATABASE_URL: "mysql://x@y/z" })).toMatch(/postgresql:\/\//);
    expect(problemsOf({ ...DEV, BETTER_AUTH_URL: "localhost:3000" })).toMatch(/BETTER_AUTH_URL is not a valid/);
  });

  it("no secret-looking NEXT_PUBLIC_ value (it is sent to every browser)", () => {
    expect(problemsOf({ ...DEV, NEXT_PUBLIC_STRIPE_SECRET: "sk_live_x" })).toMatch(/NEXT_PUBLIC_STRIPE_SECRET looks like a secret/);
    expect(problemsOf({ ...DEV, NEXT_PUBLIC_API_TOKEN: "t" })).toMatch(/NEXT_PUBLIC_API_TOKEN/);
    expect(problemsOf({ ...DEV, NEXT_PUBLIC_MAP_TILE_KEY: "public-key" })).toBe("");
  });
});

describe("staging and production: addresses", () => {
  it("https only, one origin, never a local or Codespaces address", () => {
    expect(problemsOf({ ...PROD, BETTER_AUTH_URL: "http://bayit.example.com" })).toMatch(/BETTER_AUTH_URL must be an https/);
    expect(problemsOf({ ...PROD, BETTER_AUTH_URL: "https://other.example.com" })).toMatch(/same origin/);
    expect(problemsOf({ ...STAGING, NEXT_PUBLIC_SITE_URL: "https://name-3000.app.github.dev", BETTER_AUTH_URL: "https://name-3000.app.github.dev" })).toMatch(/Codespaces address/);
    expect(problemsOf({ ...PROD, NEXT_PUBLIC_SITE_URL: "https://localhost:3000", BETTER_AUTH_URL: "https://localhost:3000" })).toMatch(/local or Codespaces/);
  });

  it("production: SITE_URL is required and is the same https origin", () => {
    expect(problemsOf(without(PROD, "SITE_URL"))).toMatch(/SITE_URL is not set/);
    expect(problemsOf({ ...PROD, SITE_URL: "https://www.bayit.example.com" })).toMatch(/SITE_URL .* must be the same origin/);
    expect(problemsOf({ ...PROD, SITE_URL: "http://bayit.example.com" })).toMatch(/SITE_URL must be an https/);
    expect(problemsOf({ ...STAGING, SITE_URL: "" })).toBe("");
  });

  it("the database connection uses TLS and is not local", () => {
    expect(problemsOf({ ...PROD, DATABASE_URL: "postgresql://app:pw@db.example.com/bayit" })).toMatch(/sslmode=require/);
    expect(problemsOf({ ...PROD, DATABASE_URL: "postgresql://app:pw@db.example.com/bayit?sslmode=disable" })).toMatch(/sslmode=require/);
    expect(problemsOf({ ...STAGING, DATABASE_URL: "postgresql://app:pw@localhost/bayit?sslmode=require" })).toMatch(/local database/);
    expect(problemsOf({ ...PROD, DATABASE_URL: "postgresql://app:pw@db.example.com/bayit?sslmode=verify-full" })).toBe("");
  });
});

describe("staging and production: services and secrets", () => {
  const required = [
    "CRON_SECRET",
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    "TURNSTILE_SECRET_KEY",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_PUBLIC_BUCKET",
    "S3_PRIVATE_BUCKET",
    "S3_PUBLIC_URL",
    "NEXT_PUBLIC_MEDIA_BASE_URL",
    "VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
  ];
  for (const name of required) {
    it(`${name} missing → production and staging refuse, development starts`, () => {
      expect(startupProblems(without(PROD, name)).length, name).toBeGreaterThan(0);
      expect(startupProblems(without(STAGING, name)).length, name).toBeGreaterThan(0);
      expect(startupProblems(without(DEV, name))).toEqual([]);
    });
  }

  it("SMS: a Twilio Messaging sender is required (codes go through Messaging, Q9)", () => {
    expect(problemsOf(without(PROD, "TWILIO_MESSAGING_SERVICE_SID"))).toMatch(/TWILIO_MESSAGING_SERVICE_SID/);
    expect(problemsOf({ ...without(PROD, "TWILIO_MESSAGING_SERVICE_SID"), TWILIO_FROM_NUMBER: "+15550000000" })).toBe("");
    expect(problemsOf({ ...PROD, TWILIO_ACCOUNT_SID: "not-a-sid" })).toMatch(/does not look like a Twilio account SID/);
  });

  it("CRON_SECRET must be long and random", () => {
    expect(problemsOf({ ...PROD, CRON_SECRET: "e2e-only-cron-secret" })).toMatch(/CRON_SECRET is too short/);
    expect(problemsOf({ ...PROD, CRON_SECRET: "e2e-only-cron-secret-e2e-only-cron-secret" })).toMatch(/CRON_SECRET looks like a placeholder/);
  });

  it("storage: S3 with two buckets, and the photo address the same as the public bucket", () => {
    expect(problemsOf({ ...PROD, STORAGE_DRIVER: "local" })).toMatch(/STORAGE_DRIVER must be "s3"/);
    expect(problemsOf({ ...PROD, S3_PRIVATE_BUCKET: "bayit-public" })).toMatch(/must be different buckets/);
    expect(problemsOf({ ...PROD, NEXT_PUBLIC_MEDIA_BASE_URL: "https://other.example.com" })).toMatch(/same address as S3_PUBLIC_URL/);
    expect(problemsOf({ ...PROD, S3_PUBLIC_URL: "http://media.bayit.example.com", NEXT_PUBLIC_MEDIA_BASE_URL: "http://media.bayit.example.com" })).toMatch(/https address of the public bucket/);
  });

  it("Turnstile test keys: fine on staging, refused on the real site", () => {
    const testKeys = { NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA", TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA" };
    expect(problemsOf({ ...STAGING, ...testKeys })).toBe("");
    expect(problemsOf({ ...PROD, ...testKeys })).toMatch(/Cloudflare's test keys/);
  });

  it("development-only flags are refused (3.4.b, 12.2.b)", () => {
    expect(problemsOf({ ...PROD, DEV_SKIP_STAFF_2FA: "true" })).toMatch(/DEV_SKIP_STAFF_2FA/);
    expect(problemsOf({ ...STAGING, DEV_SKIP_STAFF_2FA: "true" })).toMatch(/DEV_SKIP_STAFF_2FA/);
    expect(problemsOf({ ...PROD, NEXT_PUBLIC_SHOW_DEV_UI: "true" })).toMatch(/NEXT_PUBLIC_SHOW_DEV_UI/);
    expect(problemsOf({ ...PROD, DEV_SKIP_STAFF_2FA: "false" })).toBe("");
    expect(problemsOf({ ...DEV, DEV_SKIP_STAFF_2FA: "true" })).toBe("");
  });

  it("production trusts only its own address (no EXTRA_ALLOWED_ORIGINS)", () => {
    expect(problemsOf({ ...PROD, EXTRA_ALLOWED_ORIGINS: "my-tunnel.example.com" })).toMatch(/EXTRA_ALLOWED_ORIGINS/);
    expect(problemsOf({ ...STAGING, EXTRA_ALLOWED_ORIGINS: "my-tunnel.example.com" })).toBe("");
  });
});

describe("helpers", () => {
  it("looksLikePlaceholder", () => {
    expect(looksLikePlaceholder("changeme")).toBe(true);
    expect(looksLikePlaceholder("abababababababababababababababab")).toBe(true);
    expect(looksLikePlaceholder(SECRET)).toBe(false);
  });

  it("formatStartupProblems lists each problem", () => {
    const text = formatStartupProblems(["A is not set.", "B is wrong."]);
    expect(text).toContain("Bayit will not start");
    expect(text).toContain("!!  - A is not set.");
    expect(text).toContain("!!  - B is wrong.");
  });
});
