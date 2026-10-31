/**
 * Finds contact details hidden in listing text (pure, client-safe — the wizard can warn while
 * the owner types). Owners must use the contact methods step instead: numbers and links in the
 * description bypass "Show contact" protection and are a common scam pattern.
 *
 *   detectContactInfo("Call +995 555 12 34 56 or t.me/flat_owner")
 *   → { phones: ["+995555123456"], urls: ["t.me/flat_owner"], emails: [], handles: [] }
 *
 * Catches spaced, dotted and dashed digits ("0 5 4 1 2 3 4 5 6 7"), Arabic-Indic and full-width
 * digits, invisible characters inserted between digits, wa.me / t.me / viber links, "@username",
 * emails (also "name (at) gmail (dot) com"), and URLs with or without "https://".
 * Avoids prices (next to a currency), areas (m², кв.м, מ"ר), dates, years, Georgian cadastral
 * codes, floors and listing IDs: a run of digits only counts as a phone number when it has
 * 9–15 digits AND is a valid number for Georgia, Israel, Russia, Ukraine or in international form —
 * or when it is deliberately spelled out digit by digit.
 */
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

export type ContactInfoFindings = {
  phones: string[];
  urls: string[];
  emails: string[];
  handles: string[];
};

export function hasContactInfo(findings: ContactInfoFindings): boolean {
  return (
    findings.phones.length + findings.urls.length + findings.emails.length + findings.handles.length > 0
  );
}

// ─── Normalization ────────────────────────────────────────────

/** Soft hyphen, zero-width characters, bidi marks/isolates and BOM — used to break up numbers. */
const INVISIBLE = /[­​-‏‪-‮⁠-⁩﻿]/g;

const AT_WORDS = ["at", "את", "собака", "ат", "ات", "ეთ"];
const DOT_WORDS = ["dot", "נקודה", "точка", "نقطة", "نقطه", "წერტილი"];

function bracketed(words: string[]): RegExp {
  return new RegExp(`\\s*[(\\[{<]\\s*(?:${words.join("|")}|@|\\.)\\s*[)\\]}>]\\s*`, "giu");
}
const BRACKETED_AT = bracketed(AT_WORDS);
const BRACKETED_DOT = bracketed(DOT_WORDS);

export function normalizeForContactScan(text: string): string {
  return (
    text
      // Full-width letters and digits → ASCII ("５５５", "ｗａ．ｍｅ").
      .normalize("NFKC")
      .replace(INVISIBLE, "")
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(BRACKETED_AT, "@")
      .replace(BRACKETED_DOT, ".")
  );
}

// ─── Emails, URLs, handles ────────────────────────────────────

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}/g;

const SCHEME_URL = /\b(?:https?|ftp|viber|whatsapp|tg|skype|tel|sms):(?:\/\/)?[^\s<>"'`]+/gi;
const WWW_URL = /\bwww\.[^\s<>"'`]+/gi;

/** TLDs that are never ordinary words: "mysite.ge", "rent.com". */
const STRONG_TLDS =
  "com|net|org|info|biz|io|ly|ge|il|ru|ua|by|kz|su|xyz|site|online|store|shop|top|link|club|live|app|dev|website|space|realty|estate|apartments|rentals|рф";
/** TLDs that are also words ("flat.it is…", "go.to"): only with a path ("site.it/flat"). */
const WEAK_TLDS = "me|to|it|us|am|az|tr|ae|de|fr|es|nl|eu|ca|au|tv|gl|gg|cc|pro|page|house|homes|rent|travel|be|co|uk";
/** Short links and messenger hosts that are contact details on their own. */
const KNOWN_HOSTS =
  "wa\\.me|t\\.me|telegram\\.me|m\\.me|fb\\.me|ig\\.me|chat\\.whatsapp\\.com|invite\\.viber\\.com|vb\\.me|bit\\.ly|goo\\.gl|tinyurl\\.com|youtu\\.be|linktr\\.ee";

const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const PATH = "(?:[/?#][^\\s<>\"'`]*)";
const KNOWN_HOST_URL = new RegExp(`(?<![\\w@.-])(?:${KNOWN_HOSTS})${PATH}?`, "giu");
const STRONG_DOMAIN_URL = new RegExp(`(?<![\\w@.-])(?:${LABEL}\\.)+(?:${STRONG_TLDS})(?![\\w-])${PATH}?`, "giu");
const WEAK_DOMAIN_URL = new RegExp(`(?<![\\w@.-])(?:${LABEL}\\.)+(?:${WEAK_TLDS})(?![\\w-])${PATH}`, "giu");

const HANDLE = /(?<![\p{L}\p{N}_.@/])@([A-Za-z0-9_](?:[A-Za-z0-9_.]{1,30}[A-Za-z0-9_])?)(?![\p{L}\p{N}_@])/gu;

/** Trailing punctuation that belongs to the sentence, not the link. */
function trimUrl(url: string): string {
  return url.replace(/[.,;:!?)\]}»"'’”]+$/u, "");
}

type Span = { start: number; end: number };

function overlaps(spans: Span[], start: number, end: number): boolean {
  return spans.some((s) => start < s.end && end > s.start);
}

// ─── Phones ───────────────────────────────────────────────────

/** Digits with up to 3 separator characters between them (spaces, dots, dashes, brackets, slashes…). */
const DIGIT_RUN = /(?:\+|\b00)?\d(?:[ \t .\-‐-―()/_*·•|]{0,3}\d)+/g;

const CURRENCY_AFTER =
  /^\s{0,2}(?:[₾$€₪£]|gel\b|usd\b|eur\b|ils\b|nis\b|lari|ლარ|лари|лар|дол|руб|евро|шек|ש"ח|ש״ח|שח\b|שקל|דולר|יורו|دولار|لاري|شيكل|يورو|dollars?|euros?|shekels?)/iu;
const CURRENCY_BEFORE = /(?:[₾$€₪£]|gel|usd|eur|ils|nis|price|цена|מחיר|سعر|ფასი)\s{0,2}:?\s{0,2}$/iu;
const UNIT_AFTER =
  /^\s{0,2}(?:m2|m\^2|sq\.?\s?m|sqm|sq\.?\s?ft|кв\.?\s?м|м2|мкв|מ"ר|מ״ר|מטר|م2|متر|მ2|კვ\.?\s?მ|km|км|ק"מ|ק״מ|كم|კმ|ha|га|דונם|соток)/iu;

const DATE_RUN = /^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}(?:\s*[-–—]\s*\d{1,4}[./-]\d{1,2}[./-]\d{1,4})?$/;
/** Georgian cadastral code, e.g. 01.14.14.009.033 or 01.14.14.009.033.01.500 */
const CADASTRAL_RUN = /^\d{2}\.\d{2}\.\d{2}\.\d{3}\.\d{3}(?:\.\d{2}\.\d{3})?$/;
const YEAR = /^(?:19|20)\d{2}$/;

/**
 * Georgians write mobiles without a trunk 0 ("555 12 34 56"), Israelis with one ("054-1234567"),
 * so a leading 0 is tried as Israeli first.
 */
const PHONE_COUNTRIES: CountryCode[] = ["GE", "IL", "RU", "UA"];
const PHONE_COUNTRIES_TRUNK_ZERO: CountryCode[] = ["IL", "GE", "RU", "UA"];

function validPhone(digits: string, international: boolean): string | null {
  if (international) {
    const parsed = parsePhoneNumberFromString(`+${digits}`);
    return parsed && parsed.isValid() ? parsed.number : null;
  }
  for (const country of digits.startsWith("0") ? PHONE_COUNTRIES_TRUNK_ZERO : PHONE_COUNTRIES) {
    const parsed = parsePhoneNumberFromString(digits, country);
    if (parsed && parsed.isValid()) return parsed.number;
  }
  return null;
}

/** "0 5 4 1 2 3 4 5 6 7" / "5.9.9.1.2.3" — digits spelled out one by one to dodge filters. */
function isSpelledOut(groups: string[]): boolean {
  return groups.filter((g) => g.length === 1).length >= 6;
}

function evaluateRun(run: string, before: string, after: string): string | null {
  const international = run.startsWith("+") || run.startsWith("00");
  const body = run.startsWith("00") ? run.slice(2) : run;
  const digits = body.replace(/\D/g, "");
  if (digits.length < 9) return null;

  const core = run.replace(/^\+/, "").trim();
  if (DATE_RUN.test(core) || CADASTRAL_RUN.test(core)) return null;
  const groups = core.split(/\D+/).filter(Boolean);
  if (groups.length > 1 && groups.every((g) => YEAR.test(g))) return null;
  if (!international && (CURRENCY_AFTER.test(after) || CURRENCY_BEFORE.test(before) || UNIT_AFTER.test(after))) {
    return null;
  }

  if (digits.length > 15) {
    // Probably several numbers in a row — check each part between wider separators.
    const parts = run.split(/\s*[/,|]\s*|\s+[-–—]\s+|\s{2,}/).filter(Boolean);
    if (parts.length > 1) {
      for (const part of parts) {
        const found = evaluateRun(part, "", "");
        if (found) return found;
      }
    }
    return isSpelledOut(groups) ? digits : null;
  }

  const phone = validPhone(digits, international);
  if (phone) return phone;
  return isSpelledOut(groups) ? (international ? `+${digits}` : digits) : null;
}

// ─── Public API ───────────────────────────────────────────────

export function detectContactInfo(text: string | null | undefined): ContactInfoFindings {
  const findings: ContactInfoFindings = { phones: [], urls: [], emails: [], handles: [] };
  if (!text) return findings;
  const value = normalizeForContactScan(text);
  const taken: Span[] = [];
  const add = (list: string[], item: string) => {
    if (item && !list.includes(item)) list.push(item);
  };

  for (const match of value.matchAll(EMAIL)) {
    const start = match.index ?? 0;
    taken.push({ start, end: start + match[0].length });
    add(findings.emails, match[0].toLowerCase());
  }

  for (const pattern of [SCHEME_URL, WWW_URL, KNOWN_HOST_URL, STRONG_DOMAIN_URL, WEAK_DOMAIN_URL]) {
    for (const match of value.matchAll(pattern)) {
      const start = match.index ?? 0;
      const url = trimUrl(match[0]);
      const end = start + url.length;
      if (url.length < 4 || overlaps(taken, start, end)) continue;
      taken.push({ start, end });
      add(findings.urls, url);
    }
  }

  for (const match of value.matchAll(HANDLE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const name = match[1];
    if (!/[A-Za-z]/.test(name) || overlaps(taken, start, end)) continue;
    taken.push({ start, end });
    add(findings.handles, `@${name}`);
  }

  for (const match of value.matchAll(DIGIT_RUN)) {
    const start = match.index ?? 0;
    const run = match[0];
    const end = start + run.length;
    if (overlaps(taken, start, end)) continue;
    // Part of a longer word or code ("A12345678", "ID-123456789" is still caught by the ID rule below).
    const prev = value[start - 1] ?? "";
    if (/[\p{L}_]/u.test(prev) && !run.startsWith("+")) continue;
    const before = value.slice(Math.max(0, start - 12), start);
    if (/(?:\bid|#|№|מס'|מספר מודעה|номер объявления)\s*[:.]?\s*$/iu.test(before)) continue;
    const phone = evaluateRun(run, before, value.slice(end, end + 12));
    if (phone) {
      taken.push({ start, end });
      add(findings.phones, phone);
    }
  }

  return findings;
}
