/**
 * The rules of the data clean-ups (founder's answer 8, round 3), pure so they are unit-tested.
 * The server side (./cleanups.ts) reads the rows, applies these rules for the dry run and the run,
 * and writes only what they say.
 *
 * Phones: a stored number is rewritten only when it carries its country code ("+972 053…",
 * "00995…"): normalizePhone() drops the national 0 and the spaces. A number written WITHOUT a
 * country code is never guessed (an Israeli "053…" on a Georgian listing would become a wrong
 * Georgian number): it is counted and left for a person, unless the row's country is certain
 * (a community place in Georgia). Login numbers that would collide with another account are never
 * merged: both rows are left and reported.
 */
import { CONTACT_CHANNELS } from "@/lib/listing/fields";
import { normalizePhone } from "@/lib/phone";
import { stripTitleEmoji } from "@/lib/text/emoji";

export const CLEANUP_NAMES = ["phones", "title-emoji", "contact-taps", "verification-files"] as const;
export type CleanupName = (typeof CLEANUP_NAMES)[number];

export function isCleanupName(value: unknown): value is CleanupName {
  return typeof value === "string" && (CLEANUP_NAMES as readonly string[]).includes(value);
}

/** How fresh the backup must be before a clean-up may run. */
export const BACKUP_MAX_AGE_MS = 60 * 60 * 1000;

/** Is there a complete backup newer than an hour? (`now` for tests.) */
export function isBackupFresh(latestCreatedAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!latestCreatedAt) return false;
  const at = new Date(latestCreatedAt).getTime();
  if (!Number.isFinite(at)) return false;
  const age = now.getTime() - at;
  // A clock that is a little ahead still counts; a backup "from the future" by more than a minute does not.
  return age <= BACKUP_MAX_AGE_MS && age >= -60_000;
}

// ─── Phones ──────────────────────────────────────────────────────

export type PhonePlan =
  | { status: "ok" }
  | { status: "changed"; from: string; to: string }
  /** No country code and no certain country for the row: left as it is, for a person. */
  | { status: "no_country"; from: string }
  /** Not a usable phone number: left as it is, for a person. */
  | { status: "invalid"; from: string };

const INVISIBLE = /[­؜​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

/** Written with its country code: "+…", "00…", or a tel: / wa.me link. */
export function hasCountryCode(raw: string): boolean {
  const text = raw.replace(INVISIBLE, "").replace(/＋/g, "+").trim();
  return /^(?:\+|00\s*[1-9]|tel:\s*\+|https?:\/\/(?:api\.)?wa\.me\/\d)/i.test(text);
}

/**
 * What the clean-up does with one stored phone value. `nationalDefault`: the country for numbers
 * written without a country code, only when it is certain for the row (else null).
 */
export function planPhone(stored: string | null | undefined, nationalDefault: string | null = null): PhonePlan {
  const from = stored ?? "";
  if (!from.trim()) return { status: "ok" };
  const withCode = hasCountryCode(from);
  if (!withCode && !nationalDefault) return { status: "no_country", from };
  const to = normalizePhone(from, withCode ? null : nationalDefault);
  if (!to) return { status: "invalid", from };
  return to === from ? { status: "ok" } : { status: "changed", from, to };
}

/** Channels whose value is a phone number (Telegram only when it looks like one). */
const PHONE_CHANNELS = new Set<string>(["WHATSAPP", "VIBER", "PHONE", "SMS"]);

function isPhoneEntry(channel: string, value: string): boolean {
  if (PHONE_CHANNELS.has(channel)) return true;
  return channel === "TELEGRAM" && /^\+?[\d\s().-]{6,}$/.test(value.trim());
}

export type ContactMethodsPlan = {
  /** The JSON to store (same order and fields; only phone values changed), or null when nothing changes. */
  next: unknown[] | null;
  changed: { channel: string; from: string; to: string }[];
  noCountry: { channel: string; from: string }[];
  invalid: { channel: string; from: string }[];
};

/** Listing.contactMethods: [{ channel, value, order }]. Other fields and entries are kept as they are. */
export function planContactMethods(value: unknown, nationalDefault: string | null = null): ContactMethodsPlan {
  const result: ContactMethodsPlan = { next: null, changed: [], noCountry: [], invalid: [] };
  if (!Array.isArray(value)) return result;
  let touched = false;
  const next = value.map((item) => {
    if (!item || typeof item !== "object") return item;
    const entry = item as Record<string, unknown>;
    const channel = typeof entry.channel === "string" ? entry.channel : "";
    const raw = typeof entry.value === "string" ? entry.value : "";
    if (!(CONTACT_CHANNELS as readonly string[]).includes(channel) || !raw.trim() || !isPhoneEntry(channel, raw)) return item;
    const plan = planPhone(raw, nationalDefault);
    if (plan.status === "changed") {
      touched = true;
      result.changed.push({ channel, from: plan.from, to: plan.to });
      return { ...entry, value: plan.to };
    }
    if (plan.status === "no_country") result.noCountry.push({ channel, from: plan.from });
    if (plan.status === "invalid") result.invalid.push({ channel, from: plan.from });
    return item;
  });
  if (touched) result.next = next;
  return result;
}

export type UserPhoneRow = { id: string; phoneNumber: string };
export type UserPhonePlan = {
  updates: { id: string; from: string; to: string }[];
  /** Would end up equal to another account's number: never merged, left for a person. */
  collisions: { id: string; from: string; to: string; otherId: string }[];
  noCountry: { id: string; from: string }[];
  invalid: { id: string; from: string }[];
};

/** User.phoneNumber is unique: a rewrite that would match another account (now or after its own rewrite) is skipped. */
export function planUserPhones(rows: readonly UserPhoneRow[]): UserPhonePlan {
  const plan: UserPhonePlan = { updates: [], collisions: [], noCountry: [], invalid: [] };
  const finalOwner = new Map<string, string[]>();
  const planned = new Map<string, string>();
  for (const row of rows) {
    const fix = planPhone(row.phoneNumber, null);
    const final = fix.status === "changed" ? fix.to : row.phoneNumber;
    planned.set(row.id, final);
    finalOwner.set(final, [...(finalOwner.get(final) ?? []), row.id]);
    if (fix.status === "no_country") plan.noCountry.push({ id: row.id, from: fix.from });
    if (fix.status === "invalid") plan.invalid.push({ id: row.id, from: fix.from });
  }
  for (const row of rows) {
    const to = planned.get(row.id)!;
    if (to === row.phoneNumber) continue;
    const owners = finalOwner.get(to) ?? [];
    const otherId = owners.find((id) => id !== row.id);
    if (otherId) plan.collisions.push({ id: row.id, from: row.phoneNumber, to, otherId });
    else plan.updates.push({ id: row.id, from: row.phoneNumber, to });
  }
  return plan;
}

// ─── Titles ──────────────────────────────────────────────────────

export type TitlePlan = { status: "ok" } | { status: "changed"; from: string; to: string } | { status: "empty"; from: string };

/** A title without emoji. A title that would be empty is left for its owner. */
export function planTitle(title: string | null | undefined): TitlePlan {
  const from = title ?? "";
  if (!from) return { status: "ok" };
  const to = stripTitleEmoji(from);
  if (to === from) return { status: "ok" };
  if (!to.trim()) return { status: "empty", from };
  return { status: "changed", from, to };
}

// ─── Showing examples ────────────────────────────────────────────

/** "+995555123456" → "+9955•••••56": the country part and the last 2 digits only. */
export function maskPhone(value: string): string {
  const text = value.replace(INVISIBLE, "").trim();
  const digits = text.replace(/\D/g, "");
  if (digits.length < 6) return "•".repeat(Math.max(digits.length, 3));
  const plus = text.startsWith("+") ? "+" : text.startsWith("00") ? "00" : "";
  const body = plus === "00" ? digits.slice(2) : digits;
  const head = body.slice(0, Math.min(4, body.length - 4));
  const tail = body.slice(-2);
  return `${plus}${head}${"•".repeat(Math.max(body.length - head.length - tail.length, 1))}${tail}`;
}

/** At most `max` characters, with an ellipsis. */
export function shorten(text: string, max = 48): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}…`;
}

/** How many examples a dry run shows. */
export const EXAMPLE_LIMIT = 5;
