/**
 * The server's settings check at start (SECURITY_REPORT 2.2.j, 3.4.b, 20.8, 12.2; founder's
 * decision 1). src/instrumentation.ts calls it first thing in register() and the process EXITS
 * (code 1) when it lists a problem; scripts/check-startup-env.ts runs the same check from the
 * hosting's build (scripts/vercel-build.mjs). Fail closed: anything missing, malformed or
 * dangerous for this kind of site stops the start.
 *
 * Every site (development, staging, production):
 *   SITE_ENV (development | staging | production), DATABASE_URL, BETTER_AUTH_SECRET (32+
 *   characters, not a placeholder), BETTER_AUTH_URL, NEXT_PUBLIC_SITE_URL, APP_ENCRYPTION_KEY
 *   (32 bytes, base64), HASH_SALT (16+ characters); the three secrets all different; no secret-looking
 *   NEXT_PUBLIC_* value (those are sent to every browser); `next dev` only with SITE_ENV=development;
 *   Vercel's production deployment only with SITE_ENV=production.
 * Staging and production add (the same rules, so staging proves the production setup):
 *   https site addresses on one origin (no localhost or Codespaces address); a TLS database
 *   connection; CRON_SECRET (32+); Turnstile keys; email (Resend key + sender); SMS (Twilio
 *   account + Messaging sender); S3 storage with an https public URL that NEXT_PUBLIC_MEDIA_BASE_URL
 *   matches; VAPID keys; never DEV_SKIP_STAFF_2FA or NEXT_PUBLIC_SHOW_DEV_UI.
 *   Staging only: AUTH_TEST_MODE may be on, and with it email and SMS may be missing.
 * Production only: AUTH_TEST_MODE must be off ("false" or unset), SITE_URL must be the same https
 *   origin, no EXTRA_ALLOWED_ORIGINS, no Cloudflare test keys.
 *
 * Pure (no server or "@/" imports) so scripts and tests can import it.
 */
import { readSiteEnv, testModeRequested, type SiteEnv } from "./site-env";

export type StartupEnv = Partial<Record<string, string | undefined>>;

const PLACEHOLDER_FRAGMENTS = [
  "changeme",
  "change-me",
  "change_me",
  "replaceme",
  "replace-me",
  "yoursecret",
  "your-secret",
  "your_secret",
  "placeholder",
  "example",
  "xxxxxxxx",
  "development-only",
  "e2e-only",
  "notasecret",
  "not-a-secret",
];

const TEST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

const value = (env: StartupEnv, name: string) => env[name]?.trim() ?? "";

/** Looks like a value someone forgot to replace: a known placeholder word, or very little variety. */
export function looksLikePlaceholder(raw: string): boolean {
  const lower = raw.toLowerCase();
  if (PLACEHOLDER_FRAGMENTS.some((fragment) => lower.includes(fragment))) return true;
  return new Set(raw).size < 8;
}

function secretProblems(env: StartupEnv, name: string, minLength: number, hint: string): string[] {
  const raw = value(env, name);
  if (!raw) return [`${name} is not set (${hint}).`];
  if (raw.length < minLength) return [`${name} is too short: ${raw.length} characters, at least ${minLength} (${hint}).`];
  if (looksLikePlaceholder(raw)) return [`${name} looks like a placeholder, not a random secret (${hint}).`];
  return [];
}

function parseUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function isTestHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return TEST_HOSTNAMES.has(host) || host.endsWith(".app.github.dev") || host.endsWith(".localhost");
}

function flagOn(env: StartupEnv, name: string): boolean {
  const raw = value(env, name).toLowerCase();
  return raw !== "" && raw !== "false" && raw !== "0";
}

/** Cloudflare's published Turnstile test keys (always pass): fine on staging, never on the real site. */
const isTurnstileTestKey = (raw: string) => /^[123]x0{10,}[A-Z]{2}$/.test(raw);

function siteEnvProblems(env: StartupEnv): { site: SiteEnv | null; problems: string[] } {
  const site = readSiteEnv(env);
  if (site) return { site, problems: [] };
  const raw = value(env, "SITE_ENV");
  return {
    site: null,
    problems: [
      raw
        ? `SITE_ENV="${raw}" is not valid: set it to development, staging or production.`
        : "SITE_ENV is not set: set it to development, staging or production (see .env.example).",
    ],
  };
}

function everySiteProblems(env: StartupEnv, site: SiteEnv | null): string[] {
  const problems: string[] = [];

  const database = value(env, "DATABASE_URL");
  if (!database) problems.push("DATABASE_URL is not set.");
  else if (!/^postgres(ql)?:\/\//.test(database)) problems.push("DATABASE_URL must be a postgresql:// connection string.");

  problems.push(...secretProblems(env, "BETTER_AUTH_SECRET", 32, "generate it with: openssl rand -base64 32"));

  const encryptionKey = value(env, "APP_ENCRYPTION_KEY");
  if (!encryptionKey) problems.push("APP_ENCRYPTION_KEY is not set (generate it with: openssl rand -base64 32).");
  else if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encryptionKey) || Buffer.from(encryptionKey, "base64").length !== 32) {
    problems.push("APP_ENCRYPTION_KEY must be 32 bytes encoded as base64 (generate it with: openssl rand -base64 32).");
  }

  problems.push(...secretProblems(env, "HASH_SALT", 16, "generate it with: openssl rand -hex 16"));

  const secrets = ["BETTER_AUTH_SECRET", "APP_ENCRYPTION_KEY", "HASH_SALT"].map((name) => value(env, name)).filter(Boolean);
  if (new Set(secrets).size !== secrets.length) problems.push("BETTER_AUTH_SECRET, APP_ENCRYPTION_KEY and HASH_SALT must be three different values.");

  for (const name of ["BETTER_AUTH_URL", "NEXT_PUBLIC_SITE_URL"]) {
    const raw = value(env, name);
    if (!raw) problems.push(`${name} is not set (the address the site runs on, e.g. https://bayit.ge).`);
    else if (!parseUrl(raw)) problems.push(`${name} is not a valid http(s) address: "${raw}".`);
  }

  for (const [name, raw] of Object.entries(env)) {
    if (!name.startsWith("NEXT_PUBLIC_") || !raw?.trim()) continue;
    if (/SECRET|PRIVATE|PASSWORD|TOKEN|CREDENTIAL/i.test(name.slice("NEXT_PUBLIC_".length))) {
      problems.push(`${name} looks like a secret, but NEXT_PUBLIC_ values are sent to every browser: rename it without NEXT_PUBLIC_.`);
    }
  }

  const testMode = value(env, "AUTH_TEST_MODE").toLowerCase();
  if (testMode && testMode !== "true" && testMode !== "false") {
    problems.push(`AUTH_TEST_MODE must be "true" or "false", not "${value(env, "AUTH_TEST_MODE")}".`);
  }

  // `next dev` never serves a staging or production site (2.2.g): it shows codes and source.
  if (env.NODE_ENV === "development" && site && site !== "development") {
    problems.push(`The development server (next dev) only runs with SITE_ENV=development, not "${site}".`);
  }
  if (env.NODE_ENV === "development" && value(env, "VERCEL")) {
    problems.push("The development server (next dev) never runs on Vercel: deploy a production build.");
  }
  // Vercel's production deployment is the real site.
  if (value(env, "VERCEL_ENV") === "production" && site && site !== "production") {
    problems.push(`This is Vercel's production deployment (VERCEL_ENV=production): SITE_ENV must be production, not "${site}".`);
  }
  return problems;
}

function urlProblems(env: StartupEnv, site: "staging" | "production"): string[] {
  const problems: string[] = [];
  const auth = parseUrl(value(env, "BETTER_AUTH_URL"));
  const pub = parseUrl(value(env, "NEXT_PUBLIC_SITE_URL"));
  for (const [name, url] of [["BETTER_AUTH_URL", auth], ["NEXT_PUBLIC_SITE_URL", pub]] as const) {
    if (!url) continue;
    if (url.protocol !== "https:") problems.push(`${name} must be an https address on a ${site} site.`);
    if (isTestHostname(url.hostname)) problems.push(`${name} is a local or Codespaces address (${url.host}): not allowed on a ${site} site.`);
  }
  if (auth && pub && auth.origin !== pub.origin) {
    problems.push(`BETTER_AUTH_URL (${auth.origin}) and NEXT_PUBLIC_SITE_URL (${pub.origin}) must be the same origin on a ${site} site.`);
  }
  const siteUrlRaw = value(env, "SITE_URL");
  const siteUrl = siteUrlRaw ? parseUrl(siteUrlRaw) : null;
  if (siteUrlRaw && !siteUrl) problems.push(`SITE_URL is not a valid http(s) address: "${siteUrlRaw}".`);
  if (siteUrl && siteUrl.protocol !== "https:") problems.push(`SITE_URL must be an https address on a ${site} site.`);
  if (site === "production") {
    if (!siteUrlRaw) problems.push("SITE_URL is not set: the real site's permanent https address (e.g. https://bayit.ge).");
    else if (siteUrl && pub && siteUrl.origin !== pub.origin) {
      problems.push(`SITE_URL (${siteUrl.origin}) and NEXT_PUBLIC_SITE_URL (${pub.origin}) must be the same origin on the real site.`);
    }
    if (siteUrl && isTestHostname(siteUrl.hostname)) problems.push(`SITE_URL is a local or Codespaces address (${siteUrl.host}).`);
  }
  return problems;
}

function databaseTlsProblems(env: StartupEnv, site: "staging" | "production"): string[] {
  const raw = value(env, "DATABASE_URL");
  if (!raw) return [];
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return ["DATABASE_URL is not a valid connection string."];
  }
  const problems: string[] = [];
  const sslmode = url.searchParams.get("sslmode")?.toLowerCase();
  if (!sslmode || !["require", "verify-ca", "verify-full"].includes(sslmode)) {
    problems.push(`DATABASE_URL must use TLS on a ${site} site: add sslmode=require (or verify-full).`);
  }
  if (isTestHostname(url.hostname)) problems.push(`DATABASE_URL points at a local database (${url.hostname}) on a ${site} site.`);
  return problems;
}

function servicesProblems(env: StartupEnv, site: "staging" | "production"): string[] {
  const problems: string[] = [];
  const providersOptional = site === "staging" && testModeRequested(env);

  problems.push(...secretProblems(env, "CRON_SECRET", 32, "generate it with: openssl rand -hex 32"));

  const turnstileSite = value(env, "NEXT_PUBLIC_TURNSTILE_SITE_KEY");
  const turnstileSecret = value(env, "TURNSTILE_SECRET_KEY");
  if (!turnstileSite || !turnstileSecret) problems.push("Turnstile is not set up: NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are required.");
  else if (site === "production" && (isTurnstileTestKey(turnstileSite) || isTurnstileTestKey(turnstileSecret))) {
    problems.push("The Turnstile keys are Cloudflare's test keys (they let every request pass): use the real widget's keys.");
  }

  if (!providersOptional) {
    const resend = value(env, "RESEND_API_KEY");
    if (!resend) problems.push("RESEND_API_KEY is not set: email (login codes, booking emails) needs it.");
    else if (!resend.startsWith("re_")) problems.push("RESEND_API_KEY does not look like a Resend key (re_…).");
    if (!value(env, "EMAIL_FROM")) problems.push("EMAIL_FROM is not set (a sender on the domain verified in Resend).");

    const sid = value(env, "TWILIO_ACCOUNT_SID");
    if (!sid) problems.push("TWILIO_ACCOUNT_SID is not set: phone codes need Twilio.");
    else if (!/^AC[0-9a-fA-F]{32}$/.test(sid)) problems.push("TWILIO_ACCOUNT_SID does not look like a Twilio account SID (AC…).");
    if (!value(env, "TWILIO_AUTH_TOKEN")) problems.push("TWILIO_AUTH_TOKEN is not set.");
    if (!value(env, "TWILIO_MESSAGING_SERVICE_SID") && !value(env, "TWILIO_FROM_NUMBER")) {
      problems.push("Phone codes are sent with Twilio Messaging: set TWILIO_MESSAGING_SERVICE_SID (MG…) or TWILIO_FROM_NUMBER.");
    }
  }

  if (value(env, "STORAGE_DRIVER") !== "s3") problems.push(`STORAGE_DRIVER must be "s3" on a ${site} site (the server's own disk does not keep files).`);
  for (const name of ["S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_BUCKET", "S3_PRIVATE_BUCKET"]) {
    if (!value(env, name)) problems.push(`${name} is not set (photo and document storage).`);
  }
  if (value(env, "S3_PUBLIC_BUCKET") && value(env, "S3_PUBLIC_BUCKET") === value(env, "S3_PRIVATE_BUCKET")) {
    problems.push("S3_PUBLIC_BUCKET and S3_PRIVATE_BUCKET must be different buckets (private files must never be public).");
  }
  const publicUrl = parseUrl(value(env, "S3_PUBLIC_URL"));
  const mediaUrl = parseUrl(value(env, "NEXT_PUBLIC_MEDIA_BASE_URL"));
  if (!publicUrl || publicUrl.protocol !== "https:") problems.push("S3_PUBLIC_URL must be the https address of the public bucket.");
  if (!mediaUrl || mediaUrl.protocol !== "https:") problems.push("NEXT_PUBLIC_MEDIA_BASE_URL must be the https address of the public bucket.");
  if (publicUrl && mediaUrl && publicUrl.href.replace(/\/+$/, "") !== mediaUrl.href.replace(/\/+$/, "")) {
    problems.push("NEXT_PUBLIC_MEDIA_BASE_URL must be the same address as S3_PUBLIC_URL.");
  }

  if (!value(env, "VAPID_PUBLIC_KEY") || !value(env, "VAPID_PRIVATE_KEY")) {
    problems.push("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not set (browser notifications; make a NEW pair for this site: npx web-push generate-vapid-keys).");
  }

  if (flagOn(env, "DEV_SKIP_STAFF_2FA")) problems.push(`DEV_SKIP_STAFF_2FA is on: it is for development only and must not be set on a ${site} site.`);
  if (flagOn(env, "NEXT_PUBLIC_SHOW_DEV_UI")) problems.push(`NEXT_PUBLIC_SHOW_DEV_UI is on: it is for development only and must not be set on a ${site} site.`);
  return problems;
}

function productionOnlyProblems(env: StartupEnv): string[] {
  const problems: string[] = [];
  if (testModeRequested(env) || flagOn(env, "AUTH_TEST_MODE")) {
    problems.push("AUTH_TEST_MODE is on with SITE_ENV=production: test mode (login codes on screen) never runs on the real site. Remove it.");
  }
  if (value(env, "EXTRA_ALLOWED_ORIGINS")) {
    problems.push("EXTRA_ALLOWED_ORIGINS is set: the real site trusts only its own address. Remove it.");
  }
  return problems;
}

/** Every reason the server must not start with this environment (empty: it may start). */
export function startupProblems(env: StartupEnv): string[] {
  const { site, problems } = siteEnvProblems(env);
  problems.push(...everySiteProblems(env, site));
  if (site === "staging" || site === "production") {
    problems.push(...urlProblems(env, site), ...databaseTlsProblems(env, site), ...servicesProblems(env, site));
  }
  if (site === "production") problems.push(...productionOnlyProblems(env));
  return problems;
}

/** Loud notes that do not stop the start. */
export function startupWarnings(env: StartupEnv): string[] {
  const site = readSiteEnv(env);
  const warnings: string[] = [];
  if (site === "staging" && testModeRequested(env)) {
    warnings.push("[startup] SITE_ENV=staging with AUTH_TEST_MODE=true: login codes are shown on screen. Keep this site behind its password.");
  }
  return warnings;
}

/** The message printed before the process exits. */
export function formatStartupProblems(problems: readonly string[]): string {
  const line = "!".repeat(78);
  return [
    line,
    "!! Bayit will not start: these settings are missing or unsafe for this site",
    `!! (SITE_ENV decides which rules apply; see README → "Environment variables").`,
    ...problems.map((problem) => `!!  - ${problem}`),
    line,
  ].join("\n");
}
