/**
 * "Price far below the area" helpers (pure).
 *
 * Prices are compared on one basis per deal type, in USD:
 *   SHORT_STAY, HOTEL_ROOM → per night   MONTHLY_RENT → per month   SALE → per m²
 *
 * The reference is the median of LIVE listings in the same city and deal type (and property
 * type when there are at least MIN_PRICE_SAMPLES of them). Cities with fewer listings use
 * PRICE_BASELINES_USD below.
 */
import type { DealType, PricePeriod, PropertyType } from "@/generated/prisma/enums";

export type PriceBasis = "night" | "month" | "sqm";

export const MIN_PRICE_SAMPLES = 5;

export function priceBasis(dealType: DealType): PriceBasis {
  if (dealType === "SALE") return "sqm";
  if (dealType === "MONTHLY_RENT") return "month";
  return "night";
}

const DAYS_PER_MONTH = 30;
const WEEKS_PER_MONTH = 52 / 12;

/** The listing's price on its deal type's basis (USD), or null when it cannot be compared. */
export function comparablePrice(input: {
  dealType: DealType;
  pricePeriod: PricePeriod;
  priceUsd: number | null;
  pricePerSqmUsd: number | null;
}): number | null {
  const basis = priceBasis(input.dealType);
  if (basis === "sqm") return input.pricePerSqmUsd && input.pricePerSqmUsd > 0 ? input.pricePerSqmUsd : null;
  const price = input.priceUsd;
  if (!price || price <= 0) return null;
  if (basis === "night") {
    if (input.pricePeriod === "NIGHT") return price;
    if (input.pricePeriod === "WEEK") return price / 7;
    if (input.pricePeriod === "MONTH") return price / DAYS_PER_MONTH;
    return null;
  }
  if (input.pricePeriod === "MONTH") return price;
  if (input.pricePeriod === "WEEK") return price * WEEKS_PER_MONTH;
  if (input.pricePeriod === "NIGHT") return price * DAYS_PER_MONTH;
  return null;
}

export function median(values: readonly number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Rough typical prices in USD, used ONLY by the risk check while a city has fewer than
 * MIN_PRICE_SAMPLES live listings of a kind. They are deliberately on the low side of the
 * market (late 2026 estimates for an ordinary 1–2 bedroom flat) so that only prices under half
 * of them (siteConfig.safety.lowPriceRatio) are flagged. Never shown to visitors. Admins should
 * revisit them once the site has real listings; cities not listed use DEFAULT_PRICE_BASELINE.
 */
export const PRICE_BASELINES_USD: Record<string, Record<PriceBasis, number>> = {
  tbilisi: { night: 40, month: 550, sqm: 1000 },
  batumi: { night: 40, month: 450, sqm: 900 },
  kutaisi: { night: 28, month: 300, sqm: 550 },
  kobuleti: { night: 35, month: 350, sqm: 700 },
  gudauri: { night: 60, month: 600, sqm: 1200 },
  bakuriani: { night: 50, month: 450, sqm: 900 },
  borjomi: { night: 35, month: 350, sqm: 600 },
  kazbegi: { night: 45, month: 400, sqm: 700 },
  sighnaghi: { night: 40, month: 350, sqm: 600 },
  mestia: { night: 40, month: 350, sqm: 600 },
};
export const DEFAULT_PRICE_BASELINE: Record<PriceBasis, number> = { night: 30, month: 350, sqm: 500 };

/** Rooms in shared flats and hostel beds cost much less than whole apartments. */
const CHEAP_PROPERTY_TYPES: readonly PropertyType[] = ["ROOM", "HOSTEL"];

export function baselinePrice(citySlug: string | null | undefined, dealType: DealType, propertyType: PropertyType): number {
  const basis = priceBasis(dealType);
  const table = (citySlug && PRICE_BASELINES_USD[citySlug]) || DEFAULT_PRICE_BASELINE;
  return CHEAP_PROPERTY_TYPES.includes(propertyType) ? table[basis] * 0.5 : table[basis];
}

/** Picks the reference price: same property type → same deal type → baseline table. */
export function referencePrice(
  samples: { propertyType: PropertyType; value: number }[],
  propertyType: PropertyType,
  fallback: number,
): { value: number; source: "property_type" | "deal_type" | "baseline"; samples: number } {
  const sameType = samples.filter((s) => s.propertyType === propertyType).map((s) => s.value);
  if (sameType.length >= MIN_PRICE_SAMPLES) {
    return { value: median(sameType)!, source: "property_type", samples: sameType.length };
  }
  if (samples.length >= MIN_PRICE_SAMPLES && !CHEAP_PROPERTY_TYPES.includes(propertyType)) {
    const others = samples.filter((s) => !CHEAP_PROPERTY_TYPES.includes(s.propertyType)).map((s) => s.value);
    if (others.length >= MIN_PRICE_SAMPLES) return { value: median(others)!, source: "deal_type", samples: others.length };
  }
  return { value: fallback, source: "baseline", samples: 0 };
}
