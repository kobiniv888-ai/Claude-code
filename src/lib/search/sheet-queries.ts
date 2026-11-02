import "server-only";
/**
 * Server data for the search page's sheets and empty state: the price histogram of the matching
 * listings, and the one-tap fixes when nothing matches. Public data only (prices and counts).
 */
import { convert } from "@/lib/currency/convert";
import { db } from "@/lib/db";
import { countListings, type ListingQueryContext } from "@/lib/listing/queries";
import type { SearchFilters } from "@/lib/listing/search-params";
import { buildListingWhere } from "@/lib/listing/where";
import { loosenCandidates, rankLoosen, type RankedLoosenFix } from "@/lib/search/loosen";
import { bucketPrices, type PriceHistogram } from "@/lib/search/price-histogram";
import { priceSliderConfig } from "@/lib/search/price-range";
import { getSettings } from "@/lib/settings";

/** More rows than this are not read for the histogram (the shape is already clear). */
const MAX_HISTOGRAM_ROWS = 20_000;

/**
 * Prices of the listings that match every filter except the price range, bucketed over the
 * price slider's range in the display currency. Null without a deal type (nightly, monthly and
 * sale prices do not mix, so the price filter needs one).
 */
export async function getPriceHistogram(filters: SearchFilters, ctx: ListingQueryContext): Promise<PriceHistogram | null> {
  const config = priceSliderConfig(filters.deal, ctx.currency, ctx.rates);
  if (!config) return null;
  const settings = await getSettings();
  const where = buildListingWhere(
    { ...filters, priceMin: null, priceMax: null },
    { currency: ctx.currency, rates: ctx.rates, demoVisible: settings.demoDataVisible, now: new Date() },
  );
  const rows = await db.listing.findMany({
    where: { AND: [where, { priceUsd: { not: null } }] },
    select: { priceUsd: true },
    take: MAX_HISTOGRAM_ROWS,
  });
  const prices = rows.map((row) => convert(Number(row.priceUsd), "USD", ctx.currency, ctx.rates));
  return { max: config.max, buckets: bucketPrices(prices, config.max), total: prices.length };
}

/** The ways to loosen a search that bring results, most results first (counted in parallel). */
export async function rankLoosenFixes(
  filters: SearchFilters,
  ctx: ListingQueryContext,
  limit = 4,
): Promise<RankedLoosenFix[]> {
  const candidates = loosenCandidates(filters);
  if (candidates.length === 0) return [];
  const counts = await Promise.all(candidates.map((c) => countListings(c.filters, ctx).catch(() => 0)));
  return rankLoosen(candidates, counts, limit);
}
