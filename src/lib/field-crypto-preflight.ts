/**
 * The checks scripts/encrypt-fields.ts (`npm run db:encrypt-fields`) runs BEFORE it reads or writes
 * a single row (SECURITY_REPORT 12.3.c, FE-2). The script seals real data, so it must never seal it
 * with a codespace key: on a staging or production run it applies the same key rules as the
 * server's start (src/lib/startup-check.ts fieldEncryptionProblems, the "BAYITDEV" / "bayit-dev-"
 * marker of src/lib/dev-keys.ts), and on any run against a database that is not on this machine it
 * refuses a missing or marked key — whatever SITE_ENV says, so a forgotten SITE_ENV=production does
 * not let the codespace's .env key through.
 *
 * `--expect-key-id <id>`: the run stops unless the current key's id (the 8 hex characters in every
 * sealed value, `fe1:<id>:…`) is exactly this one — the id the real site logs and the admin page
 * shows. Recommended for every run against the real database (docs/security/field-encryption.md).
 *
 * Pure (no server imports): names and ids only, never a key or a connection string's password.
 */
import { buildFieldKeyring, isFieldCryptoError } from "./field-crypto-core";
import { DEV_MARKED_SETTINGS, isMarkedDevKey } from "./dev-keys";
import { readSiteEnv } from "./site-env";
import { fieldEncryptionProblems } from "./startup-check";

type Env = Partial<Record<string, string | undefined>>;

export type EncryptFieldsPreflight = {
  /** Reasons not to run; empty: go ahead. */
  problems: string[];
  site: string;
  /** The target database's host (and port), never its user or password; "" when unreadable. */
  host: string;
  /** Whether the target database is on this machine (localhost, 127.0.0.1, ::1, a socket). */
  local: boolean;
  /** The id of the key new values are sealed with, when the key is usable. */
  keyId: string | null;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", ""]);

/** The host[:port] of a postgres URL (no user, no password); "" when it is not one. */
export function databaseHost(raw: string | undefined): string {
  try {
    const url = new URL(raw?.trim() ?? "");
    if (!/^postgres(ql)?:$/.test(url.protocol)) return "";
    return url.port ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    return "";
  }
}

/** "--expect-key-id abcd1234" / "--expect-key-id=abcd1234" → the id (null when not given). */
export function expectedKeyId(argv: readonly string[]): string | null {
  const index = argv.findIndex((arg) => arg === "--expect-key-id" || arg.startsWith("--expect-key-id="));
  if (index < 0) return null;
  const raw = argv[index]!.includes("=") ? argv[index]!.split("=")[1] : argv[index + 1];
  return (raw ?? "").trim().toLowerCase();
}

export function encryptFieldsPreflight(env: Env, options: { expectKeyId?: string | null } = {}): EncryptFieldsPreflight {
  const site = readSiteEnv(env);
  const problems: string[] = [];
  const hostPort = databaseHost(env.DATABASE_URL);
  const hostname = hostPort.replace(/:\d+$/, "");
  const local = LOCAL_HOSTS.has(hostname) || /^\/|host=\//.test(env.DATABASE_URL ?? "");
  const real = site === "staging" || site === "production";

  if (!site && env.SITE_ENV?.trim()) problems.push("SITE_ENV is not development, staging or production.");
  else if (!site && !local) problems.push(`SITE_ENV is not set and the database (${hostPort || "unknown host"}) is not on this machine: set SITE_ENV=staging or production.`);
  if (real) {
    // The server's own key rules (format, placeholder, a key of its own, the previous keys).
    problems.push(...fieldEncryptionProblems(env, site));
    for (const name of DEV_MARKED_SETTINGS) {
      if (isMarkedDevKey(env[name])) problems.push(`${name} is a codespace development key (the "bayit-dev" marker): never run this against a real database with the codespace's .env.`);
    }
  }
  const key = env.FIELD_ENCRYPTION_KEY?.trim() ?? "";
  if (!local && !key) {
    problems.push(`FIELD_ENCRYPTION_KEY is not set and the database (${hostPort || "unknown host"}) is not on this machine: pass the site's key explicitly (docs/security/field-encryption.md).`);
  }
  if (!local && !real && isMarkedDevKey(key)) {
    problems.push(`FIELD_ENCRYPTION_KEY is a codespace development key and the database (${hostPort || "unknown host"}) is not on this machine: load the site's settings (DOTENV_CONFIG_PATH=.env.production) and set SITE_ENV.`);
  }

  let keyId: string | null = null;
  try {
    keyId = buildFieldKeyring(env, { development: site === "development" }).current.id;
  } catch (error) {
    if (!isFieldCryptoError(error)) throw error;
    problems.push(`FIELD_ENCRYPTION_KEY cannot be used: ${error.message}`);
  }
  const expected = options.expectKeyId;
  if (expected !== undefined && expected !== null) {
    if (!/^[0-9a-f]{8}$/.test(expected)) problems.push("--expect-key-id needs the 8 hex characters of the key id (fe1:<id>:…).");
    else if (keyId && keyId !== expected) problems.push(`The key in use has id ${keyId}, not the expected ${expected}: wrong FIELD_ENCRYPTION_KEY (or the wrong env file) — nothing was changed.`);
  }
  return { problems: [...new Set(problems)], site: site ?? "unset", host: hostPort, local, keyId };
}
