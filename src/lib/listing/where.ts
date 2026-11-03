/**
 * Search filters → Prisma `where` / `orderBy` (pure; no database access, so it is unit-tested).
 * Used by @/lib/listing/queries. Every public listing query starts from `publicListingWhere`.
 */
import type { CurrencyCode } from "@/config/site";
import { documentChecksOn } from "@/config/verification";
import type { Prisma } from "@/generated/prisma/client";
import { toUsd, type Rates } from "@/lib/currency/convert";
import { AMENITIES, BIG_FAMILY_MIN_GUESTS, type Amenity } from "@/lib/listing/fields";
import {
  DEAL_FILTER_TYPES,
  POSTED_WITHIN_MS,
  availableSorts,
  nightsBetween,
  type SearchFilters,
  type SortOption,
} from "@/lib/listing/search-params";
import { normalizeSearchText } from "@/lib/search-text";

export type ListingWhereContext = {
  /** The display currency the visitor typed the price range in. */
  currency: CurrencyCode;
  rates: Rates;
  /** settings.demoDataVisible */
  demoVisible: boolean;
  now?: Date;
};

const MAX_QUERY_WORDS = 6;

/** Only LIVE, not deleted, not expired listings of active owners (demo ones only while visible). */
export function publicListingWhere(ctx: Pick<ListingWhereContext, "demoVisible" | "now">): Prisma.ListingWhereInput {
  const now = ctx.now ?? new Date();
  return {
    status: "LIVE",
    deletedAt: null,
    ...(ctx.demoVisible ? {} : { isDemo: false }),
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    owner: { deletedAt: null, status: { in: ["ACTIVE", "WARNED"] } },
  };
}

/**
 * Listings whose owner holds a valid welcome pledge (the pledge line). Not needed in public search —
 * every listing goes live only after its owner accepted the pledge — but useful for admin views
 * and for re-checks after the pledge wording changes.
 */
export function welcomePledgeWhere(requiredVersion: number): Prisma.ListingWhereInput {
  return { owner: { welcomePledgeVersion: { gte: requiredVersion } } };
}

/** "Calendar day" filters compare with @db.Date columns: midnight UTC of that day. */
function day(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The words of the free-text query, normalized like Listing.searchText. */
export function queryWords(q: string | null): string[] {
  const words = normalizeSearchText(q)
    .split(" ")
    .filter(Boolean)
    // "ID 1234" / "#1234": the number alone is enough.
    .filter((w, _, all) => !(w === "id" && all.some((other) => /^\d+$/.test(other))));
  return [...new Set(words)].slice(0, MAX_QUERY_WORDS);
}

/** The Prisma `where` for a search. Filters are combined with AND; list filters as documented in SearchFilters. */
export function buildListingWhere(filters: SearchFilters, ctx: ListingWhereContext): Prisma.ListingWhereInput {
  const now = ctx.now ?? new Date();
  const and: Prisma.ListingWhereInput[] = [publicListingWhere({ ...ctx, now })];

  if (filters.deal) and.push({ dealType: { in: [...DEAL_FILTER_TYPES[filters.deal]] } });

  // Place and text
  if (filters.city) and.push({ city: { slug: filters.city } });
  if (filters.city && filters.neighborhood) {
    and.push({ neighborhood: { slug: filters.neighborhood, city: { slug: filters.city } } });
  }
  for (const word of queryWords(filters.q)) and.push({ searchText: { contains: word } });

  // Dates: no blocked night inside [checkIn, checkOut). A move-in date alone must be free itself.
  if (filters.checkIn) {
    const start = day(filters.checkIn);
    const end = filters.checkOut ? day(filters.checkOut) : new Date(start.getTime() + 86_400_000);
    and.push({ availability: { none: { startDate: { lt: end }, endDate: { gt: start } } } });
    if (filters.checkOut) {
      const nights = nightsBetween(filters.checkIn, filters.checkOut);
      and.push({ OR: [{ minStayNights: null }, { minStayNights: { lte: nights } }] });
    }
  }
  if (filters.guests) {
    and.push({
      OR: [{ maxGuests: { gte: filters.guests } }, { roomTypes: { some: { maxGuests: { gte: filters.guests } } } }],
    });
  }

  // Price (typed in the display currency, compared in USD)
  if (filters.priceMin !== null || filters.priceMax !== null) {
    const priceUsd: Prisma.DecimalNullableFilter<"Listing"> = {};
    if (filters.priceMin !== null) priceUsd.gte = roundUsd(toUsd(filters.priceMin, ctx.currency, ctx.rates));
    if (filters.priceMax !== null) priceUsd.lte = roundUsd(toUsd(filters.priceMax, ctx.currency, ctx.rates));
    and.push({ priceUsd });
  }

  // Basics
  if (filters.rooms) and.push({ rooms: { gte: filters.rooms } });
  if (filters.bedrooms) and.push({ bedrooms: { gte: filters.bedrooms } });
  if (filters.bathrooms) and.push({ bathrooms: { gte: filters.bathrooms } });
  if (filters.propertyTypes.length) and.push({ propertyType: { in: filters.propertyTypes } });

  const amenityKeys = filters.amenities.filter((a): a is Amenity => (AMENITIES as readonly string[]).includes(a));
  if (amenityKeys.length) and.push({ amenities: { hasEvery: amenityKeys } });
  if (filters.amenities.includes("pets_allowed")) and.push({ petsAllowed: true });
  if (filters.amenities.includes("smoking_allowed")) and.push({ smokingAllowed: true });

  // Jewish-friendly
  if (filters.kitchen === "kosher") and.push({ kitchenKosher: "KOSHER" });
  if (filters.kitchen === "kosher_or_kasherable") and.push({ kitchenKosher: { in: ["KOSHER", "CAN_KASHER"] } });
  if (filters.shabbatFriendly) and.push({ isShabbatFriendly: true });
  if (filters.kosherShabbat) {
    // The "כשר ושבת" chip: any one of these is enough.
    and.push({
      OR: [
        { kitchenKosher: "KOSHER" },
        { isShabbatFriendly: true },
        { hotelJewishFeatures: { hasSome: ["kosher_meals", "kosher_breakfast"] } },
      ],
    });
  }
  if (filters.jewish.length) and.push({ jewishFeatures: { hasEvery: filters.jewish } });
  if (filters.hotel.length) and.push({ hotelJewishFeatures: { hasEvery: filters.hotel } });
  if (filters.synagogueMaxWalk) and.push({ synagogueWalkMin: { lte: filters.synagogueMaxWalk } });
  if (filters.bigFamily) and.push({ maxGuests: { gte: BIG_FAMILY_MIN_GUESTS } });
  if (filters.sharedRoomFor) and.push({ sharedRoomFor: filters.sharedRoomFor });

  // Trust and media
  // No document checks for now (src/config/verification.ts): the filter is off and ignored.
  if (filters.verifiedOnly && documentChecksOn()) {
    and.push({ OR: [{ ownerVerifiedAt: { not: null } }, { owner: { idVerifiedAt: { not: null } } }] });
  }
  if (filters.ownerType) {
    and.push({ owner: { accountType: filters.ownerType === "business" ? "BUSINESS" : "PRIVATE" } });
  }
  if (filters.hasPhotos) and.push({ photos: { some: {} } });
  if (filters.hasVideo) and.push({ videoUrl: { not: null } }, { NOT: { videoUrl: "" } });
  if (filters.postedWithin) {
    and.push({ publishedAt: { gte: new Date(now.getTime() - POSTED_WITHIN_MS[filters.postedWithin]) } });
  }

  // Georgian market details
  if (filters.condition.length) and.push({ condition: { in: filters.condition } });
  if (filters.heating.length) and.push({ heating: { hasSome: filters.heating } });
  if (filters.views.length) and.push({ views: { hasSome: filters.views } });
  if (filters.furnished) and.push({ furnished: true });
  if (filters.elevator) and.push({ elevator: true });
  if (filters.sizeMin !== null || filters.sizeMax !== null) {
    and.push({
      sizeSqm: {
        ...(filters.sizeMin !== null ? { gte: filters.sizeMin } : {}),
        ...(filters.sizeMax !== null ? { lte: filters.sizeMax } : {}),
      },
    });
  }
  if (filters.floorMin !== null || filters.floorMax !== null) {
    and.push({
      floor: {
        ...(filters.floorMin !== null ? { gte: filters.floorMin } : {}),
        ...(filters.floorMax !== null ? { lte: filters.floorMax } : {}),
      },
    });
  }
  if (filters.buildingAge) and.push({ buildingAge: filters.buildingAge });

  // Map area (approximate points). West > east means the box crosses the 180° meridian.
  if (filters.bounds) {
    const { north, south, east, west } = filters.bounds;
    and.push({ approxLat: { gte: south, lte: north } });
    and.push(
      west <= east
        ? { approxLng: { gte: west, lte: east } }
        : { OR: [{ approxLng: { gte: west } }, { approxLng: { lte: east } }] },
    );
  }

  return { AND: and };
}

/** Promoted = featured until a future date, or hand-picked in the admin settings. */
export function promotedWhere(featuredIds: readonly string[], now: Date = new Date()): Prisma.ListingWhereInput {
  const or: Prisma.ListingWhereInput[] = [{ featuredUntil: { gt: now } }];
  if (featuredIds.length) or.push({ id: { in: [...featuredIds] } });
  return { OR: or };
}

/**
 * The opposite of promotedWhere, written out: `NOT (featuredUntil > now OR …)` would drop rows
 * whose featuredUntil is NULL (SQL three-valued logic).
 */
export function notPromotedWhere(featuredIds: readonly string[], now: Date = new Date()): Prisma.ListingWhereInput {
  const and: Prisma.ListingWhereInput[] = [{ OR: [{ featuredUntil: null }, { featuredUntil: { lte: now } }] }];
  if (featuredIds.length) and.push({ id: { notIn: [...featuredIds] } });
  return { AND: and };
}

/** The sort that actually applies ("rating" without reviews and "price_sqm" outside sales → recommended). */
export function effectiveSort(filters: Pick<SearchFilters, "sort" | "deal">): SortOption {
  if (filters.sort === "rating") return "recommended"; // no ratings yet (Phase 2)
  return availableSorts(filters.deal).includes(filters.sort) ? filters.sort : "recommended";
}

/**
 * `orderBy` for a sort. "recommended" here is only the second part (bumped first);
 * the query puts promoted listings in front (see searchListings). The public ID breaks ties,
 * so pages never repeat or skip a listing.
 */
export function buildListingOrderBy(sort: SortOption): Prisma.ListingOrderByWithRelationInput[] {
  const tie: Prisma.ListingOrderByWithRelationInput = { publicId: "desc" };
  switch (sort) {
    case "newest":
      return [{ publishedAt: { sort: "desc", nulls: "last" } }, tie];
    case "price_asc":
      return [{ priceUsd: { sort: "asc", nulls: "last" } }, tie];
    case "price_desc":
      return [{ priceUsd: { sort: "desc", nulls: "last" } }, tie];
    case "price_sqm":
      return [{ pricePerSqmUsd: { sort: "asc", nulls: "last" } }, tie];
    case "synagogue":
      return [{ synagogueWalkMin: { sort: "asc", nulls: "last" } }, { bumpedAt: { sort: "desc", nulls: "last" } }, tie];
    case "updated":
      return [{ contentUpdatedAt: "desc" }, tie];
    case "price_drop":
      return [{ priceDroppedAt: { sort: "desc", nulls: "last" } }, { bumpedAt: { sort: "desc", nulls: "last" } }, tie];
    case "rating":
    case "recommended":
    default:
      return [{ bumpedAt: { sort: "desc", nulls: "last" } }, tie];
  }
}
