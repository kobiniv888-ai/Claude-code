import type { CurrencyCode } from "@/config/site";
import type { FormatMoneyOptions } from "@/lib/format";

/**
 * The text of a price pill on the search map ("₪450", "₪6,200", "₪1.2M"), in the visitor's display
 * currency — the same conversion the cards use (useCurrency). Pure, client-safe.
 */

/** Converted amounts from this value are shortened ("₪1.2M"): pills must stay small. */
export const PILL_COMPACT_FROM = 100_000;

export type PillMoney = {
  /** Owner's amount → display currency (useCurrency().convert). */
  convert: (amount: number, from: CurrencyCode) => number;
  /** Converts and formats (useCurrency().format). */
  format: (amount: number, from: CurrencyCode, options?: FormatMoneyOptions) => string;
};

export function pricePillLabel(
  price: number | null,
  currency: CurrencyCode,
  money: PillMoney,
  /** Shown when there is no price ("On request"). */
  noPrice: string,
): string {
  if (price === null || !Number.isFinite(price) || price <= 0) return noPrice;
  const compact = money.convert(price, currency) >= PILL_COMPACT_FROM;
  return money.format(price, currency, compact ? { compact: true } : { maximumFractionDigits: 0 });
}
