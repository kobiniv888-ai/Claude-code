import type { CurrencyCode } from "@/config/site";

/**
 * The currency each interface language shows when the visitor has not chosen one (no cookie, no
 * account setting): Hebrew, Russian and Arabic → ₪ ILS, English → $ USD, Georgian → ₾ GEL
 * (brief section 6, PLAN decision 5). A visitor's own choice always wins. Pure.
 */
export const DEFAULT_CURRENCY_BY_LOCALE: Readonly<Record<string, CurrencyCode>> = {
  he: "ILS",
  ru: "ILS",
  ar: "ILS",
  en: "USD",
  ka: "GEL",
};

export function defaultCurrencyForLocale(locale: string | null | undefined): CurrencyCode | null {
  return (locale && DEFAULT_CURRENCY_BY_LOCALE[locale]) || null;
}
