import "server-only";
import { getFeaturedListings, getNewestListings, type ListingQueryContext } from "@/lib/listing/queries";
import { DEAL_FILTER_TYPES } from "@/lib/listing/search-params";
import type { ListingCardData } from "@/lib/listing/types";
import type { SearchBarDeal } from "@/lib/search/search-bar";
import { HOME_RECOMMENDED_CARDS, mergeRecommended } from "./recommended";

/**
 * "Recommended places" for one home tab: at most 6 cards of that tab's deal type only (a sale is
 * never among nightly stays), promoted first, then the newest.
 */
export async function getHomeRecommended(ctx: ListingQueryContext, deal: SearchBarDeal): Promise<ListingCardData[]> {
  const dealTypes = DEAL_FILTER_TYPES[deal];
  const [promoted, newest] = await Promise.all([
    getFeaturedListings(ctx, HOME_RECOMMENDED_CARDS, { dealTypes }),
    getNewestListings(ctx, HOME_RECOMMENDED_CARDS, { dealTypes }),
  ]);
  return mergeRecommended(promoted, newest);
}

/**
 * A minute-long memory of the rows for signed-out visitors (no favorites to mark), per tab,
 * language and currency, so tab switches by many visitors cost one query a minute.
 */
const CACHE_MS = 60_000;
const MAX_ENTRIES = 100;
const cache = new Map<string, { at: number; cards: ListingCardData[] }>();

export async function getHomeRecommendedCached(ctx: ListingQueryContext, deal: SearchBarDeal): Promise<ListingCardData[]> {
  if (ctx.userId) return getHomeRecommended(ctx, deal);
  const key = `${deal}|${ctx.locale}|${ctx.currency}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.cards;
  const cards = await getHomeRecommended(ctx, deal);
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(key, { at: Date.now(), cards });
  return cards;
}
