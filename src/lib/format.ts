/**
 * Number, money and date formatting — the only place the site formats them.
 * Client-safe. Every function forces Western digits (0–9) through `intlLocale()`,
 * as the brief requires (Arabic would otherwise use Arabic-Indic digits).
 */
import { siteConfig, type AppLocale, type CurrencyCode } from "@/config/site";
import { intlLocale } from "@/i18n/locale";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/config/countries";
import {
  GEORGIAN_DATE_BASE,
  GEORGIAN_NUMBER_BASE,
  georgianCompactSuffix,
  georgianizeDateParts,
  georgianRelativeTime,
  isGeorgianLocale,
  type RelativeUnit,
} from "./format-georgian";

type Locale = AppLocale | string;
export type DateInput = Date | string | number;

/** The site's home time zone (also next-intl's default in src/i18n/request.ts): src/config/countries.ts. */
export const DEFAULT_TIME_ZONE = COUNTRIES[DEFAULT_COUNTRY].timezone;

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

const formatterCache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat | Intl.RelativeTimeFormat>();

function cached<T extends Intl.NumberFormat | Intl.DateTimeFormat | Intl.RelativeTimeFormat>(
  kind: string,
  locale: string,
  options: object,
  create: () => T,
): T {
  const key = `${kind}|${locale}|${JSON.stringify(options)}`;
  let formatter = formatterCache.get(key) as T | undefined;
  if (!formatter) {
    formatter = create();
    if (formatterCache.size > 500) formatterCache.clear();
    formatterCache.set(key, formatter);
  }
  return formatter;
}

// Georgian is never formatted by Intl directly: browsers without Georgian data (Chrome) would
// print English and break hydration. See ./format-georgian.ts.

function numberFormat(locale: Locale, options: Intl.NumberFormatOptions) {
  const tag = isGeorgianLocale(locale) ? GEORGIAN_NUMBER_BASE : intlLocale(locale);
  return cached("n", tag, options, () => new Intl.NumberFormat(tag, options));
}

function dateFormat(locale: Locale, options: Intl.DateTimeFormatOptions) {
  const tag = isGeorgianLocale(locale) ? GEORGIAN_DATE_BASE : intlLocale(locale);
  return cached("d", tag, options, () => new Intl.DateTimeFormat(tag, options));
}

/** Joins number parts; `currency` replaces the currency symbol, Georgian gets its own compact suffixes. */
function joinNumberParts(parts: Intl.NumberFormatPart[], locale: Locale, currency?: string): string {
  const georgian = isGeorgianLocale(locale);
  return parts
    .map((part) => {
      if (part.type === "currency" && currency !== undefined) return currency;
      if (part.type === "compact" && georgian) return georgianCompactSuffix(part.value);
      return part.value;
    })
    .join("");
}

/**
 * Node and browsers disagree on thin / narrow no-break spaces in dates ("1\u2009–\u20095" vs
 * "1 – 5"), which breaks hydration. Plain spaces everywhere.
 */
function normalizeSpaces(text: string): string {
  return text.replace(/[\u2009\u202F]/g, " ");
}

// ─── Numbers ──────────────────────────────────────────────────

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  if (!Number.isFinite(value)) return "";
  return joinNumberParts(numberFormat(locale, options ?? {}).formatToParts(value), locale);
}

/** Symbols we always show (Intl would print "ლ" for GEL in Russian or "US$" in Arabic). */
const CURRENCY_SYMBOLS = Object.fromEntries(
  siteConfig.currencies.list.map((c) => [c.code, c.symbol]),
) as Record<CurrencyCode, string>;

export function currencySymbol(currency: CurrencyCode): string {
  return CURRENCY_SYMBOLS[currency] ?? currency;
}

export type FormatMoneyOptions = {
  /** Default: 0 for amounts ≥ 100 or whole numbers, otherwise 2. */
  maximumFractionDigits?: number;
  /** With maximumFractionDigits: at least this many (default 0), e.g. 2 for exact cents ("$519.50"). */
  minimumFractionDigits?: number;
  /** Short form for big numbers: "$1.3M", "₪450K". */
  compact?: boolean;
};

/**
 * "₾1,250", "‏1,250 ‏₪", "$1.3M". Symbols are ₾ $ ₪ € £ in every language.
 * Wrap the result in <Ltr> when it sits inside Hebrew/Arabic text.
 */
export function formatMoney(
  amount: number,
  currency: CurrencyCode,
  locale: Locale,
  options: FormatMoneyOptions = {},
): string {
  if (!Number.isFinite(amount)) return "";
  const { compact = false } = options;

  let maximumFractionDigits: number;
  let minimumFractionDigits: number;
  if (options.maximumFractionDigits !== undefined) {
    maximumFractionDigits = Math.max(0, Math.min(20, Math.trunc(options.maximumFractionDigits)));
    minimumFractionDigits = Math.max(0, Math.min(maximumFractionDigits, Math.trunc(options.minimumFractionDigits ?? 0)));
  } else if (compact) {
    maximumFractionDigits = 1;
    minimumFractionDigits = 0;
  } else {
    const whole = Number.isInteger(amount) || Math.abs(amount) >= 100;
    maximumFractionDigits = whole ? 0 : 2;
    minimumFractionDigits = maximumFractionDigits;
  }

  const formatter = numberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits,
    maximumFractionDigits,
    ...(compact ? { notation: "compact" as const } : {}),
  });
  const parts = formatter.formatToParts(amount);
  const base = String(locale).split("-")[0];
  if (base === "he" || (base === "ar" && !compact)) return symbolFirst(parts, currencySymbol(currency));
  return joinNumberParts(parts, locale, currencySymbol(currency));
}

const BIDI_MARKS_AND_SPACES = /[\u200e\u200f\u061c\u2066-\u2069\s]/g;

/**
 * Hebrew and Arabic money as "₪290" / "$1,250": the symbol right before the number, with no
 * direction marks. Intl's "‏290 ‏$" reads "290$" inside a left-to-right island but "$ 290" in
 * running right-to-left text; this form reads the same everywhere (one style on the whole site).
 */
function symbolFirst(parts: Intl.NumberFormatPart[], symbol: string): string {
  const number = parts
    .filter((part) => part.type !== "currency" && part.type !== "minusSign")
    .map((part) => part.value)
    .join("")
    .replace(BIDI_MARKS_AND_SPACES, "");
  const negative = parts.some((part) => part.type === "minusSign");
  return `${negative ? "-" : ""}${symbol}${number}`;
}

/** Unit label for square meters in each language. */
const SQUARE_METERS: Record<AppLocale, string> = {
  he: "מ״ר",
  en: "m²",
  ru: "м²",
  ar: "م²",
  ka: "მ²",
};

/** "85 m²", "85 מ״ר". */
export function formatArea(sqm: number, locale: Locale): string {
  if (!Number.isFinite(sqm)) return "";
  const unit = SQUARE_METERS[locale as AppLocale] ?? SQUARE_METERS.en;
  return `${formatNumber(sqm, locale, { maximumFractionDigits: 1 })} ${unit}`;
}

// ─── Dates ────────────────────────────────────────────────────

/**
 * Accepts a Date, a timestamp or an ISO string. A plain "YYYY-MM-DD" string is a calendar
 * date (check-in day, move-in date…) and is always shown as that same day.
 */
function toDate(input: DateInput): { date: Date; calendarDate: boolean } {
  if (typeof input === "string" && CALENDAR_DATE.test(input)) {
    return { date: new Date(`${input}T00:00:00Z`), calendarDate: true };
  }
  return { date: input instanceof Date ? input : new Date(input), calendarDate: false };
}

function withZone(options: Intl.DateTimeFormatOptions, calendarDate: boolean): Intl.DateTimeFormatOptions {
  if (options.timeZone) return options;
  return { ...options, timeZone: calendarDate ? "UTC" : DEFAULT_TIME_ZONE };
}

const DEFAULT_DATE: Intl.DateTimeFormatOptions = { dateStyle: "medium" };
const DATE_PARTS = [
  "dateStyle", "timeStyle", "weekday", "era", "year", "month", "day",
  "hour", "minute", "second", "dayPeriod", "fractionalSecondDigits", "timeZoneName",
] as const;

/** Options without any date/time part (e.g. only `timeZone`) keep the medium-date default. */
function withDefaults(options: Intl.DateTimeFormatOptions | undefined): Intl.DateTimeFormatOptions {
  if (!options) return DEFAULT_DATE;
  return DATE_PARTS.some((part) => options[part] !== undefined) ? options : { ...DEFAULT_DATE, ...options };
}

/** "Oct 31, 2026" (medium date by default). Pass `timeZone` to show another zone. */
export function formatDate(date: DateInput, locale: Locale, options?: Intl.DateTimeFormatOptions): string {
  const { date: d, calendarDate } = toDate(date);
  if (Number.isNaN(d.getTime())) return "";
  const opts = withZone(withDefaults(options), calendarDate);
  const formatter = dateFormat(locale, opts);
  if (isGeorgianLocale(locale)) return normalizeSpaces(georgianizeDateParts(formatter.formatToParts(d), opts, d));
  return normalizeSpaces(formatter.format(d));
}

/** "17:42" (or "5:42 PM" in English), in Georgia time unless `timeZone` is given. */
export function formatTime(date: DateInput, locale: Locale, timeZone?: string): string {
  const { date: d } = toDate(date);
  if (Number.isNaN(d.getTime())) return "";
  return normalizeSpaces(
    dateFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: timeZone ?? DEFAULT_TIME_ZONE }).format(d),
  );
}

/** "Oct 1 – 5, 2026". */
export function formatDateRange(
  start: DateInput,
  end: DateInput,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions,
): string {
  const a = toDate(start);
  const b = toDate(end);
  if (Number.isNaN(a.date.getTime()) || Number.isNaN(b.date.getTime())) return "";
  const opts = withZone(withDefaults(options), a.calendarDate && b.calendarDate);
  const formatter = dateFormat(locale, opts);
  const [from, to] = a.date.getTime() > b.date.getTime() ? [b.date, a.date] : [a.date, b.date];
  if (isGeorgianLocale(locale)) {
    return normalizeSpaces(georgianizeDateParts(formatter.formatRangeToParts(from, to), opts, from, to));
  }
  return normalizeSpaces(formatter.formatRange(from, to));
}

const RELATIVE_UNITS: [RelativeUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

/** "3 days ago", "in 2 hours", "yesterday", "now". */
export function formatRelativeTime(date: DateInput, locale: Locale, now: Date = new Date()): string {
  const { date: d } = toDate(date);
  if (Number.isNaN(d.getTime())) return "";
  const diffSeconds = (d.getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diffSeconds);
  // The largest unit that fits at least once: 50 minutes → "50 minutes ago", 3 days → "3 days ago".
  const [unit, seconds]: [RelativeUnit, number] =
    abs < 45 ? ["second", 1] : (RELATIVE_UNITS.find(([, s]) => abs >= s) ?? ["second", 1]);
  const value = abs < 45 ? 0 : Math.trunc(diffSeconds / seconds);

  if (isGeorgianLocale(locale)) return georgianRelativeTime(value, unit, (n) => formatNumber(n, locale));
  const tag = intlLocale(locale);
  const formatter = cached("r", tag, {}, () => new Intl.RelativeTimeFormat(tag, { numeric: "auto" }));
  const text = formatter.format(value, unit);
  // Newer CLDR data (ICU 78) writes the Hebrew one/two forms with the count in brackets:
  // "לפני שעתיים (2)". The word already says the number; an older ICU (a browser) has no brackets,
  // so server and browser text match.
  return locale === "he" ? text.replace(/\s*\(\d+\)$/u, "") : text;
}

/**
 * A name or other user text inside a translated sentence, isolated from it (FSI … PDI), so a Latin
 * or Georgian name in a Hebrew sentence keeps its punctuation and doesn't pull a following number
 * ("Demo Admin, 4 בנוב׳") into its own direction. For a plain string argument; in JSX use
 * <bdi dir="auto">.
 */
export function isolate(text: string): string {
  return `\u2068${text}\u2069`;
}

/** Left-to-right text inside a sentence (LRI … PDI): signed numbers such as "+15" in RTL text. */
export function isolateLtr(text: string): string {
  return `\u2066${text}\u2069`;
}
