/**
 * Currency conversion (client-safe, pure).
 * Rates are "units per 1 USD" (USD = 1, GEL ≈ 2.7, ILS ≈ 3.7…), refreshed daily on the server.
 */
import { currencyCodes, siteConfig, type CurrencyCode } from "@/config/site";

export type Rates = Record<CurrencyCode, number>;

export const FALLBACK_RATES: Rates = { ...siteConfig.currencies.fallbackRatesPerUsd };

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && (currencyCodes as readonly string[]).includes(value);
}

/** Currencies visitors can pick (siteConfig.currencies.list with enabled: true), in switcher order. */
export const enabledCurrencies: readonly CurrencyCode[] = siteConfig.currencies.list
  .filter((c) => c.enabled)
  .map((c) => c.code);

export function isEnabledCurrency(value: unknown): value is CurrencyCode {
  return isCurrencyCode(value) && enabledCurrencies.includes(value);
}

function rateFor(currency: CurrencyCode, rates: Partial<Rates> | null | undefined): number {
  const rate = rates?.[currency];
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : FALLBACK_RATES[currency];
}

/** Amount in USD. */
export function toUsd(amount: number, from: CurrencyCode, rates: Partial<Rates> | null | undefined): number {
  return amount / rateFor(from, rates);
}

/** Converts `amount` from one currency to another (approximate; for display only). */
export function convert(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rates: Partial<Rates> | null | undefined,
): number {
  if (from === to) return amount;
  return toUsd(amount, from, rates) * rateFor(to, rates);
}

/**
 * Cleans rates from any source (database JSON, API): keeps positive numbers for our
 * currencies and fills the rest from the fallback table. USD is always 1.
 */
export function normalizeRates(input: unknown): Rates {
  const out: Rates = { ...FALLBACK_RATES };
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    for (const code of currencyCodes) {
      const value = Number(record[code]);
      if (Number.isFinite(value) && value > 0) out[code] = value;
    }
  }
  out.USD = 1;
  return out;
}
