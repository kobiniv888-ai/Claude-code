import { locales, rtlLocales, type AppLocale, type Localized } from "@/config/site";

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function isRtl(locale: AppLocale | string): boolean {
  return (rtlLocales as readonly string[]).includes(locale);
}

export function dirFor(locale: AppLocale | string): "rtl" | "ltr" {
  return isRtl(locale) ? "rtl" : "ltr";
}

/**
 * Locale string for Intl APIs. Forces Western digits (0–9) everywhere,
 * as the brief requires (Arabic would otherwise default to Arabic-Indic digits).
 */
export function intlLocale(locale: AppLocale | string): string {
  return `${locale}-u-nu-latn`;
}

/**
 * Pick the value for `locale` from a { he, en, ru, ar, ka } JSON field
 * (city names, FAQ items, scam alerts…). Falls back to English, then any value.
 */
export function pickLocalized(
  value: unknown,
  locale: AppLocale | string,
  fallback: AppLocale = "en",
): string {
  if (!value || typeof value !== "object") return typeof value === "string" ? value : "";
  const record = value as Partial<Localized>;
  return (
    record[locale as AppLocale] ||
    record[fallback] ||
    Object.values(record).find((v) => typeof v === "string" && v.length > 0) ||
    ""
  );
}
