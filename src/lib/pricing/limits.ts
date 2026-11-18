/**
 * How often a host may ask the price guide (the price step, the edit page and the "מדריך מחירים"
 * page share it): plenty for pricing a few places, too few to probe other hosts' prices by asking
 * over and over with different details.
 */
export const PRICE_GUIDE_RATE_LIMIT = { limit: 60, windowSeconds: 600 } as const;

export function priceGuideRateKey(userId: string): string {
  return `price-guide:${userId}`;
}
