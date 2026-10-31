/**
 * The price slider in the filters (pure). Prices are typed in the visitor's DISPLAY currency,
 * so the slider's top and step follow the deal type and that currency.
 *
 *   priceSliderConfig("monthly", "ILS", rates) → { max: 35000, step: 500 }
 */
import type { CurrencyCode } from "@/config/site";
import { convert, type Rates } from "@/lib/currency/convert";
import type { DealFilter } from "@/lib/listing/search-params";

/** The top of the slider in USD per deal (above it the slider shows "max+"). */
const MAX_USD: Record<DealFilter, number> = {
  "short-stay": 600,
  hotels: 600,
  monthly: 5000,
  rent: 5000,
  buy: 1_000_000,
};

/** A "nice" step: 1, 2 or 5 × 10ⁿ, so the slider moves in round amounts. */
export function niceStep(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const fraction = value / base;
  const nice = fraction < 1.5 ? 1 : fraction < 3.5 ? 2 : fraction < 7.5 ? 5 : 10;
  return nice * base;
}

export type PriceSliderConfig = { min: 0; max: number; step: number };

/** Slider range for a deal in `currency`. Null when no deal is chosen (nightly and sale prices do not mix). */
export function priceSliderConfig(
  deal: DealFilter | null,
  currency: CurrencyCode,
  rates: Rates,
): PriceSliderConfig | null {
  if (!deal) return null;
  const rawMax = convert(MAX_USD[deal], "USD", currency, rates);
  const step = niceStep(rawMax / 100);
  const max = Math.max(step, Math.ceil(rawMax / step) * step);
  return { min: 0, max, step };
}

/** The slider thumbs for a min/max filter: null min → 0, null (or too high) max → the top. */
export function sliderValue(
  priceMin: number | null,
  priceMax: number | null,
  config: PriceSliderConfig,
): [number, number] {
  const low = Math.min(Math.max(0, priceMin ?? 0), config.max);
  const high = priceMax === null ? config.max : Math.min(Math.max(low, priceMax), config.max);
  return [low, high];
}

/** Filter values for slider thumbs: 0 → no minimum, the top → no maximum. */
export function fromSliderValue([low, high]: readonly number[], config: PriceSliderConfig): {
  priceMin: number | null;
  priceMax: number | null;
} {
  return {
    priceMin: low > 0 ? low : null,
    priceMax: high < config.max ? high : null,
  };
}
