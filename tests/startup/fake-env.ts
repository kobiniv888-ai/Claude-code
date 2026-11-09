/**
 * Settings for the refuse-to-start tests (SECURITY_REPORT 2.2.j, 3.4.b, 20.8): a COMPLETE set of
 * FAKE production settings that passes src/lib/startup-check.ts, so each test can break exactly one
 * thing. Every value is made up: example.com addresses, random secrets made fresh per run, keys
 * that only have the right shape. Nothing here works against a real service.
 */
import { randomBytes } from "node:crypto";

const random = (bytes: number) => randomBytes(bytes).toString("base64url");
const hex = (bytes: number) => randomBytes(bytes).toString("hex");

export type FakeEnvOptions = {
  /** The database address (default: a made-up host). Must use TLS and a non-local host name. */
  databaseUrl?: string;
  /** The site's address (default: https://bayit.example.com). */
  siteUrl?: string;
};

/** Fake production settings (SITE_ENV=production, test mode off) that pass the start-up check. */
export function fakeProductionEnv(options: FakeEnvOptions = {}): Record<string, string> {
  const site = options.siteUrl ?? "https://bayit.example.com";
  const media = "https://media.bayit.example.com";
  return {
    SITE_ENV: "production",
    AUTH_TEST_MODE: "false",
    DATABASE_URL: options.databaseUrl ?? `postgresql://bayit_app:${hex(12)}@db.example.com:5432/bayit?sslmode=require`,
    BETTER_AUTH_URL: site,
    NEXT_PUBLIC_SITE_URL: site,
    SITE_URL: site,
    BETTER_AUTH_SECRET: random(32),
    APP_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    // The key of the encrypted addresses and phones (src/lib/field-crypto.ts): its own random value.
    FIELD_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    HASH_SALT: random(24),
    CRON_SECRET: hex(32),
    // Shaped like real Turnstile keys, but not Cloudflare's always-pass test keys.
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: `0x4AAAAAAA${random(12)}`,
    TURNSTILE_SECRET_KEY: `0x4AAAAAAA${random(24)}`,
    RESEND_API_KEY: `re_${random(24)}`,
    EMAIL_FROM: "Bayit <no-reply@bayit.example.com>",
    TWILIO_ACCOUNT_SID: `AC${hex(16)}`,
    TWILIO_AUTH_TOKEN: hex(16),
    TWILIO_MESSAGING_SERVICE_SID: `MG${hex(16)}`,
    STORAGE_DRIVER: "s3",
    S3_ACCESS_KEY_ID: hex(16),
    S3_SECRET_ACCESS_KEY: random(32),
    S3_PUBLIC_BUCKET: "bayit-public-example",
    S3_PRIVATE_BUCKET: "bayit-private-example",
    S3_PUBLIC_URL: media,
    NEXT_PUBLIC_MEDIA_BASE_URL: media,
    VAPID_PUBLIC_KEY: random(65),
    VAPID_PRIVATE_KEY: random(32),
    DEV_SKIP_STAFF_2FA: "false",
    // Off Vercel, the header our own proxy sets with the visitor's IP (behind Cloudflare).
    CLIENT_IP_HEADER: "cf-connecting-ip",
    // security.txt's contact, error tracking in the EU region, the weekly encrypted off-site backup
    // (src/lib/ops-startup.ts): made-up values of the right shape.
    SECURITY_CONTACT_EMAIL: "security@bayit.example.com",
    SENTRY_DSN: `https://${hex(16)}@o1.ingest.de.sentry.io/1`,
    BACKUP_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    OFFSITE_S3_ENDPOINT: "https://s3.eu-central-003.backblazeb2.example.com",
    OFFSITE_S3_REGION: "eu-central-003",
    OFFSITE_S3_BUCKET: "bayit-offsite-example",
    OFFSITE_S3_ACCESS_KEY_ID: hex(12),
    OFFSITE_S3_SECRET_ACCESS_KEY: random(30),
  };
}

/** The three refuse-to-start cases the founder's decision 1 names, as changes to `fakeProductionEnv`. */
export const REFUSE_CASES: { name: string; change: Record<string, string>; expect: RegExp }[] = [
  // An empty value counts as missing (a hosting setting saved without a value; .env cannot fill it).
  { name: "SITE_ENV missing", change: { SITE_ENV: "" }, expect: /SITE_ENV is not set/ },
  { name: "SITE_ENV invalid", change: { SITE_ENV: "prod" }, expect: /SITE_ENV/ },
  { name: "test mode on a production site", change: { AUTH_TEST_MODE: "true" }, expect: /AUTH_TEST_MODE is on with SITE_ENV=production/ },
  { name: "a required secret missing (BETTER_AUTH_SECRET)", change: { BETTER_AUTH_SECRET: "" }, expect: /BETTER_AUTH_SECRET is not set/ },
  { name: "a required secret missing (HASH_SALT)", change: { HASH_SALT: "" }, expect: /HASH_SALT/ },
  { name: "the field-encryption key missing", change: { FIELD_ENCRYPTION_KEY: "" }, expect: /FIELD_ENCRYPTION_KEY is not set/ },
  { name: "the database without TLS", change: { DATABASE_URL: "postgresql://bayit_app:x@db.example.com:5432/bayit" }, expect: /DATABASE_URL must use TLS/ },
];
