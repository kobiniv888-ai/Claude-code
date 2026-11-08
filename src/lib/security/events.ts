import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { hmacHash } from "@/lib/crypto";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/request";
import { isSecurityEventType, type SecurityEventType } from "./event-types";

/**
 * The security event log (SECURITY_REPORT 16.2, D6): a separate table (SecurityEvent), kept
 * 90 days (purgeOldSecurityEvents, run by the daily cleanup job), read by staff and alerts.
 *
 *   await recordSecurityEvent({ type: "login_code_locked", userId, meta: { channel: "sms", country: "IL" } });
 *   void recordSecurityEvent({ type: "csp_report", ip: null, meta: { directive: "img-src" } });
 *
 * - BEST EFFORT: never throws and never blocks the action that reports (a failure is logged
 *   without the event's details). Await it where the order matters, or `void` it.
 * - NO PERSONAL DATA: the IP is stored only as an HMAC with HASH_SALT (`ip` given → hashed; not
 *   given → the current request's IP, hashed; `null` → none). `meta` is reduced to at most
 *   MAX_META_KEYS flat values (strings up to MAX_META_STRING characters, numbers, booleans); keys
 *   that name personal data (email, phone, code, otp, token, password, secret, ip, name,
 *   address…) and values that look like an email, a phone number, an IP address or a login code
 *   are dropped. Put counts, reason codes and country codes in meta, nothing else.
 * - The type must be one of SECURITY_EVENT_TYPES (./event-types.ts); unknown types are dropped.
 */

export const SECURITY_EVENT_RETENTION_DAYS = 90;
export const MAX_META_KEYS = 20;
export const MAX_META_STRING = 120;

export type SecurityEventInput = {
  type: SecurityEventType;
  userId?: string | null;
  /** The raw IP (hashed here). Omit to use the current request's IP; null for none. */
  ip?: string | null;
  meta?: Record<string, unknown> | null;
};

/** Words that make a meta key personal or secret ("guestPhone", "otp_code", "ipAddress", "apiKey"…). */
const PII_WORDS = new Set([
  "email", "mail", "phone", "mobile", "msisdn", "tel", "code", "otp", "pin", "token", "password", "passwd", "secret",
  "key", "cookie", "session", "ip", "address", "addr", "name", "card", "iban", "account", "lat", "lng", "location",
]);
/** "countryCode", "reasonCode"…: a "code" word after these is a category, not a secret. */
const CATEGORY_WORDS = new Set(["country", "reason", "error", "status", "http", "result", "provider", "currency", "lang", "locale"]);

function isPersonalKey(key: string): boolean {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.some((word, i) => PII_WORDS.has(word) && !(word === "code" && i > 0 && CATEGORY_WORDS.has(words[i - 1]!)));
}
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE = /\+?\d[\d\s().-]{6,}\d/;
const IPV4 = /\b\d{1,3}(\.\d{1,3}){3}\b/;
const IPV6 = /\b[0-9a-f]{0,4}(:[0-9a-f]{0,4}){2,7}\b/i;
const SHORT_CODE = /^\s*\d{4,8}\s*$/;

/** Keeps only small, flat, non-personal values (see the module comment). */
export function sanitizeSecurityMeta(meta: Record<string, unknown> | null | undefined): Record<string, string | number | boolean> | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const out: Record<string, string | number | boolean> = {};
  for (const [rawKey, value] of Object.entries(meta)) {
    if (Object.keys(out).length >= MAX_META_KEYS) break;
    const key = rawKey.slice(0, 40);
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || isPersonalKey(key)) continue;
    if (typeof value === "boolean") out[key] = value;
    else if (typeof value === "number") {
      if (Number.isFinite(value)) out[key] = value;
    } else if (typeof value === "string") {
      const text = value.trim().slice(0, MAX_META_STRING);
      if (!text || EMAIL.test(text) || PHONE.test(text) || IPV4.test(text) || IPV6.test(text) || SHORT_CODE.test(text)) continue;
      out[key] = text;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

async function ipHashFor(ip: string | null | undefined): Promise<string | null> {
  if (ip === null) return null;
  const raw = ip === undefined ? await getClientIp().catch(() => null) : ip.trim();
  return raw ? hmacHash(`ip:${raw}`) : null;
}

/** Writes one event. Never throws; false when it could not be written (or was dropped). */
export async function recordSecurityEvent(input: SecurityEventInput): Promise<boolean> {
  try {
    if (!isSecurityEventType(input.type)) {
      console.error(`[security-event] unknown type "${String(input.type).slice(0, 40)}" — dropped`);
      return false;
    }
    const meta = sanitizeSecurityMeta(input.meta);
    await db.securityEvent.create({
      data: {
        type: input.type,
        userId: input.userId ?? null,
        ipHash: await ipHashFor(input.ip),
        ...(meta ? { meta: meta as Prisma.InputJsonValue } : {}),
      },
    });
    return true;
  } catch (error) {
    console.error(`[security-event] could not record "${input.type}":`, (error as Error)?.message ?? error);
    return false;
  }
}

/** Deletes events older than SECURITY_EVENT_RETENTION_DAYS. Run daily by /api/cron/cleanup. */
export async function purgeOldSecurityEvents(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - SECURITY_EVENT_RETENTION_DAYS * 24 * 3600 * 1000);
  const { count } = await db.securityEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}
