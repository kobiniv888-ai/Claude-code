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
import { addDays, daysBetween, isDay } from "@/lib/booking/dates";
import { MAX_STAY_NIGHTS } from "@/lib/booking/constants";
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
  sortBySynagogueStep,
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

/**
 * Hotels with at least one active, nightly-priced room type that has a free room on EVERY night
 * of [checkIn, checkOut) (one night when there is no check-out), for dated searches (search-1).
 * The same rules as the booking (src/lib/booking/room-availability.ts): a block of a room type
 * takes its `rooms` (null or below 1: all of them), a block without a room type closes the whole
 * hotel, a quantity below 1 counts as 1. A stay longer than MAX_STAY_NIGHTS can't be booked: none.
 */
export async function freeHotelIdsForStay(checkIn: string, checkOut: string | null): Promise<string[]> {
  const end = checkOut ?? addDays(checkIn, 1);
  const nights = daysBetween(checkIn, end);
  if (!isDay(checkIn) || !isDay(end) || !(nights >= 1) || nights > MAX_STAY_NIGHTS) return [];
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT rt."listingId" AS "id"
    FROM "RoomType" rt
    JOIN "Listing" l ON l."id" = rt."listingId"
    WHERE l."dealType" = 'HOTEL_ROOM' AND l."status" = 'LIVE' AND l."deletedAt" IS NULL
      AND rt."active" = true AND rt."pricePeriod" = 'NIGHT' AND rt."price" > 0
      AND NOT EXISTS (
        SELECT 1
        FROM generate_series(${checkIn}::date, ${end}::date - 1, interval '1 day') AS d("night")
        WHERE GREATEST(rt."quantity", 1) <= (
          SELECT COALESCE(SUM(CASE WHEN b."roomTypeId" IS NULL OR b."rooms" IS NULL OR b."rooms" < 1 THEN GREATEST(rt."quantity", 1) ELSE b."rooms" END), 0)
          FROM "AvailabilityBlock" b
          WHERE b."listingId" = rt."listingId"
            AND (b."roomTypeId" = rt."id" OR b."roomTypeId" IS NULL)
            AND b."startDate" <= d."night" AND b."endDate" > d."night"
        )
      )`;
  return rows.map((row) => row.id);
}

/** The search's `where`; a dated search first asks which hotels still have a free room. */
export async function searchWhere(
  filters: SearchFilters,
  ctx: Pick<ListingQueryContext, "currency" | "rates">,
  rt: { demoVisible: boolean; now: Date },
): Promise<Prisma.ListingWhereInput> {
  const freeHotelIds = filters.checkIn ? await freeHotelIdsForStay(filters.checkIn, filters.checkOut) : undefined;
  return buildListingWhere(filters, { currency: ctx.currency, rates: ctx.rates, demoVisible: rt.demoVisible, now: rt.now, freeHotelIds });
}

function whereFor(filters: SearchFilters, ctx: ListingQueryContext, rt: Runtime): Promise<Prisma.ListingWhereInput> {
  return searchWhere(filters, ctx, rt);
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

/** How many listings the "nearest synagogue" sort orders in memory (the nearest ones first). */
const MAX_SYNAGOGUE_SORT_ROWS = 2_000;

/**
 * One page of the "nearest synagogue" sort, ordered by the walking time AS SHOWN (rounded up to
 * 5 minutes) and then a walk-free order (sortBySynagogueStep; security checklist 6.d): the
 * database cannot order by the rounded value, so the keys of the matching listings are sorted
 * here and the page is loaded by id.
 */
async function synagogueStepPage(where: Prisma.ListingWhereInput, locale: AppLocale, skip: number, take: number): Promise<ListingCardRow[]> {
  const keys = await db.listing.findMany({
    where,
    // The nearest first when there are more than the cap (a cut can only fall inside the last step).
    orderBy: [{ synagogueWalkMin: { sort: "asc", nulls: "last" } }, { publicId: "desc" }],
    take: MAX_SYNAGOGUE_SORT_ROWS,
    select: { id: true, publicId: true, synagogueWalkMin: true, bumpedAt: true },
  });
  const ids = sortBySynagogueStep(keys)
    .slice(skip, skip + take)
    .map((k) => k.id);
  if (ids.length === 0) return [];
  const rows = await findCardRows({ AND: [where, { id: { in: ids } }] }, [{ publicId: "desc" }], locale, 0, ids.length);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is ListingCardRow => r !== undefined);
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
  const where = await whereFor(filters, ctx, rt);
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
  } else if (sort === "synagogue" && total > 0) {
    rows = await synagogueStepPage(where, ctx.locale, offset, pageSize);
  } else {
    rows = total === 0 ? [] : await findCardRows(where, orderBy, ctx.locale, offset, pageSize);
  }

  return { items: await toCards(rows, ctx, rt), total, page, pageSize, pageCount };
}

/** The number of results for the live "Show 123 results" button. */
export async function countListings(filters: SearchFilters, ctx: ListingQueryContext): Promise<number> {
  const rt = await runtime();
  return db.listing.count({ where: await whereFor(filters, ctx, rt) });
}

/** Up to 500 approximate map points for the filters (the map ignores `page`). */
export async function getMapPoints(filters: SearchFilters, ctx: ListingQueryContext): Promise<ListingMapPoint[]> {
  const rt = await runtime();
  const rows = await db.listing.findMany({
    where: { AND: [await whereFor(filters, ctx, rt), { approxLat: { not: null } }, { approxLng: { not: null } }] },
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
