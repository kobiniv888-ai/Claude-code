/**
 * The price histogram above the price slider in the filters sheet (pure, client-safe).
 * Buckets cover the slider's range [0, max] in the visitor's display currency; prices at or above
 * the top of the slider fall into the last bar (it reads "max+", like the slider).
 *
 *   bucketPrices([120, 480, 950], 1000, 4) → [1, 1, 0, 1]
 */

/** Bars in the histogram (about one per slider step group, like the references). */
export const HISTOGRAM_BARS = 24;

export type PriceHistogram = {
  /** The top of the slider the buckets were computed for (display currency). */
  max: number;
  /** Listings per bar, from the cheapest bar to the "max+" bar. */
  buckets: number[];
  /** Listings with a price that the bars count. */
  total: number;
};

/** Counts prices into `bars` equal buckets over [0, max]; prices ≥ max go into the last bar. */
export function bucketPrices(prices: readonly number[], max: number, bars: number = HISTOGRAM_BARS): number[] {
  const count = Math.max(1, Math.trunc(bars));
  const buckets = new Array<number>(count).fill(0);
  if (!Number.isFinite(max) || max <= 0) return buckets;
  const width = max / count;
  for (const price of prices) {
    if (!Number.isFinite(price) || price < 0) continue;
    const index = Math.min(count - 1, Math.floor(price / width));
    buckets[index] += 1;
  }
  return buckets;
}

/** Heights of the bars as fractions of the tallest bar (0 → 0; any listing → at least `floor`). */
export function barHeights(buckets: readonly number[], floor = 0.06): number[] {
  const top = Math.max(0, ...buckets);
  if (top === 0) return buckets.map(() => 0);
  return buckets.map((n) => (n === 0 ? 0 : Math.max(floor, n / top)));
}

/** Whether a bar lies inside the selected price range (for the highlighted bars). */
export function barInRange(index: number, bars: number, max: number, [low, high]: readonly [number, number]): boolean {
  const width = max / bars;
  const start = index * width;
  // The last bar holds "max+", and a range up to the top of the slider has no maximum.
  const end = index === bars - 1 ? Infinity : start + width;
  const top = high >= max ? Infinity : high;
  return end > low && start < top;
}
