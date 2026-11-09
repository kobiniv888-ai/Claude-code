/**
 * The start-up rules of the operations and incident tools (builder ops-incident; called by
 * src/lib/startup-check.ts). Pure, no "@/" imports.
 *
 * Production:
 *   - SECURITY_CONTACT_EMAIL: the address in /.well-known/security.txt (SECURITY_REPORT 18.1). A
 *     PRIVATE setting at the hosting, never in a file.
 *   - the weekly encrypted off-site backup: BACKUP_ENCRYPTION_KEY and OFFSITE_S3_* (12.4.b,
 *     src/lib/admin/maintenance/offsite-config.ts).
 *   - SENTRY_DSN (16.1): a valid DSN; a warning when it is not Sentry's EU region (decision 6).
 *   - DATABASE_URL is the app's least-privilege role (12.3.b, scripts/sql/roles.sql): never the
 *     owner role ("postgres", Neon's "neondb_owner") nor the migration role.
 * Staging and production:
 *   - no secret made by the codespace (a "bayit-dev-" / "BAYITDEV" marker, src/lib/dev-keys.ts;
 *     12.2.b, 2.4.h): production keys are generated fresh at the hosting.
 *   - MIGRATION_DATABASE_URL, when set, uses TLS and another role than DATABASE_URL.
 * Every site: a MAINTENANCE_MODE value that is not on/off is a warning (it counts as ON).
 */
import { offsiteConfigProblems, offsiteRequested } from "./admin/maintenance/offsite-config";
import { DEV_MARKED_SETTINGS, isMarkedDevKey } from "./dev-keys";
import { readMaintenanceEnv } from "./maintenance/env";
import { sentryDsnInfo } from "./sentry-dsn";

export { sentryDsnInfo, type SentryDsnInfo } from "./sentry-dsn";

type Env = Partial<Record<string, string | undefined>>;
type Site = "development" | "staging" | "production" | null;

const value = (env: Env, name: string) => env[name]?.trim() ?? "";
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[A-Za-z]{2,}$/;

/** Roles that may change the schema: the app never runs as one of them. */
export const OWNER_ROLE_NAMES = ["postgres", "neondb_owner", "bayit_migrate", "root", "admin"];

function userOf(raw: string): string {
  try {
    return decodeURIComponent(new URL(raw).username).toLowerCase();
  } catch {
    return "";
  }
}

export function opsStartupProblems(env: Env, site: Site): string[] {
  const problems: string[] = [];
  if (site === "staging" || site === "production") {
    for (const name of DEV_MARKED_SETTINGS) {
      if (isMarkedDevKey(env[name])) {
        problems.push(`${name} is a codespace development key (it carries the "bayit-dev" marker): generate a NEW value for this site at the hosting, never copy one from .env.`);
      }
    }
    const migration = value(env, "MIGRATION_DATABASE_URL");
    if (migration) {
      if (!/^postgres(ql)?:\/\//.test(migration)) problems.push("MIGRATION_DATABASE_URL must be a postgresql:// connection string.");
      else if (!/[?&]sslmode=(require|verify-ca|verify-full)\b/i.test(migration)) problems.push(`MIGRATION_DATABASE_URL must use TLS on a ${site} site: add sslmode=require.`);
      if (userOf(migration) && userOf(migration) === userOf(value(env, "DATABASE_URL"))) {
        problems.push("MIGRATION_DATABASE_URL and DATABASE_URL use the same database role: the app runs as bayit_app, migrations as bayit_migrate (scripts/sql/roles.sql).");
      }
    }
  }
  if (site !== "production") return problems;

  const contact = value(env, "SECURITY_CONTACT_EMAIL");
  if (!contact) problems.push("SECURITY_CONTACT_EMAIL is not set: the security contact address for /.well-known/security.txt (a private setting at the hosting).");
  else if (!EMAIL.test(contact)) problems.push("SECURITY_CONTACT_EMAIL is not an email address.");

  problems.push(...offsiteConfigProblems(env));

  const dsn = value(env, "SENTRY_DSN");
  if (!dsn) problems.push("SENTRY_DSN is not set: error tracking (free Sentry, EU region) is required on the real site.");
  else if (!sentryDsnInfo(dsn).ok) problems.push("SENTRY_DSN is not a valid Sentry DSN (https://<key>@<org>.ingest.de.sentry.io/<project>).");

  const appRole = userOf(value(env, "DATABASE_URL"));
  if (appRole && OWNER_ROLE_NAMES.includes(appRole)) {
    problems.push(`DATABASE_URL connects as "${appRole}", a role that can change the schema: the site runs as the least-privilege role bayit_app (scripts/sql/roles.sql, docs/DATABASE_ROLES.md).`);
  }
  return problems;
}

export function opsStartupWarnings(env: Env, site: Site): string[] {
  const warnings: string[] = [];
  const maintenance = readMaintenanceEnv(env.MAINTENANCE_MODE);
  if (maintenance === "invalid") {
    warnings.push(`[startup] MAINTENANCE_MODE="${value(env, "MAINTENANCE_MODE").slice(0, 20)}" is neither on nor off: it counts as ON (the site shows the maintenance page).`);
  } else if (maintenance === "on") {
    warnings.push("[startup] MAINTENANCE_MODE is on: every public page shows the maintenance page until it is removed.");
  }
  const dsn = value(env, "SENTRY_DSN");
  if (dsn && sentryDsnInfo(dsn).ok && !sentryDsnInfo(dsn).eu) {
    warnings.push(`[startup] SENTRY_DSN sends errors to ${sentryDsnInfo(dsn).host}, not Sentry's EU region (*.ingest.de.sentry.io): the founder chose the EU data region (decision 6).`);
  }
  if (site === "staging") {
    if (!dsn) warnings.push("[startup] SENTRY_DSN is not set on staging: errors are only in the server log.");
    if (offsiteRequested(env) && offsiteConfigProblems(env).length) {
      warnings.push(`[startup] The off-site backup settings are incomplete on staging: ${offsiteConfigProblems(env).join(" ")}`);
    }
  }
  return warnings;
}
