/**
 * Number, money and date formatting — the only place the site formats them.
 * Client-safe. Every function forces Western digits (0–9) through `intlLocale()`,
 * as the brief requires (Arabic would otherwise use Arabic-Indic digits).
 */
import { siteConfig, type AppLocale, type CurrencyCode } from "@/config/site";
import { intlLocale } from "@/i18n/locale";

type Locale = AppLocale | string;
export type DateInput = Date | string | number;

/** The site's home time zone (also next-intl's default in src/i18n/request.ts). */
export const DEFAULT_TIME_ZONE = "Asia/Tbilisi";

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

function numberFormat(locale: Locale, options: Intl.NumberFormatOptions) {
  const tag = intlLocale(locale);
  return cached("n", tag, options, () => new Intl.NumberFormat(tag, options));
}

function dateFormat(locale: Locale, options: Intl.DateTimeFormatOptions) {
  const tag = intlLocale(locale);
  return cached("d", tag, options, () => new Intl.DateTimeFormat(tag, options));
}

// ─── Numbers ──────────────────────────────────────────────────

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  if (!Number.isFinite(value)) return "";
  return numberFormat(locale, options ?? {}).format(value);
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
    minimumFractionDigits = 0;
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
  const symbol = currencySymbol(currency);
  return formatter
    .formatToParts(amount)
    .map((part) => (part.type === "currency" ? symbol : part.value))
    .join("");
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
  return dateFormat(locale, withZone(withDefaults(options), calendarDate)).format(d);
}

/** "17:42" (or "5:42 PM" in English), in Georgia time unless `timeZone` is given. */
export function formatTime(date: DateInput, locale: Locale, timeZone?: string): string {
  const { date: d } = toDate(date);
  if (Number.isNaN(d.getTime())) return "";
  return dateFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: timeZone ?? DEFAULT_TIME_ZONE }).format(d);
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
  if (a.date.getTime() > b.date.getTime()) return formatter.formatRange(b.date, a.date);
  return formatter.formatRange(a.date, b.date);
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
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
  const tag = intlLocale(locale);
  const formatter = cached("r", tag, {}, () => new Intl.RelativeTimeFormat(tag, { numeric: "auto" }));

  if (abs < 45) return formatter.format(0, "second");
  // The largest unit that fits at least once: 50 minutes → "50 minutes ago", 3 days → "3 days ago".
  const [unit, seconds] = RELATIVE_UNITS.find(([, s]) => abs >= s) ?? ["second", 1];
  return formatter.format(Math.trunc(diffSeconds / seconds), unit);
}
