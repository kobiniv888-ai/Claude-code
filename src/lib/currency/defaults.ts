import type { CurrencyCode } from "@/config/site";

/**
 * Interface languages whose visitors expect a currency of their own when they have not chosen one
 * (no cookie, no account setting). Hebrew → ₪ ILS: prices must feel Israel-friendly. Pure.
 */
export const DEFAULT_CURRENCY_BY_LOCALE: Readonly<Record<string, CurrencyCode>> = { he: "ILS" };

export function defaultCurrencyForLocale(locale: string | null | undefined): CurrencyCode | null {
  return (locale && DEFAULT_CURRENCY_BY_LOCALE[locale]) || null;
}
