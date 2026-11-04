/**
 * Public listing queries (server-only): search results, counts, map points and card rows for
 * the home page, favorites, recently viewed, compare, similar listings and owner profiles.
 *
 *   const filters = parseSearchParams(await searchParams);
 *   const result = await searchListings(filters, { locale, currency, rates, userId: user?.id });
 *
 * Every query starts from publicListingWhere (LIVE, not deleted/expired, demo rows only while the
 * "demo data" setting is on) and reads cards through listingCardSelect, which never selects
 * private columns.
 */
import "server-only";
import { siteConfig, type AppLocale, type CurrencyCode } from "@/config/site";
import type { DealType, Prisma } from "@/generated/prisma/client";
import type { Rates } from "@/lib/currency/convert";
import { db } from "@/lib/db";
import { listingCardSelect, listingMapSelect, toListingCard, toListingMapPoint, type ListingCardRow } from "@/lib/listing/mappers";
import type { SearchFilters } from "@/lib/listing/search-params";
import type { ListingCardData, ListingMapPoint, ListingSearchResult } from "@/lib/listing/types";
import {
  buildListingOrderBy,
  buildListingWhere,
  effectiveSort,
  notPromotedWhere,
  promotedWhere,
  publicListingWhere,
} from "@/lib/listing/where";
import { getSettings } from "@/lib/settings";

export { buildListingWhere, buildListingOrderBy, publicListingWhere } from "@/lib/listing/where";

export type ListingQueryContext = {
  locale: AppLocale;
  /** Display currency (the price filter is typed in it). */
  currency: CurrencyCode;
  rates: Rates;
  /** Signed-in visitor, to mark their favorites. */
  userId?: string | null;
  /** Default siteConfig.listings.pageSize. */
  pageSize?: number;
};

const MAX_PAGE_SIZE = 60;
const MAX_MAP_POINTS = 500;
const MAX_CARDS_BY_ID = 100;

type Runtime = { now: Date; demoVisible: boolean; featuredIds: string[]; featuredSet: Set<string>; pledgeRequiredVersion: number };

async function runtime(): Promise<Runtime> {
  const settings = await getSettings();
  return {
    now: new Date(),
    demoVisible: settings.demoDataVisible,
    featuredIds: settings.featuredListingIds,
    featuredSet: new Set(settings.featuredListingIds),
    pledgeRequiredVersion: settings.pledgeRequiredVersion,
  };
}

function whereFor(filters: SearchFilters, ctx: ListingQueryContext, rt: Runtime): Prisma.ListingWhereInput {
  return buildListingWhere(filters, { currency: ctx.currency, rates: ctx.rates, demoVisible: rt.demoVisible, now: rt.now });
}

function publicWhere(rt: Runtime, ...extra: Prisma.ListingWhereInput[]): Prisma.ListingWhereInput {
  return { AND: [publicListingWhere({ demoVisible: rt.demoVisible, now: rt.now }), ...extra] };
}

async function favoriteIdsFor(userId: string | null | undefined, listingIds: string[]): Promise<Set<string>> {
  if (!userId || listingIds.length === 0) return new Set();
  const rows = await db.favorite.findMany({
    where: { userId, listingId: { in: listingIds } },
    select: { listingId: true },
  });
  return new Set(rows.map((r) => r.listingId));
}

async function toCards(rows: ListingCardRow[], ctx: ListingQueryContext, rt: Runtime): Promise<ListingCardData[]> {
  const favoriteIds = await favoriteIdsFor(ctx.userId, rows.map((r) => r.id));
  return rows.map((row) => toListingCard(row, { locale: ctx.locale, now: rt.now, featuredIds: rt.featuredSet, favoriteIds, pledgeRequiredVersion: rt.pledgeRequiredVersion }));
}

function findCardRows(
  where: Prisma.ListingWhereInput,
  orderBy: Prisma.ListingOrderByWithRelationInput[],
  locale: AppLocale,
  skip: number,
  take: number,
): Promise<ListingCardRow[]> {
  if (take <= 0) return Promise.resolve([]);
  return db.listing.findMany({ where, orderBy, skip, take, select: listingCardSelect(locale) });
}

function pageSizeOf(ctx: ListingQueryContext): number {
  const size = Math.trunc(ctx.pageSize ?? siteConfig.listings.pageSize);
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Number.isFinite(size) ? size : siteConfig.listings.pageSize));
}

/**
 * One page of search results. "Recommended" puts promoted listings first (paid featured, or
 * hand-picked in the admin settings), then the rest by bumpedAt — both parts with the same order,
 * paged as one list. A page past the end is clamped to the last page.
 */
export async function searchListings(filters: SearchFilters, ctx: ListingQueryContext): Promise<ListingSearchResult> {
  const rt = await runtime();
  const where = whereFor(filters, ctx, rt);
  const sort = effectiveSort(filters);
  const orderBy = buildListingOrderBy(sort);
  const pageSize = pageSizeOf(ctx);

  const promoted: Prisma.ListingWhereInput = { AND: [where, promotedWhere(rt.featuredIds, rt.now)] };
  const [total, promotedCount] = await Promise.all([
    db.listing.count({ where }),
    sort === "recommended" ? db.listing.count({ where: promoted }) : Promise.resolve(0),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, filters.page), pageCount);
  const offset = (page - 1) * pageSize;

  let rows: ListingCardRow[];
  if (sort === "recommended" && promotedCount > 0) {
    const fromPromoted = Math.max(0, Math.min(pageSize, promotedCount - offset));
    const [top, rest] = await Promise.all([
      findCardRows(promoted, orderBy, ctx.locale, offset, fromPromoted),
      findCardRows(
        { AND: [where, notPromotedWhere(rt.featuredIds, rt.now)] },
        orderBy,
        ctx.locale,
        Math.max(0, offset - promotedCount),
        pageSize - fromPromoted,
      ),
    ]);
    rows = [...top, ...rest];
  } else {
    rows = total === 0 ? [] : await findCardRows(where, orderBy, ctx.locale, offset, pageSize);
  }

  return { items: await toCards(rows, ctx, rt), total, page, pageSize, pageCount };
}

/** The number of results for the live "Show 123 results" button. */
export async function countListings(filters: SearchFilters, ctx: ListingQueryContext): Promise<number> {
  const rt = await runtime();
  return db.listing.count({ where: whereFor(filters, ctx, rt) });
}

/** Up to 500 approximate map points for the filters (the map ignores `page`). */
export async function getMapPoints(filters: SearchFilters, ctx: ListingQueryContext): Promise<ListingMapPoint[]> {
  const rt = await runtime();
  const rows = await db.listing.findMany({
    where: { AND: [whereFor(filters, ctx, rt), { approxLat: { not: null } }, { approxLng: { not: null } }] },
    orderBy: buildListingOrderBy(effectiveSort(filters)),
    take: MAX_MAP_POINTS,
    select: listingMapSelect(ctx.locale),
  });
  return rows.map((row) => toListingMapPoint(row, ctx.locale)).filter((p): p is ListingMapPoint => p !== null);
}

/**
 * Cards for a list of listings, in the same order, skipping any that are no longer public.
 * Numbers are public IDs (recently viewed, compare); strings are Listing ids (favorites).
 */
export async function getListingCards(
  ids: readonly (number | string)[],
  ctx: ListingQueryContext,
): Promise<ListingCardData[]> {
  const wanted = [...new Set(ids)].slice(0, MAX_CARDS_BY_ID);
  const publicIds = wanted.filter((id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0);
  const listingIds = wanted.filter((id): id is string => typeof id === "string" && id.length > 0);
  if (publicIds.length === 0 && listingIds.length === 0) return [];

  const rt = await runtime();
  const rows = await db.listing.findMany({
    where: publicWhere(rt, {
      OR: [
        ...(publicIds.length ? [{ publicId: { in: publicIds } }] : []),
        ...(listingIds.length ? [{ id: { in: listingIds } }] : []),
      ],
    }),
    select: listingCardSelect(ctx.locale),
  });
  const cards = await toCards(rows, ctx, rt);
  const byKey = new Map<number | string, ListingCardData>();
  for (const card of cards) {
    byKey.set(card.publicId, card);
    byKey.set(card.id, card);
  }
  const seen = new Set<string>();
  const ordered: ListingCardData[] = [];
  for (const id of wanted) {
    const card = byKey.get(id);
    if (card && !seen.has(card.id)) {
      seen.add(card.id);
      ordered.push(card);
    }
  }
  return ordered;
}

/** Only these deal types (the home page's selected tab); all when omitted. */
function dealTypesWhere(dealTypes?: readonly DealType[]): Prisma.ListingWhereInput {
  return dealTypes ? { dealType: { in: [...dealTypes] } } : {};
}

/** "Featured" on the home page: hand-picked listings in the admin's order, then paid featured ones. */
export async function getFeaturedListings(
  ctx: ListingQueryContext,
  limit = 8,
  { dealTypes }: { dealTypes?: readonly DealType[] } = {},
): Promise<ListingCardData[]> {
  const rt = await runtime();
  const rows = await findCardRows(
    publicWhere(rt, promotedWhere(rt.featuredIds, rt.now), dealTypesWhere(dealTypes)),
    buildListingOrderBy("recommended"),
    ctx.locale,
    0,
    limit + rt.featuredIds.length,
  );
  const rank = (id: string) => {
    const index = rt.featuredIds.indexOf(id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  const sorted = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => rank(a.row.id) - rank(b.row.id) || a.index - b.index)
    .slice(0, limit)
    .map(({ row }) => row);
  return toCards(sorted, ctx, rt);
}

/** The newest public listings (of these deal types, when given). */
export async function getNewestListings(
  ctx: ListingQueryContext,
  limit = 8,
  { dealTypes }: { dealTypes?: readonly DealType[] } = {},
): Promise<ListingCardData[]> {
  const rt = await runtime();
  const rows = await findCardRows(publicWhere(rt, dealTypesWhere(dealTypes)), buildListingOrderBy("newest"), ctx.locale, 0, limit);
  return toCards(rows, ctx, rt);
}

/**
 * Listings like this one: same city and deal type, closest in price (within −40%…+60% first,
 * then any price). Never includes the listing itself.
 */
export async function getSimilarListings(listingId: string, ctx: ListingQueryContext, limit = 8): Promise<ListingCardData[]> {
  const source = await db.listing.findUnique({
    where: { id: listingId },
    select: { id: true, cityId: true, dealType: true, priceUsd: true },
  });
  if (!source?.cityId) return [];
  const rt = await runtime();
  const base: Prisma.ListingWhereInput = { id: { not: source.id }, cityId: source.cityId, dealType: source.dealType };
  const orderBy = buildListingOrderBy("recommended");
  const target = source.priceUsd === null ? null : Number(source.priceUsd);

  let rows: ListingCardRow[] = [];
  if (target !== null && target > 0) {
    const near = await findCardRows(
      publicWhere(rt, base, { priceUsd: { gte: target * 0.6, lte: target * 1.6 } }),
      orderBy,
      ctx.locale,
      0,
      limit * 3,
    );
    const distance = (row: ListingCardRow) => {
      const price = row.priceUsd === null ? null : Number(row.priceUsd);
      return price && price > 0 ? Math.abs(Math.log(price / target)) : Number.POSITIVE_INFINITY;
    };
    rows = near
      .map((row, index) => ({ row, index, d: distance(row) }))
      .sort((a, b) => a.d - b.d || a.index - b.index)
      .slice(0, limit)
      .map(({ row }) => row);
  }
  if (rows.length < limit) {
    const more = await findCardRows(
      publicWhere(rt, base, ...(rows.length ? [{ id: { notIn: rows.map((r) => r.id) } }] : [])),
      orderBy,
      ctx.locale,
      0,
      limit - rows.length,
    );
    rows = [...rows, ...more];
  }
  return toCards(rows, ctx, rt);
}

/** An owner's public listings (for the owner profile), newest bump first. */
export async function getOwnerListings(ownerId: string, ctx: ListingQueryContext, limit = 48): Promise<ListingCardData[]> {
  const rt = await runtime();
  const rows = await findCardRows(publicWhere(rt, { ownerId }), buildListingOrderBy("recommended"), ctx.locale, 0, limit);
  return toCards(rows, ctx, rt);
}

/** How many public listings an owner has. */
export async function countOwnerListings(ownerId: string): Promise<number> {
  const rt = await runtime();
  return db.listing.count({ where: publicWhere(rt, { ownerId }) });
}
