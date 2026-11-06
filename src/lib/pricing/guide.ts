import type { CurrencyCode } from "@/config/site";
import type { DealType, PricePeriod, PropertyType } from "@/generated/prisma/enums";
import { convert } from "@/lib/currency/convert";

/**
 * The hosts' price guide (round 3, brief 5): what similar places on Bayit cost. Pure and
 * client-safe: the math, the privacy rules and where a price sits. The data access is
 * ./guide-server.ts (getPriceGuide), which loads the candidates and the reference prices.
 *
 * Shared contract (several features build on it, keep it stable; new fields are optional):
 *   - getPriceGuide(input: GuideInput): Promise<GuideResult>        (./guide-server.ts)
 *   - pricePosition(guide, price, currency) → far_below … far_above | null
 *
 * Rules (brief 5 and the founder's answers):
 *   - only LIVE, non-demo listings, never the host's own (the server filters them);
 *   - a group counts only with at least 5 places (distinct listings) of at least 3 different
 *     owners, at EVERY level and for every number block (price, weekend, per m²);
 *   - the lowest and highest prices only with at least 10 places;
 *   - compare by city, deal type, property type and bedrooms (hotels: how many guests the room
 *     sleeps), with the neighborhood instead of the city when there is enough data; widen to the
 *     whole city, then all sizes, and say exactly what is compared (scope.matched);
 *   - then, while there is enough data, also bathrooms, kitchen, sea view, new or old building
 *     and size (fixed bands, never a window the host can slide);
 *   - no number points to a single listing: quartiles are interpolated, every number is rounded,
 *     and a narrower group is used only when the places it leaves out are none or themselves a
 *     safe group, so comparing two answers can't isolate one listing's price.
 */

// ─── Contract ────────────────────────────────────────────────

export type GuideInput = {
  listingId?: string;
  excludeOwnerId: string;
  countryCode?: string;
  cityId: string;
  neighborhoodId?: string | null;
  dealType: DealType;
  propertyType: PropertyType;
  bedrooms?: number | null;
  bathrooms?: number | null;
  hasKitchen?: boolean | null;
  seaView?: boolean | null;
  newBuilding?: boolean | null;
  sizeSqm?: number | null;
  roomTypeId?: string | null;
  displayCurrency: CurrencyCode;
  /**
   * EXTENSION (optional): hotels without a room type ("מדריך מחירים" by city): how many guests
   * the room sleeps. With roomTypeId the room's own beds are used instead.
   */
  roomGuests?: number | null;
};

/** min/max only when count >= 10. count = places (distinct listings), owners = distinct owners. */
export type GuideStats = { count: number; owners: number; median: number; p25: number; p75: number; min?: number; max?: number };

export type GuideUnit = "night" | "month" | "total";
export type GuideLevel = "neighborhood" | "city" | "city_all_sizes";

export type GuideReference = {
  low: number;
  high: number;
  /** The guide's currency (the host's): converted when the report used another one (see `converted`). */
  currency: CurrencyCode;
  unit: string;
  sourceName: string;
  sourceUrl?: string;
  /** YYYY-MM */
  sourceMonth: string;
  perSqm: boolean;
  /** EXTENSION (optional): the report's numbers were in another currency and are shown with ≈. */
  converted?: boolean;
};

export type GuideResult = {
  status: "ok" | "widened" | "not_enough";
  unit: GuideUnit;
  currency: CurrencyCode;
  scope: { level: GuideLevel; cityId: string; neighborhoodId?: string; matched: string[] };
  price?: GuideStats;
  weekend?: GuideStats;
  perSqm?: GuideStats;
  references: GuideReference[];
  /** EXTENSION (optional): some of Bayit's numbers were converted from another currency (show ≈). */
  converted?: boolean;
  /** EXTENSION (optional): the exchange rates used (units per USD), so pricePosition can convert. */
  rates?: Partial<Record<CurrencyCode, number>>;
};

export type PricePosition = "far_below" | "below" | "typical" | "above" | "far_above";

// ─── Rules ───────────────────────────────────────────────────

export const GUIDE_RULES = {
  /** A group needs at least this many places (distinct listings)… */
  minPlaces: 5,
  /** …of at least this many different owners. */
  minOwners: 3,
  /** The lowest and highest prices only from this many places. */
  minPlacesForMinMax: 10,
  /** "far below": more than 50% below the usual range's low end. */
  farBelowFactor: 0.5,
  /** "far above": more than 100% above the usual range's high end. */
  farAboveFactor: 2,
} as const;

export const GUIDE_UNIT_BY_DEAL: Record<DealType, GuideUnit> = {
  SHORT_STAY: "night",
  HOTEL_ROOM: "night",
  MONTHLY_RENT: "month",
  SALE: "total",
};

/** The price period that a deal type's guide compares (other periods are left out). */
export const GUIDE_PERIOD_BY_UNIT: Record<GuideUnit, PricePeriod> = { night: "NIGHT", month: "MONTH", total: "TOTAL" };

export function guidePeriodFor(dealType: DealType): PricePeriod {
  return GUIDE_PERIOD_BY_UNIT[GUIDE_UNIT_BY_DEAL[dealType]];
}

// ─── Buckets (fixed, so a group can't be narrowed one listing at a time) ───

/** Bedrooms: 0 (studio), 1, 2, 3, 4, 5 and more. */
export function bedroomsKey(bedrooms: number | null | undefined): string | null {
  if (bedrooms === null || bedrooms === undefined || !Number.isFinite(bedrooms) || bedrooms < 0) return null;
  const n = Math.floor(bedrooms);
  return n >= 5 ? "5+" : String(n);
}

/** Hotel rooms: how many guests the room sleeps, 1 to 4, 5 and more. */
export function guestsKey(guests: number | null | undefined): string | null {
  if (guests === null || guests === undefined || !Number.isFinite(guests) || guests < 1) return null;
  const n = Math.floor(guests);
  return n >= 5 ? "5+" : String(n);
}

/** Bathrooms: 0, 1 (1 to 1.5), 2 (2 to 2.5), 3 and more. */
export function bathroomsKey(bathrooms: number | null | undefined): string | null {
  if (bathrooms === null || bathrooms === undefined || !Number.isFinite(bathrooms) || bathrooms < 0) return null;
  const n = Math.floor(bathrooms);
  return n >= 3 ? "3+" : String(n);
}

/** Lower bounds of the size bands in m²: "0-30", "30-45" … "230+". */
export const SIZE_BANDS = [0, 30, 45, 60, 80, 100, 130, 170, 230] as const;

export function sizeBand(sizeSqm: number | null | undefined): string | null {
  if (sizeSqm === null || sizeSqm === undefined || !Number.isFinite(sizeSqm) || sizeSqm <= 0) return null;
  let index = 0;
  for (let i = 0; i < SIZE_BANDS.length; i++) if (sizeSqm >= SIZE_BANDS[i]) index = i;
  const low = SIZE_BANDS[index];
  const high = SIZE_BANDS[index + 1];
  return high === undefined ? `${low}+` : `${low}-${high}`;
}

/** "45-60" → { min: 45, max: 60 }, "230+" → { min: 230, max: null } (for the chip text). */
export function sizeBandBounds(band: string): { min: number; max: number | null } | null {
  const match = /^(\d+)(?:-(\d+)|\+)$/.exec(band);
  if (!match) return null;
  return { min: Number(match[1]), max: match[2] === undefined ? null : Number(match[2]) };
}

/** How many guests a room's beds sleep (single 1, double 2, sofa bed 2), else its max guests. */
export function roomSleeps(room: {
  bedsSingle?: number | null;
  bedsDouble?: number | null;
  bedsSofa?: number | null;
  maxGuests?: number | null;
}): number | null {
  const beds = (room.bedsSingle ?? 0) + (room.bedsDouble ?? 0) * 2 + (room.bedsSofa ?? 0) * 2;
  if (beds > 0) return beds;
  return room.maxGuests && room.maxGuests > 0 ? room.maxGuests : null;
}

/** scope.matched entries are "key:value": deal, type, bedrooms, guests, bathrooms, kitchen, sea, building, size. */
export function parseMatched(matched: readonly string[]): { key: string; value: string }[] {
  return matched.flatMap((entry) => {
    const at = entry.indexOf(":");
    return at > 0 ? [{ key: entry.slice(0, at), value: entry.slice(at + 1) }] : [];
  });
}

// ─── Numbers ─────────────────────────────────────────────────

/** Linear interpolation between the closest ranks (Excel PERCENTILE.INC); `sorted` ascending. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

/** The rounding step for a guide number: whole units under 100, then 5, 10, 100, 1,000, 10,000. */
export function guideStep(value: number): number {
  const v = Math.abs(value);
  if (v < 100) return 1;
  if (v < 1_000) return 5;
  if (v < 10_000) return 10;
  if (v < 100_000) return 100;
  if (v < 1_000_000) return 1_000;
  return 10_000;
}

/** Rounds a guide number to its step (lowest prices round down, highest up). */
export function roundGuide(value: number, mode: "nearest" | "down" | "up" = "nearest"): number {
  if (!Number.isFinite(value)) return value;
  const step = guideStep(value);
  const q = value / step;
  const n = mode === "down" ? Math.floor(q + 1e-9) : mode === "up" ? Math.ceil(q - 1e-9) : Math.round(q);
  return n * step;
}

// ─── Groups ──────────────────────────────────────────────────

/** One row per listing (per room type for hotels), already in the guide's currency. */
export type GuideCandidate = {
  listingId: string;
  ownerId: string;
  neighborhoodId: string | null;
  bedrooms: number | null;
  /** Hotels: how many guests the room sleeps. */
  guests: number | null;
  bathrooms: number | null;
  hasKitchen: boolean;
  seaView: boolean;
  /** true NEW, false OLD, null unknown. */
  newBuilding: boolean | null;
  sizeSqm: number | null;
  price: number;
  weekendPrice: number | null;
  /** The price was converted from another currency. */
  converted: boolean;
};

export type GuideQuery = {
  dealType: DealType;
  propertyType: PropertyType;
  neighborhoodId?: string | null;
  bedrooms?: number | null;
  guests?: number | null;
  bathrooms?: number | null;
  hasKitchen?: boolean | null;
  seaView?: boolean | null;
  newBuilding?: boolean | null;
  sizeSqm?: number | null;
};

type Row = { listingId: string; ownerId: string };

export function groupCounts(rows: readonly Row[]): { places: number; owners: number } {
  return { places: new Set(rows.map((r) => r.listingId)).size, owners: new Set(rows.map((r) => r.ownerId)).size };
}

/** At least 5 places of at least 3 different owners. */
export function isSafeGroup(rows: readonly Row[]): boolean {
  const { places, owners } = groupCounts(rows);
  return places >= GUIDE_RULES.minPlaces && owners >= GUIDE_RULES.minOwners;
}

/**
 * A narrower group (`child`, a subset of `parent`) may be shown only when the places it leaves out
 * are none, or themselves a safe group. Otherwise the two answers together would describe the
 * one or two places in between.
 */
export function complementOk<T extends Row>(parent: readonly T[], child: readonly T[]): boolean {
  const kept = new Set(child);
  const rest = parent.filter((row) => !kept.has(row));
  return rest.length === 0 || isSafeGroup(rest);
}

/** The stats of one value per row; undefined unless the rows are a safe group. */
export function statsOf(rows: readonly (Row & { value: number })[]): GuideStats | undefined {
  const usable = rows.filter((r) => Number.isFinite(r.value) && r.value > 0);
  if (!isSafeGroup(usable)) return undefined;
  const values = usable.map((r) => r.value).sort((a, b) => a - b);
  const { places, owners } = groupCounts(usable);
  const stats: GuideStats = {
    count: places,
    owners,
    median: roundGuide(percentile(values, 0.5)),
    p25: roundGuide(percentile(values, 0.25)),
    p75: roundGuide(percentile(values, 0.75)),
  };
  if (places >= GUIDE_RULES.minPlacesForMinMax) {
    stats.min = roundGuide(values[0], "down");
    stats.max = roundGuide(values[values.length - 1], "up");
  }
  return stats;
}

type Criterion = { key: string; value: string; test: (c: GuideCandidate) => boolean };

/** The extra criteria, in the order they are tried (brief 5). Hotel rooms skip bathrooms and kitchen. */
function refinements(query: GuideQuery, hotel: boolean): Criterion[] {
  const out: Criterion[] = [];
  const baths = hotel ? null : bathroomsKey(query.bathrooms);
  if (baths !== null) out.push({ key: "bathrooms", value: baths, test: (c) => bathroomsKey(c.bathrooms) === baths });
  if (!hotel && typeof query.hasKitchen === "boolean") {
    const want = query.hasKitchen;
    out.push({ key: "kitchen", value: want ? "yes" : "no", test: (c) => c.hasKitchen === want });
  }
  if (typeof query.seaView === "boolean") {
    const want = query.seaView;
    out.push({ key: "sea", value: want ? "yes" : "no", test: (c) => c.seaView === want });
  }
  if (typeof query.newBuilding === "boolean") {
    const want = query.newBuilding;
    out.push({ key: "building", value: want ? "new" : "old", test: (c) => c.newBuilding === want });
  }
  const band = sizeBand(query.sizeSqm);
  if (band !== null) out.push({ key: "size", value: band, test: (c) => sizeBand(c.sizeSqm) === band });
  return out;
}

/**
 * The guide for `candidates` (every LIVE, non-demo place of other owners in the city with the same
 * deal type and property type, prices in `currency`). References are added by the server.
 */
export function computeGuide(
  candidates: readonly GuideCandidate[],
  query: GuideQuery,
  context: { cityId: string; currency: CurrencyCode },
): GuideResult {
  const hotel = query.dealType === "HOTEL_ROOM";
  const unit = GUIDE_UNIT_BY_DEAL[query.dealType];
  const base = [`deal:${query.dealType}`, `type:${query.propertyType}`];
  const sizeKey = hotel ? guestsKey(query.guests) : bedroomsKey(query.bedrooms);
  const keyOf = (c: GuideCandidate) => (hotel ? guestsKey(c.guests) : bedroomsKey(c.bedrooms));
  const sizeMatched = sizeKey === null ? [] : [`${hotel ? "guests" : "bedrooms"}:${sizeKey}`];

  const all = [...candidates];
  const sized = sizeKey === null ? null : all.filter((c) => keyOf(c) === sizeKey);
  type Level = { level: GuideLevel; rows: GuideCandidate[]; parent: GuideCandidate[] | null; matched: string[] };
  const levels: Level[] = [];
  if (query.neighborhoodId) {
    const parent = sized ?? all;
    levels.push({ level: "neighborhood", rows: parent.filter((c) => c.neighborhoodId === query.neighborhoodId), parent, matched: sizeMatched });
  }
  if (sized) levels.push({ level: "city", rows: sized, parent: all, matched: sizeMatched });
  levels.push({ level: "city_all_sizes", rows: all, parent: null, matched: [] });

  const index = levels.findIndex((l) => isSafeGroup(l.rows) && (l.parent === null || complementOk(l.parent, l.rows)));
  if (index === -1) {
    return { status: "not_enough", unit, currency: context.currency, scope: { level: "city_all_sizes", cityId: context.cityId, matched: base }, references: [] };
  }

  const chosen = levels[index];
  let rows = chosen.rows;
  const matched = [...base, ...chosen.matched];
  for (const criterion of refinements(query, hotel)) {
    const narrower = rows.filter(criterion.test);
    if (isSafeGroup(narrower) && complementOk(rows, narrower)) {
      rows = narrower;
      matched.push(`${criterion.key}:${criterion.value}`);
    }
  }

  const price = statsOf(rows.map((c) => ({ ...c, value: c.price })));
  const weekend =
    unit === "night" ? statsOf(rows.filter((c) => c.weekendPrice !== null).map((c) => ({ ...c, value: c.weekendPrice as number }))) : undefined;
  const perSqm =
    unit === "total"
      ? statsOf(rows.filter((c) => c.sizeSqm !== null && c.sizeSqm > 0).map((c) => ({ ...c, value: c.price / (c.sizeSqm as number) })))
      : undefined;

  return {
    status: index === 0 ? "ok" : "widened",
    unit,
    currency: context.currency,
    scope: {
      level: chosen.level,
      cityId: context.cityId,
      ...(chosen.level === "neighborhood" && query.neighborhoodId ? { neighborhoodId: query.neighborhoodId } : {}),
      matched,
    },
    ...(price ? { price } : {}),
    ...(weekend ? { weekend } : {}),
    ...(perSqm ? { perSqm } : {}),
    references: [],
    converted: rows.some((c) => c.converted),
  };
}

// ─── Where a price sits ──────────────────────────────────────

/** A value against a usual range: "far" is more than 50% below the low end or more than 100% above the high end. */
export function positionIn(stats: Pick<GuideStats, "p25" | "p75"> | undefined, value: number): PricePosition | null {
  if (!stats || !Number.isFinite(value) || value <= 0) return null;
  if (value < stats.p25 * GUIDE_RULES.farBelowFactor) return "far_below";
  if (value < stats.p25) return "below";
  if (value > stats.p75 * GUIDE_RULES.farAboveFactor) return "far_above";
  if (value > stats.p75) return "above";
  return "typical";
}

/**
 * Where a price (in `currency`, per the guide's unit) sits among similar places; null when there
 * is not enough data. Converts with the guide's rates (or the fallback table) when needed.
 */
export function pricePosition(guide: GuideResult, price: number, currency: CurrencyCode): PricePosition | null {
  if (guide.status === "not_enough" || !guide.price) return null;
  if (!Number.isFinite(price) || price <= 0) return null;
  const value = currency === guide.currency ? price : convert(price, currency, guide.currency, guide.rates);
  return positionIn(guide.price, value);
}
