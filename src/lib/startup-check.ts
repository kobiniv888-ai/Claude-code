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
 *   NEXT_PUBLIC_* value (those are sent to every browser); `next dev` only with SITE_ENV=development
 *   and never on a Vercel deployment; Vercel's production deployment only with SITE_ENV=production.
 * Development: its own addresses (BETTER_AUTH_URL, NEXT_PUBLIC_SITE_URL) are local or Codespaces
 *   addresses. Development and staging: never on one of the real site's host names
 *   (src/config/production-hosts.ts).
 * Staging and production add (the same rules, so staging proves the production setup):
 *   https site addresses on one origin (no localhost or Codespaces address); a TLS database
 *   connection; CRON_SECRET (32+); FIELD_ENCRYPTION_KEY (32 bytes, base64, a key of its own:
 *   fieldEncryptionProblems); Turnstile keys; email (Resend key + sender); SMS (Twilio
 *   account + Messaging sender); S3 storage with an https public URL that NEXT_PUBLIC_MEDIA_BASE_URL
 *   matches; VAPID keys; never DEV_SKIP_STAFF_2FA or NEXT_PUBLIC_SHOW_DEV_UI; Node.js 22 or newer;
 *   a trusted client-IP source (Vercel, or CLIENT_IP_HEADER behind another proxy).
 *   Staging only: AUTH_TEST_MODE may be on, and with it email and SMS may be missing.
 * Production only: AUTH_TEST_MODE must be off ("false" or unset), SITE_URL must be the same https
 *   origin, no EXTRA_ALLOWED_ORIGINS, no Cloudflare test keys, no DB_PUSH_ON_BUILD / SEED_ON_BUILD
 *   (the real database is migrated deliberately).
 *
 * Pure (no server or "@/" imports) so scripts and tests can import it.
 */
import { PRODUCTION_HOSTS, hostOfAddress, isRealSiteHost } from "../config/production-hosts";
import { readSiteEnv, testModeRequested, type SiteEnv } from "./site-env";
// Security contact, off-site backup, Sentry, database roles, codespace keys, maintenance mode (ops-incident).
import { opsStartupProblems, opsStartupWarnings } from "./ops-startup";

export type StartupEnv = Partial<Record<string, string | undefined>>;

/** What the check reads besides the environment (tests pass their own). */
export type StartupOptions = {
  /** The real site's host names (default: src/config/production-hosts.ts). */
  productionHosts?: readonly string[];
  /** The running Node.js version (default: process.versions.node). */
  nodeVersion?: string;
};

/** The lowest Node.js major a staging or production server runs on (Prisma 7 needs 20.19+ / 22.12+; Node 20 is out of support). */
export const MIN_NODE_MAJOR = 22;

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
  // A Vercel deployment (production or preview) never runs `next dev`. VERCEL=1 alone is also set
  // by `vercel env pull` / `vercel dev` on a laptop (VERCEL_ENV=development): that is fine.
  if (env.NODE_ENV === "development" && ["production", "preview"].includes(value(env, "VERCEL_ENV"))) {
    problems.push("The development server (next dev) never runs on a Vercel deployment: deploy a production build.");
  }
  // Vercel's production deployment is the real site.
  if (value(env, "VERCEL_ENV") === "production" && site && site !== "production") {
    problems.push(`This is Vercel's production deployment (VERCEL_ENV=production): SITE_ENV must be production, not "${site}".`);
  }
  return problems;
}

/**
 * The label must match the address (2.2.j, decision 1): a DEVELOPMENT site runs only on a local or
 * Codespaces address (else a production build labelled "development" on a public host would run
 * without the TLS, Turnstile and provider rules); development and staging never on one of the real
 * site's names (src/config/production-hosts.ts). SITE_URL (the permanent address for outgoing links)
 * may name the real domain in a codespace, so it is not checked here.
 */
function addressLabelProblems(env: StartupEnv, site: SiteEnv | null, productionHosts: readonly string[]): string[] {
  if (site !== "development" && site !== "staging") return [];
  const problems: string[] = [];
  if (site === "development") {
    for (const name of ["BETTER_AUTH_URL", "NEXT_PUBLIC_SITE_URL"]) {
      const url = parseUrl(value(env, name));
      if (url && !isTestHostname(url.hostname)) {
        problems.push(
          `${name} (${url.host}) is a public address, but SITE_ENV=development runs only on localhost or a Codespaces address. A public site is SITE_ENV=staging or production.`,
        );
      }
    }
  }
  for (const name of ["BETTER_AUTH_URL", "NEXT_PUBLIC_SITE_URL", "URL", "VERCEL_PROJECT_PRODUCTION_URL"]) {
    const host = hostOfAddress(value(env, name));
    if (host && isRealSiteHost(host, productionHosts)) {
      problems.push(`${name} is the real site's address (${host}): it only ever runs with SITE_ENV=production, not "${site}".`);
    }
  }
  return problems;
}

/** "22.23.4" → 22 (NaN when unreadable). */
const nodeMajor = (version: string | undefined) => Number.parseInt((version ?? "").replace(/^v/, "").split(".")[0] ?? "", 10);

function platformProblems(env: StartupEnv, site: "staging" | "production", nodeVersion: string | undefined): string[] {
  const problems: string[] = [];
  const major = nodeMajor(nodeVersion);
  if (!Number.isFinite(major) || major < MIN_NODE_MAJOR) {
    problems.push(`Node.js ${nodeVersion ?? "?"} is too old for a ${site} site: use Node.js ${MIN_NODE_MAJOR} or newer (package.json engines).`);
  }
  // Rate limits and code caps key on the client IP (src/lib/request.ts): off Vercel, only a header
  // our own proxy sets may be trusted, never a client-controlled X-Forwarded-For entry.
  if (!value(env, "VERCEL") && !value(env, "CLIENT_IP_HEADER")) {
    problems.push(
      `CLIENT_IP_HEADER is not set: outside Vercel, name the header your proxy sets with the visitor's IP (e.g. cf-connecting-ip behind Cloudflare). Without it the limits would trust the visitor's own X-Forwarded-For.`,
    );
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
  // The build may push the schema or load demo data only for test sites (scripts/vercel-build.mjs):
  // the real database is migrated deliberately (README "Going live").
  for (const name of ["DB_PUSH_ON_BUILD", "SEED_ON_BUILD"]) {
    if (flagOn(env, name)) problems.push(`${name} is on with SITE_ENV=production: the real database is never changed by a build. Remove it.`);
  }
  return problems;
}

/** 32 bytes as standard base64 (the same rule as src/lib/field-crypto-core.ts parseFieldKey). */
const isKey32 = (raw: string) => /^[A-Za-z0-9+/]+={0,2}$/.test(raw) && Buffer.from(raw, "base64").length === 32;

/**
 * FIELD_ENCRYPTION_KEY (SECURITY_REPORT 12.3.c, D7): the key of the encrypted exact addresses, pins
 * and guest phones (src/lib/field-crypto.ts). Required on staging and production; a development
 * site without one uses a key derived from BETTER_AUTH_SECRET (a warning; the codespace gets its
 * own throwaway key from .devcontainer/env-sync.sh). Wherever it is set: 32 bytes as base64, not a
 * placeholder, and a value of its own (never APP_ENCRYPTION_KEY or another secret). The previous
 * key(s) of a rotation (FIELD_ENCRYPTION_KEY_PREVIOUS, comma-separated) follow the same rules and
 * differ from the current key.
 */
function fieldEncryptionProblems(env: StartupEnv, site: SiteEnv | null): string[] {
  const problems: string[] = [];
  const hint = "generate it with: openssl rand -base64 32";
  const current = value(env, "FIELD_ENCRYPTION_KEY");
  const previous = value(env, "FIELD_ENCRYPTION_KEY_PREVIOUS").split(/[\s,]+/).filter(Boolean);
  if (!current) {
    if (site === "staging" || site === "production") problems.push(`FIELD_ENCRYPTION_KEY is not set (the key of the encrypted addresses and phones; ${hint}).`);
    if (previous.length > 0) problems.push("FIELD_ENCRYPTION_KEY_PREVIOUS is set without FIELD_ENCRYPTION_KEY: a rotation needs the new key too.");
    return problems;
  }
  // Every other secret setting: the named ones, and any whose name says it is a secret
  // (BACKUP_ENCRYPTION_KEY, TWILIO_AUTH_TOKEN, …; never a NEXT_PUBLIC_ one). Compared as text and
  // as decoded bytes, so the same key in another spelling is caught too. Only names are reported.
  const secretName = /(?:KEY|SECRET|SALT|TOKEN|PASSWORD)$/;
  const otherNames = [
    ...new Set([
      "APP_ENCRYPTION_KEY",
      "BETTER_AUTH_SECRET",
      "HASH_SALT",
      "CRON_SECRET",
      ...Object.keys(env).filter((name) => secretName.test(name) && !name.startsWith("NEXT_PUBLIC_")),
    ]),
  ].filter((name) => name !== "FIELD_ENCRYPTION_KEY" && name !== "FIELD_ENCRYPTION_KEY_PREVIOUS");
  const others = otherNames.map((name) => ({ name, raw: value(env, name) })).filter((other) => other.raw);
  const decoded = (raw: string) => Buffer.from(raw, "base64").toString("hex");
  const sameAsAnother = (raw: string) => others.find((other) => other.raw === raw || (isKey32(other.raw) && decoded(other.raw) === decoded(raw)))?.name;
  const currentTwin = isKey32(current) ? sameAsAnother(current) : undefined;
  if (!isKey32(current)) problems.push(`FIELD_ENCRYPTION_KEY must be 32 bytes encoded as base64 (${hint}).`);
  else if (looksLikePlaceholder(current) || new Set(Buffer.from(current, "base64")).size < 16) {
    problems.push(`FIELD_ENCRYPTION_KEY looks like a placeholder, not a random key (${hint}).`);
  } else if (currentTwin) {
    problems.push(`FIELD_ENCRYPTION_KEY must be a key of its own: it is the same as ${currentTwin} (never APP_ENCRYPTION_KEY or another secret).`);
  }
  for (const raw of previous) {
    const twin = isKey32(raw) ? sameAsAnother(raw) : undefined;
    if (!isKey32(raw)) problems.push("FIELD_ENCRYPTION_KEY_PREVIOUS must hold 32-byte base64 keys (comma-separated).");
    else if (isKey32(current) && decoded(raw) === decoded(current)) problems.push("FIELD_ENCRYPTION_KEY_PREVIOUS is the same key as FIELD_ENCRYPTION_KEY: put the OLD key there.");
    else if (twin) problems.push(`FIELD_ENCRYPTION_KEY_PREVIOUS must not be APP_ENCRYPTION_KEY or another secret: one of its keys is the same as ${twin}.`);
  }
  return problems;
}

/** Every reason the server must not start with this environment (empty: it may start). */
export function startupProblems(env: StartupEnv, options: StartupOptions = {}): string[] {
  const productionHosts = options.productionHosts ?? PRODUCTION_HOSTS;
  const nodeVersion = options.nodeVersion ?? (typeof process === "undefined" ? undefined : process.versions?.node);
  const { site, problems } = siteEnvProblems(env);
  problems.push(...everySiteProblems(env, site), ...addressLabelProblems(env, site, productionHosts));
  problems.push(...fieldEncryptionProblems(env, site));
  problems.push(...opsStartupProblems(env, site));
  if (site === "staging" || site === "production") {
    problems.push(
      ...urlProblems(env, site),
      ...databaseTlsProblems(env, site),
      ...servicesProblems(env, site),
      ...platformProblems(env, site, nodeVersion),
    );
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
  if (site === "development" && !value(env, "FIELD_ENCRYPTION_KEY")) {
    warnings.push("[startup] FIELD_ENCRYPTION_KEY is not set: addresses and phones are encrypted with a development key derived from BETTER_AUTH_SECRET (fake data only).");
  }
  warnings.push(...opsStartupWarnings(env, site));
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
