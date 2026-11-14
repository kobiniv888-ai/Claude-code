/**
 * Settings of the weekly encrypted off-site backup (SECURITY_REPORT 12.4.b; founder's choice:
 * Backblaze B2, EU Central, its own account, a bucket with Object Lock). Pure: the startup check
 * (src/lib/startup-check.ts) and the job (./offsite.ts) both read them here.
 *
 *   BACKUP_ENCRYPTION_KEY         32 random bytes, base64 (openssl rand -base64 32). Keep a copy OFFLINE.
 *   OFFSITE_S3_ENDPOINT           https://s3.eu-central-003.backblazeb2.com (the bucket's "Endpoint")
 *   OFFSITE_S3_REGION             eu-central-003 (the part after "s3." in the endpoint)
 *   OFFSITE_S3_BUCKET             the bucket's name (Object Lock enabled when it was created)
 *   OFFSITE_S3_ACCESS_KEY_ID      the B2 application key's keyID: a key for THIS bucket only,
 *   OFFSITE_S3_SECRET_ACCESS_KEY  with listFiles, readFiles, writeFiles, writeFileRetentions and
 *                                 readFileRetentions, and WITHOUT deleteFiles or bypassGovernance
 *   OFFSITE_RETENTION_DAYS        optional, default 60: each copy is locked (COMPLIANCE) this long
 *
 * They are NOT the photo storage's S3_* keys: another provider and another account, so one leaked
 * or deleted account never takes both copies.
 */

export type OffsiteEnv = Partial<Record<string, string | undefined>>;

export type OffsiteConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  retentionDays: number;
  /** Object names start with this ("bayit/<SITE_ENV>/"). */
  prefix: string;
};

/** Each copy stays locked this many days unless OFFSITE_RETENTION_DAYS says otherwise (founder: "about 60"). */
export const DEFAULT_OFFSITE_RETENTION_DAYS = 60;
export const MIN_OFFSITE_RETENTION_DAYS = 14;
export const MAX_OFFSITE_RETENTION_DAYS = 365;

export const OFFSITE_REQUIRED = [
  "OFFSITE_S3_ENDPOINT",
  "OFFSITE_S3_REGION",
  "OFFSITE_S3_BUCKET",
  "OFFSITE_S3_ACCESS_KEY_ID",
  "OFFSITE_S3_SECRET_ACCESS_KEY",
] as const;

const read = (env: OffsiteEnv, name: string) => env[name]?.trim() ?? "";

/** True when any of the off-site settings is filled in (a half-filled set is a problem, not "off"). */
export function offsiteRequested(env: OffsiteEnv): boolean {
  return OFFSITE_REQUIRED.some((name) => read(env, name) !== "") || read(env, "BACKUP_ENCRYPTION_KEY") !== "";
}

function retentionDays(env: OffsiteEnv): number | null {
  const raw = read(env, "OFFSITE_RETENTION_DAYS");
  if (!raw) return DEFAULT_OFFSITE_RETENTION_DAYS;
  const days = Number(raw);
  return Number.isInteger(days) && days >= MIN_OFFSITE_RETENTION_DAYS && days <= MAX_OFFSITE_RETENTION_DAYS ? days : null;
}

/** Everything wrong with the off-site settings (empty: complete and well-formed). */
export function offsiteConfigProblems(env: OffsiteEnv): string[] {
  const problems: string[] = [];
  for (const name of OFFSITE_REQUIRED) {
    if (!read(env, name)) problems.push(`${name} is not set (the weekly encrypted off-site backup, docs/BACKUPS.md).`);
  }
  const endpoint = read(env, "OFFSITE_S3_ENDPOINT");
  if (endpoint) {
    let url: URL | null = null;
    try {
      url = new URL(endpoint);
    } catch {
      url = null;
    }
    if (!url || url.protocol !== "https:") problems.push("OFFSITE_S3_ENDPOINT must be an https address (e.g. https://s3.eu-central-003.backblazeb2.com).");
  }
  const key = read(env, "BACKUP_ENCRYPTION_KEY");
  if (!key) problems.push("BACKUP_ENCRYPTION_KEY is not set (generate it with: openssl rand -base64 32, and keep a copy offline).");
  else if (!/^[A-Za-z0-9+/]+={0,2}$/.test(key) || Buffer.from(key, "base64").length !== 32) {
    problems.push("BACKUP_ENCRYPTION_KEY must be 32 bytes encoded as base64 (openssl rand -base64 32).");
  }
  if (retentionDays(env) === null) {
    problems.push(`OFFSITE_RETENTION_DAYS must be a whole number of days from ${MIN_OFFSITE_RETENTION_DAYS} to ${MAX_OFFSITE_RETENTION_DAYS}.`);
  }
  // Separate credentials and a separate provider from the photo storage (S3_*).
  const ownKeyId = read(env, "OFFSITE_S3_ACCESS_KEY_ID");
  if (ownKeyId && ownKeyId === read(env, "S3_ACCESS_KEY_ID")) {
    problems.push("OFFSITE_S3_ACCESS_KEY_ID is the photo storage's key (S3_ACCESS_KEY_ID): the off-site backup needs its own account and key.");
  }
  const hostOf = (raw: string) => {
    try {
      return new URL(raw).hostname.toLowerCase();
    } catch {
      return "";
    }
  };
  const offsiteHost = hostOf(endpoint);
  const storageHost = hostOf(read(env, "S3_ENDPOINT"));
  if (offsiteHost && storageHost && offsiteHost === storageHost) {
    problems.push("OFFSITE_S3_ENDPOINT is the photo storage's endpoint (S3_ENDPOINT): the off-site copy must be with another provider.");
  }
  const secrets = ["BETTER_AUTH_SECRET", "APP_ENCRYPTION_KEY", "HASH_SALT", "FIELD_ENCRYPTION_KEY"].map((name) => read(env, name));
  if (key && secrets.includes(key)) problems.push("BACKUP_ENCRYPTION_KEY must be its own key, not one of the site's other secrets.");
  return problems;
}

/** The complete settings, or null when the off-site backup is not set up (or set up wrongly). */
export function readOffsiteConfig(env: OffsiteEnv): OffsiteConfig | null {
  if (offsiteConfigProblems(env).length > 0) return null;
  const site = read(env, "SITE_ENV").toLowerCase() || "unknown";
  return {
    endpoint: read(env, "OFFSITE_S3_ENDPOINT").replace(/\/+$/, ""),
    region: read(env, "OFFSITE_S3_REGION"),
    bucket: read(env, "OFFSITE_S3_BUCKET"),
    accessKeyId: read(env, "OFFSITE_S3_ACCESS_KEY_ID"),
    secretAccessKey: read(env, "OFFSITE_S3_SECRET_ACCESS_KEY"),
    retentionDays: retentionDays(env) ?? DEFAULT_OFFSITE_RETENTION_DAYS,
    prefix: `bayit/${site.replace(/[^a-z]/g, "") || "unknown"}/`,
  };
}

/** "bayit/production/2026-11-08T02-53-10Z-a1b2.bkenc" for a backup id. */
export function offsiteObjectKey(config: Pick<OffsiteConfig, "prefix">, backupId: string): string {
  return `${config.prefix}${backupId}.bkenc`;
}

/** The lock's end: `days` after `now`, to the second (COMPLIANCE mode; nobody can delete the copy before it). */
export function retainUntil(now: Date, days: number): Date {
  return new Date(Math.floor(now.getTime() / 1000) * 1000 + days * 24 * 3600 * 1000);
}
