/**
 * Phone numbers: ONE way to store them and ONE way to link to them (brief round 3, section 2.5).
 * Pure and client-safe.
 *
 *   normalizePhone("+972 053-123-4567")        // "+972531234567"  (E.164, no national 0)
 *   normalizePhone("0531234567", "IL")         // "+972531234567"
 *   normalizePhone("+9950555123456")           // "+995555123456"
 *   whatsappHref("+972531234567", "Hi")        // "https://wa.me/972531234567?text=Hi"
 *   telHref("+995555123456")                   // "tel:+995555123456"
 *
 * Every save path stores normalizePhone(...) and every wa.me / tel: link is built here. The metadata
 * is libphonenumber-js "min" (the same module react-phone-number-input loads, so a page that already
 * has the phone field pays nothing extra). Exact validation for login codes stays in
 * src/lib/auth/phone.ts (server, "max" metadata).
 *
 * Existing rows are not changed here: planPhoneFix() is the pure rule the clean-up's dry run and
 * run use (brief 2.5, PLAN decision 8).
 */
import {
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumberFromString,
  type CountryCode,
  type PhoneNumber,
} from "libphonenumber-js/core";
import metadata from "libphonenumber-js/min/metadata";

export type { CountryCode as PhoneCountry };

/** Bidi marks, zero-width characters and other invisible characters copied along with numbers from RTL text. */
const INVISIBLE = /[\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
const MAX_INPUT_LENGTH = 40;

function asCountry(value: string | null | undefined): CountryCode | undefined {
  const code = value?.trim().toUpperCase();
  return code && isSupportedCountry(code as CountryCode, metadata) ? (code as CountryCode) : undefined;
}

/** The raw text as libphonenumber should see it: no invisible marks, "00…" as "+…", "+ 972" as "+972". */
function cleanInput(raw: string): string {
  let text = raw.replace(INVISIBLE, "").replace(/\uFF0B/g, "+").trim();
  // Fullwidth and Arabic-Indic digits → 0-9 (libphonenumber handles them, but the "00" check below needs ASCII).
  text = text.replace(/[\u0660-\u0669\u06F0-\u06F9\uFF10-\uFF19]/g, (d) => {
    const code = d.charCodeAt(0);
    const zero = code >= 0xff10 ? 0xff10 : code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - zero);
  });
  // A pasted link ("tel:+995…", "https://wa.me/972…") keeps only the number.
  text = text.replace(/^(?:tel:|sms:|https?:\/\/(?:api\.)?wa\.me\/)/i, "").replace(/[?#].*$/, "");
  // wa.me numbers are international without the "+".
  if (/^\d{8,15}$/.test(text) && /^https?:/i.test(raw.trim())) text = `+${text}`;
  // "00 972 …": the international call prefix used in Israel, Georgia and Europe.
  text = text.replace(/^00\s*(?=[1-9])/, "+");
  return text.replace(/^\+\s+/, "+");
}

/** The text without bidi marks and zero-width characters (pasted from RTL apps along with numbers or codes). */
export function stripInvisible(text: string): string {
  return text.replace(INVISIBLE, "");
}

/**
 * A pasted search query as a phone number reads (the admin search): invisible marks gone,
 * fullwidth and Arabic-Indic digits as 0-9, "tel:" / "sms:" / wa.me links reduced to the number,
 * "00…" as "+…". Not a validation: the caller decides whether it looks like a number.
 */
export function cleanPhoneQuery(raw: string): string {
  return cleanInput(raw);
}

function parse(raw: unknown, defaultCountry?: string | null): PhoneNumber | undefined {
  if (typeof raw !== "string") return undefined;
  const text = cleanInput(raw);
  if (!text || text.length > MAX_INPUT_LENGTH || !/\d/.test(text)) return undefined;
  try {
    return parsePhoneNumberFromString(text, { defaultCountry: asCountry(defaultCountry), extract: false }, metadata);
  } catch {
    return undefined;
  }
}

/**
 * Any way a person writes a phone number → E.164 without the national 0 ("+972531234567"), or null
 * when it cannot be a phone number. `defaultCountry` (ISO, "IL" / "GE") is used only for numbers
 * written without a country code ("053-123-4567"). The number only has to be possible (right
 * length); forms check validity separately.
 */
export function normalizePhone(raw: unknown, defaultCountry?: string | null): string | null {
  const parsed = parse(raw, defaultCountry);
  return parsed && parsed.isPossible() ? parsed.number : null;
}

/** Possible AND valid for its country (min metadata: right length and leading digits). */
export function isValidPhone(raw: unknown, defaultCountry?: string | null): boolean {
  const parsed = parse(raw, defaultCountry);
  return !!parsed && parsed.isValid();
}

/** The country a number belongs to ("IL"), or null. */
export function phoneCountry(raw: unknown, defaultCountry?: string | null): CountryCode | null {
  return parse(raw, defaultCountry)?.country ?? null;
}

/** "+972 53 123 4567" for showing a stored number (falls back to the input as given). */
export function formatPhoneForDisplay(raw: string, defaultCountry?: string | null): string {
  const parsed = parse(raw, defaultCountry);
  return parsed && parsed.isPossible() ? parsed.formatInternational() : raw;
}

/** "+972" for a country ("IL"), or null. */
export function callingCodeOf(country: string | null | undefined): string | null {
  const code = asCountry(country);
  return code ? `+${getCountryCallingCode(code, metadata)}` : null;
}

/** https://wa.me/972531234567 (with ?text= when a message is given), or null when the number is unusable. */
export function whatsappHref(raw: unknown, text?: string | null, defaultCountry?: string | null): string | null {
  const phone = normalizePhone(raw, defaultCountry);
  if (!phone) return null;
  const digits = phone.slice(1);
  return text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}`;
}

/**
 * tel:+995555123456. Short service numbers that are not phone numbers in the E.164 sense
 * ("112", "*5050") are dialled as written.
 */
export function telHref(raw: unknown, defaultCountry?: string | null): string | null {
  const phone = normalizePhone(raw, defaultCountry);
  if (phone) return `tel:${phone}`;
  if (typeof raw !== "string") return null;
  const short = cleanInput(raw).replace(/[\s()-]/g, "");
  return /^[*#]?\d{3,6}#?$/.test(short) ? `tel:${encodeURIComponent(short)}` : null;
}

/** sms:+995555123456 (with ?body= when a message is given), or null. */
export function smsHref(raw: unknown, text?: string | null, defaultCountry?: string | null): string | null {
  const phone = normalizePhone(raw, defaultCountry);
  if (!phone) return null;
  return text ? `sms:${phone}?body=${encodeURIComponent(text)}` : `sms:${phone}`;
}

export type PhoneFix =
  /** Already E.164 without a national 0: leave the row alone. */
  | { status: "ok"; value: string }
  /** Can be rewritten to `value` (the dry run counts these; the run writes `value`). */
  | { status: "changed"; from: string; value: string }
  /** Not a usable phone number: the clean-up leaves it and lists it for a person to look at. */
  | { status: "invalid"; from: string };

/**
 * What the phone clean-up would do with one stored value (pure; no database). Empty values are
 * "ok" with value "". `defaultCountry` is the country of the row (a listing's country for its
 * contact phones; Georgia otherwise).
 */
export function planPhoneFix(stored: string | null | undefined, defaultCountry?: string | null): PhoneFix {
  const from = stored ?? "";
  if (!from.trim()) return { status: "ok", value: "" };
  const value = normalizePhone(from, defaultCountry);
  if (!value) return { status: "invalid", from };
  return value === from ? { status: "ok", value } : { status: "changed", from, value };
}
