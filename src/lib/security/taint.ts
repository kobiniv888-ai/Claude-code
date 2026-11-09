import "server-only";
import * as React from "react";

/**
 * React's taint API as a second safety net behind the DTOs (security checklist 5 "Extra guards",
 * SECURITY_REPORT 5.k). next.config.ts turns on `experimental.taint` (the one switch is
 * src/config/taint.ts, ON as committed); React then THROWS while
 * rendering if a tainted object or value is about to cross into a Client Component, a Server
 * Action answer or the page data (RSC payload) — the page fails instead of leaking.
 *
 *   taintObject("raw booking row", row)          // the whole object may never reach the browser
 *   taintValue("session token", session, token)  // this exact string may never reach the browser
 *   taintServerSecrets()                         // every secret setting (once per server)
 *
 * What is tainted, and where:
 * - every secret setting (BETTER_AUTH_SECRET, APP_ENCRYPTION_KEY, HASH_SALT, CRON_SECRET,
 *   DATABASE_URL, provider keys and tokens…): taintServerSecrets, run by the first helper call;
 * - the Better Auth session (its token, and the session and user objects) and the CurrentUser
 *   object with its email and phone (src/lib/auth/session.ts);
 * - the raw database rows the public listing page, the trip page and the .ics file are built
 *   from, which hold the exact address, the exact pin, the host's contact values or the guest's
 *   phone (src/lib/listing-page/load.ts, src/lib/booking/queries.ts, src/lib/trip/server.ts).
 *
 * Only by REFERENCE for rows (a DTO built from their fields is fine), and by VALUE only for strings
 * that never belong in a browser for anyone: personal values such as an email are not tainted by
 * value, because the same string legitimately appears on its owner's own settings page.
 *
 * A no-op where the API does not exist (feature-detected on every call, both functions or none):
 * outside the React Server Components layer (route handlers that do not render, scripts, unit
 * tests with React's stable build), and with the switch off, where the app runs React's stable
 * build, which has no taint API. Never throws itself, so every page works in both modes.
 */

type TaintApi = {
  experimental_taintObjectReference?: (message: string, object: object) => void;
  experimental_taintUniqueValue?: (message: string, lifetime: object, value: string | bigint) => void;
};

/** Secret settings tainted by value, by name (NEXT_PUBLIC_* are public by design and never included). */
export const SECRET_SETTINGS = [
  "BETTER_AUTH_SECRET",
  "APP_ENCRYPTION_KEY",
  "FIELD_ENCRYPTION_KEY",
  "FIELD_ENCRYPTION_KEY_PREVIOUS",
  "HASH_SALT",
  "CRON_SECRET",
  "DATABASE_URL",
  "RESTORE_TARGET_URL",
  "GOOGLE_CLIENT_SECRET",
  "APPLE_CLIENT_SECRET",
  "TWILIO_AUTH_TOKEN",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "VAPID_PRIVATE_KEY",
  "TURNSTILE_SECRET_KEY",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "MALWARE_SCAN_TOKEN",
  "AZURE_TRANSLATOR_KEY",
  "GOOGLE_TRANSLATE_API_KEY",
  "SENTRY_DSN",
] as const;

/** Any other setting whose name says it is a secret (never a NEXT_PUBLIC_ one). */
const SECRET_NAME = /(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY|_SALT)$/;

/** Shorter values are not worth a taint entry (and could collide with ordinary strings). */
export const MIN_TAINT_LENGTH = 16;

let injected: TaintApi | null = null;
const secretsTaintedFor = new WeakSet<object>();

function api(): TaintApi {
  return injected ?? (React as unknown as TaintApi);
}

/** Tests only: use this API object instead of React's (pass null to go back). */
export function setTaintApiForTests(next: TaintApi | null): void {
  injected = next;
}

/** True when React's taint API is available here (the RSC layer with experimental.taint on). */
export function taintAvailable(): boolean {
  const current = api();
  return typeof current.experimental_taintObjectReference === "function" && typeof current.experimental_taintUniqueValue === "function";
}

/** The names of the settings taintServerSecrets protects in `env` (the secret ones that are set). */
export function secretSettingNames(env: Record<string, string | undefined> = process.env): string[] {
  const names = new Set<string>(SECRET_SETTINGS);
  for (const name of Object.keys(env)) if (!name.startsWith("NEXT_PUBLIC_") && SECRET_NAME.test(name)) names.add(name);
  return [...names].filter((name) => typeof env[name] === "string" && env[name]!.trim().length >= MIN_TAINT_LENGTH).sort();
}

/** Taints every secret setting's value for the life of the server (once per React instance). */
export function taintServerSecrets(env: Record<string, string | undefined> = process.env): number {
  const current = api();
  if (!taintAvailable() || secretsTaintedFor.has(current)) return 0;
  secretsTaintedFor.add(current);
  let count = 0;
  for (const name of secretSettingNames(env)) {
    try {
      current.experimental_taintUniqueValue!(`Do not pass the server setting ${name} to the browser.`, globalThis, env[name]!.trim());
      count++;
    } catch {
      // Never break a page because a taint entry could not be made.
    }
  }
  return count;
}

/** The whole object may never be sent to the browser (its fields may, through a DTO). */
export function taintObject(what: string, object: unknown): void {
  if (!object || typeof object !== "object" || !taintAvailable()) return;
  taintServerSecrets();
  try {
    api().experimental_taintObjectReference!(`Do not pass the ${what} to the browser; send only the fields it needs.`, object);
  } catch {
    // Frozen or exotic objects: the DTO rule still applies.
  }
}

/** This exact string may never be sent to the browser while `lifetime` lives. */
export function taintValue(what: string, lifetime: object, value: unknown): void {
  if (typeof value !== "string" || value.length < MIN_TAINT_LENGTH || !taintAvailable()) return;
  taintServerSecrets();
  try {
    api().experimental_taintUniqueValue!(`Do not pass the ${what} to the browser.`, lifetime, value);
  } catch {
    // As above.
  }
}
