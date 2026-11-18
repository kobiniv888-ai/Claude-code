"use server";

/**
 * Read-only data for the search page's client parts: the live count of the filters sheet
 * ("Show 123 places"), its price histogram and "nothing matches" fixes, and the map points of the
 * desktop split view. Public data only, rate-limited by IP.
 */
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { siteConfig } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { countListings, getMapPoints, type ListingQueryContext } from "@/lib/listing/queries";
import { parseSearchParams, serializeSearchQuery, type SearchFilters } from "@/lib/listing/search-params";
import type { ListingMapPoint } from "@/lib/listing/types";
import { assertRateLimitByIp } from "@/lib/rate-limit";
import { getSearchContext } from "@/lib/search/context";
import type { LoosenFix } from "@/lib/search/loosen";
import type { PriceHistogram } from "@/lib/search/price-histogram";
import { getPriceHistogram, rankLoosenFixes } from "@/lib/search/sheet-queries";

const querySchema = z.string().max(4000);

async function prepare(
  query: string,
  bucket: string,
  limit: number,
): Promise<{ filters: SearchFilters; ctx: ListingQueryContext } | null> {
  const input = querySchema.safeParse(query);
  if (!input.success) return null;
  await assertRateLimitByIp(`search:${bucket}`, { limit, windowSeconds: 60 });
  const locale = await getLocale();
  const ctx = await getSearchContext(isAppLocale(locale) ? locale : siteConfig.i18n.primaryLocale);
  const filters = parseSearchParams(new URLSearchParams(input.data.replace(/^\?/, "")));
  return { filters, ctx };
}

/** How many listings match a search query string ("deal=buy&city=batumi"). */
export async function countSearchResults(query: string): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const input = await prepare(query, "count", 120);
    if (!input) return fail("invalid_input");
    return ok({ count: await countListings(input.filters, input.ctx) });
  });
}

/** The price histogram for the filters sheet (every filter except the price range). */
export async function getSearchPriceHistogram(query: string): Promise<ActionResult<{ histogram: PriceHistogram | null }>> {
  return runAction(async () => {
    const input = await prepare(query, "histogram", 60);
    if (!input) return fail("invalid_input");
    return ok({ histogram: await getPriceHistogram(input.filters, input.ctx) });
  });
}

/** When nothing matches: the one-step changes that bring results, as queries to apply. */
export async function getLoosenFixes(
  query: string,
): Promise<ActionResult<{ fixes: { id: string; fix: LoosenFix; count: number; query: string }[] }>> {
  return runAction(async () => {
    const input = await prepare(query, "loosen", 30);
    if (!input) return fail("invalid_input");
    const fixes = await rankLoosenFixes(input.filters, input.ctx, 3);
    return ok({
      fixes: fixes.map(({ id, fix, count, filters }) => ({ id, fix, count, query: serializeSearchQuery(filters) })),
    });
  });
}

/** Map points for the list + map view on large screens (phones never load them). */
export async function getSearchMapPoints(query: string): Promise<ActionResult<{ points: ListingMapPoint[] }>> {
  return runAction(async () => {
    const input = await prepare(query, "map", 60);
    if (!input) return fail("invalid_input");
    return ok({ points: await getMapPoints(input.filters, input.ctx) });
  });
}
