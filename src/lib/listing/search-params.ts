/**
 * Search filters ⇄ URL (isomorphic, pure). Shared by the home search bar, the search page,
 * the filter sidebar/drawer, the map and saved searches.
 *
 *   const filters = parseSearchParams(await searchParams);       // server page
 *   const filters = parseSearchParams(useSearchParams());        // client
 *   router.push(searchPath({ ...filters, shabbatFriendly: true, page: 1 }));
 *
 * Every URL parameter has the same name as its key in SearchFilters ("?deal=monthly&bedrooms=2").
 * Arrays are comma-separated, enum values are lower-case ("propertyTypes=apartment,house"),
 * booleans are "1". Parsing is lenient: unknown or invalid values are dropped, never thrown.
 * Serializing is stable (always the same order) and leaves out defaults, so equal filters give
 * equal URLs (good for caching and canonical links).
 */
import { siteConfig } from "@/config/site";
import type {
  BuildingAge,
  DealType,
  HeatingType,
  PropertyCondition,
  PropertyType,
  SharedRoomFor,
  ViewType,
} from "@/generated/prisma/enums";
import { parseBounds, serializeBounds, type Bounds } from "@/lib/geo";
import { clampBoundsToGeorgia } from "@/lib/map-bounds";
import {
  AMENITIES,
  CONDITIONS,
  DEAL_SLUGS,
  HEATING_TYPES,
  HOTEL_JEWISH_FEATURES,
  HOUSE_RULE_FILTERS,
  JEWISH_FEATURES,
  PROPERTY_TYPES,
  SHARED_ROOM_FOR,
  VIEW_TYPES,
  type HotelJewishFeature,
  type JewishFeature,
} from "@/lib/listing/fields";

// ─── Vocabularies ─────────────────────────────────────────────

/** "rent" = short stays + monthly rentals (the "Rent" tab). The others are DEAL_SLUGS. */
export const DEAL_FILTERS = ["rent", "short-stay", "monthly", "buy", "hotels"] as const;
export type DealFilter = (typeof DEAL_FILTERS)[number];

/** Deal types each deal filter matches. */
export const DEAL_FILTER_TYPES: Record<DealFilter, readonly DealType[]> = {
  rent: ["SHORT_STAY", "MONTHLY_RENT"],
  "short-stay": ["SHORT_STAY"],
  monthly: ["MONTHLY_RENT"],
  buy: ["SALE"],
  hotels: ["HOTEL_ROOM"],
};

/** The deal filter for one deal type (SHORT_STAY → "short-stay"). */
export function dealFilterFor(dealType: DealType): DealFilter {
  return DEAL_SLUGS[dealType] as DealFilter;
}

export const SORT_OPTIONS = [
  "recommended",
  "newest",
  "price_asc",
  "price_desc",
  "price_sqm",
  "synagogue",
  "rating",
  "updated",
  "price_drop",
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];
export const DEFAULT_SORT: SortOption = "recommended";

/** Sorts offered for a deal: price per m² only for sales, "Top rated" only when reviews are on. */
export function availableSorts(deal: DealFilter | null): SortOption[] {
  return SORT_OPTIONS.filter((sort) => {
    if (sort === "price_sqm") return deal === "buy";
    if (sort === "rating") return siteConfig.features.reviews;
    return true;
  });
}

export const VIEW_MODES = ["grid", "list", "map"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];
export const DEFAULT_VIEW: ViewMode = "grid";

export const POSTED_WITHIN = ["24h", "3d", "7d", "30d"] as const;
export type PostedWithin = (typeof POSTED_WITHIN)[number];
export const POSTED_WITHIN_MS: Record<PostedWithin, number> = {
  "24h": 24 * 3600 * 1000,
  "3d": 3 * 24 * 3600 * 1000,
  "7d": 7 * 24 * 3600 * 1000,
  "30d": 30 * 24 * 3600 * 1000,
};

/** "Synagogue within N minutes' walk" options. */
export const SYNAGOGUE_WALK_OPTIONS = [5, 10, 15, 20] as const;
export type SynagogueWalk = (typeof SYNAGOGUE_WALK_OPTIONS)[number];

/** "kosher" = kosher kitchen only; "kosher_or_kasherable" also matches "can be kashered on request". */
export const KITCHEN_FILTERS = ["kosher", "kosher_or_kasherable"] as const;
export type KitchenFilter = (typeof KITCHEN_FILTERS)[number];

export const OWNER_TYPES = ["private", "business"] as const;
export type OwnerType = (typeof OWNER_TYPES)[number];

/** Amenity checkboxes in the filters: the amenity keys plus the two house-rule filters. */
export const AMENITY_FILTERS = [...AMENITIES, ...HOUSE_RULE_FILTERS] as const;
export type AmenityFilter = (typeof AMENITY_FILTERS)[number];

export const BUILDING_AGES = ["NEW", "OLD"] as const satisfies readonly BuildingAge[];

/** Upper bounds that keep URLs sane (anything above is dropped). */
const LIMITS = {
  qLength: 100,
  guests: 50,
  rooms: 50,
  price: 1_000_000_000,
  size: 100_000,
  floorMin: -5,
  floorMax: 200,
  page: 1000,
  stayNights: 366,
} as const;

// ─── Filters ──────────────────────────────────────────────────

export type SearchFilters = {
  deal: DealFilter | null;
  /** City slug. */
  city: string | null;
  /** Neighborhood slug (only together with `city`). */
  neighborhood: string | null;
  /** Free text: place names in any of the 5 languages, titles, listing IDs. */
  q: string | null;
  /** "YYYY-MM-DD". For monthly rentals this is the move-in date. */
  checkIn: string | null;
  /** "YYYY-MM-DD", after checkIn (exclusive, like the calendar). */
  checkOut: string | null;
  guests: number | null;
  /** In the visitor's DISPLAY currency. */
  priceMin: number | null;
  priceMax: number | null;
  /** Minimums. */
  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  propertyTypes: PropertyType[];
  /** Must have all of these (amenity keys + pets_allowed / smoking_allowed). */
  amenities: AmenityFilter[];
  kitchen: KitchenFilter | null;
  shabbatFriendly: boolean;
  /** Must have all of these Jewish-friendly details. */
  jewish: JewishFeature[];
  /** Must have all of these hotel features (kosher breakfast…). */
  hotel: HotelJewishFeature[];
  /** Synagogue within this many minutes' walk. */
  synagogueMaxWalk: SynagogueWalk | null;
  /** Sleeps BIG_FAMILY_MIN_GUESTS or more. */
  bigFamily: boolean;
  sharedRoomFor: SharedRoomFor | null;
  /** Owner's ID or ownership is verified. */
  verifiedOnly: boolean;
  ownerType: OwnerType | null;
  hasPhotos: boolean;
  hasVideo: boolean;
  postedWithin: PostedWithin | null;
  /** Any of these conditions. */
  condition: PropertyCondition[];
  /** Any of these heating types. */
  heating: HeatingType[];
  /** Any of these views. */
  views: ViewType[];
  furnished: boolean;
  elevator: boolean;
  sizeMin: number | null;
  sizeMax: number | null;
  floorMin: number | null;
  floorMax: number | null;
  buildingAge: BuildingAge | null;
  sort: SortOption;
  view: ViewMode;
  /** Visible map area ("Search as I move the map"). */
  bounds: Bounds | null;
  /** 1-based. */
  page: number;
};

export type FilterKey = keyof SearchFilters;

/** Filters with nothing selected. */
export function emptyFilters(): SearchFilters {
  return {
    deal: null,
    city: null,
    neighborhood: null,
    q: null,
    checkIn: null,
    checkOut: null,
    guests: null,
    priceMin: null,
    priceMax: null,
    rooms: null,
    bedrooms: null,
    bathrooms: null,
    propertyTypes: [],
    amenities: [],
    kitchen: null,
    shabbatFriendly: false,
    jewish: [],
    hotel: [],
    synagogueMaxWalk: null,
    bigFamily: false,
    sharedRoomFor: null,
    verifiedOnly: false,
    ownerType: null,
    hasPhotos: false,
    hasVideo: false,
    postedWithin: null,
    condition: [],
    heating: [],
    views: [],
    furnished: false,
    elevator: false,
    sizeMin: null,
    sizeMax: null,
    floorMin: null,
    floorMax: null,
    buildingAge: null,
    sort: DEFAULT_SORT,
    view: DEFAULT_VIEW,
    bounds: null,
    page: 1,
  };
}

/** The URL order of the parameters (also the order of the filter chips). */
const PARAM_ORDER = [
  "deal",
  "city",
  "neighborhood",
  "q",
  "checkIn",
  "checkOut",
  "guests",
  "priceMin",
  "priceMax",
  "rooms",
  "bedrooms",
  "bathrooms",
  "propertyTypes",
  "amenities",
  "kitchen",
  "shabbatFriendly",
  "jewish",
  "hotel",
  "synagogueMaxWalk",
  "bigFamily",
  "sharedRoomFor",
  "verifiedOnly",
  "ownerType",
  "hasPhotos",
  "hasVideo",
  "postedWithin",
  "condition",
  "heating",
  "views",
  "furnished",
  "elevator",
  "sizeMin",
  "sizeMax",
  "floorMin",
  "floorMax",
  "buildingAge",
  "sort",
  "view",
  "bounds",
  "page",
] as const satisfies readonly FilterKey[];

// ─── Parsing ──────────────────────────────────────────────────

/** Next.js `searchParams`, URLSearchParams (incl. ReadonlyURLSearchParams) or a plain record. */
export type SearchParamsInput =
  | URLSearchParams
  | { get(name: string): string | null; getAll(name: string): string[] }
  | Record<string, string | string[] | undefined>;

type Reader = { one: (key: string) => string | null; all: (key: string) => string[] };

function reader(input: SearchParamsInput | null | undefined): Reader {
  if (!input) return { one: () => null, all: () => [] };
  if (typeof (input as URLSearchParams).getAll === "function") {
    const params = input as Pick<URLSearchParams, "get" | "getAll">;
    return { one: (key) => params.get(key), all: (key) => params.getAll(key) };
  }
  const record = input as Record<string, string | string[] | undefined>;
  return {
    one: (key) => {
      const value = record[key];
      return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
    },
    all: (key) => {
      const value = record[key];
      return Array.isArray(value) ? value : value === undefined ? [] : [value];
    },
  };
}

function clean(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Values of a list parameter: repeated (?a=1&a=2) and comma-separated (?a=1,2) both work. */
function listValues(read: Reader, key: string): string[] {
  return read
    .all(key)
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Keeps known values (case-insensitive), de-duplicated, in vocabulary order. */
function pickList<T extends string>(values: string[], vocabulary: readonly T[], toKey: (v: string) => string): T[] {
  const wanted = new Set(values.map(toKey));
  return vocabulary.filter((item) => wanted.has(item));
}

function pickOne<T extends string>(value: string | null, vocabulary: readonly T[], toKey: (v: string) => string): T | null {
  if (!value) return null;
  const key = toKey(value);
  return vocabulary.find((item) => item === key) ?? null;
}

const enumKey = (v: string) => v.toUpperCase().replace(/-/g, "_");
const lowerKey = (v: string) => v.toLowerCase().replace(/-/g, "_");
const exactKey = (v: string) => v.toLowerCase();

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const flag = (value: string | null) => (value ? TRUE_VALUES.has(value.toLowerCase()) : false);

// Plain checks instead of zod: this module is part of the home page's search bar bundle.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A city or neighborhood slug ("old-tbilisi"), or null. */
function slugOrNull(value: string | undefined): string | null {
  return value !== undefined && value.length <= 64 && SLUG.test(value) ? value : null;
}

/** A number in [min, max], rounded to `step`; anything else is null. */
function numberIn(value: string | null, min: number, max: number, step = 1): number | null {
  if (value === null || !/^-?\d+(\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  const rounded = Math.round(parsed / step) * step;
  return rounded < min || rounded > max ? null : Number(rounded.toFixed(2));
}

const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" when it is a real calendar day, otherwise null. */
export function parseCalendarDay(value: string | null | undefined): string | null {
  const match = value ? CALENDAR_DAY.exec(value.trim()) : null;
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 2000 || y > 2100) return null;
  return match[0];
}

/** Whole nights from checkIn to checkOut ("YYYY-MM-DD" each). */
export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000);
}

function orderedPair(a: number | null, b: number | null): [number | null, number | null] {
  return a !== null && b !== null && a > b ? [b, a] : [a, b];
}

function parseQuery(value: string | null): string | null {
  const text = clean(value)?.replace(/\s+/g, " ").slice(0, LIMITS.qLength).trim();
  return text ? text : null;
}

/**
 * Filters from a URL. Lenient: invalid values are dropped, min/max pairs are swapped when
 * reversed, a neighborhood needs a city, check-out needs a check-in, dates and guests are
 * ignored for sales, and a sort the deal does not offer falls back to "recommended".
 */
export function parseSearchParams(input: SearchParamsInput | null | undefined): SearchFilters {
  const read = reader(input);
  const one = (key: string) => clean(read.one(key));
  const filters = emptyFilters();

  filters.deal = pickOne(one("deal"), DEAL_FILTERS, exactKey);

  filters.city = slugOrNull(one("city")?.toLowerCase());
  const neighborhood = slugOrNull(one("neighborhood")?.toLowerCase());
  filters.neighborhood = filters.city ? neighborhood : null;

  filters.q = parseQuery(read.one("q"));

  if (filters.deal !== "buy") {
    filters.checkIn = parseCalendarDay(one("checkIn"));
    const checkOut = parseCalendarDay(one("checkOut"));
    if (filters.checkIn && checkOut) {
      const nights = nightsBetween(filters.checkIn, checkOut);
      filters.checkOut = nights >= 1 && nights <= LIMITS.stayNights ? checkOut : null;
    }
    filters.guests = numberIn(one("guests"), 1, LIMITS.guests);
  }

  [filters.priceMin, filters.priceMax] = orderedPair(
    numberIn(one("priceMin"), 0, LIMITS.price),
    numberIn(one("priceMax"), 0, LIMITS.price),
  );
  if (filters.priceMin === 0) filters.priceMin = null;
  if (filters.priceMax === 0) filters.priceMax = null;

  filters.rooms = numberIn(one("rooms"), 1, LIMITS.rooms, 0.5);
  filters.bedrooms = numberIn(one("bedrooms"), 1, LIMITS.rooms);
  filters.bathrooms = numberIn(one("bathrooms"), 1, LIMITS.rooms, 0.5);

  filters.propertyTypes = pickList(listValues(read, "propertyTypes"), PROPERTY_TYPES, enumKey);
  filters.amenities = pickList(listValues(read, "amenities"), AMENITY_FILTERS, lowerKey);
  filters.kitchen = pickOne(one("kitchen"), KITCHEN_FILTERS, lowerKey);
  filters.shabbatFriendly = flag(one("shabbatFriendly"));
  filters.jewish = pickList(listValues(read, "jewish"), JEWISH_FEATURES, lowerKey);
  filters.hotel = pickList(listValues(read, "hotel"), HOTEL_JEWISH_FEATURES, lowerKey);
  const walk = numberIn(one("synagogueMaxWalk"), 1, 60);
  filters.synagogueMaxWalk = SYNAGOGUE_WALK_OPTIONS.find((m) => m === walk) ?? null;
  filters.bigFamily = flag(one("bigFamily"));
  filters.sharedRoomFor = pickOne(one("sharedRoomFor"), SHARED_ROOM_FOR, enumKey);
  filters.verifiedOnly = flag(one("verifiedOnly"));
  filters.ownerType = pickOne(one("ownerType"), OWNER_TYPES, exactKey);
  filters.hasPhotos = flag(one("hasPhotos"));
  filters.hasVideo = flag(one("hasVideo"));
  filters.postedWithin = pickOne(one("postedWithin"), POSTED_WITHIN, exactKey);

  filters.condition = pickList(listValues(read, "condition"), CONDITIONS, enumKey);
  filters.heating = pickList(listValues(read, "heating"), HEATING_TYPES, enumKey);
  filters.views = pickList(listValues(read, "views"), VIEW_TYPES, enumKey);
  filters.furnished = flag(one("furnished"));
  filters.elevator = flag(one("elevator"));

  [filters.sizeMin, filters.sizeMax] = orderedPair(
    numberIn(one("sizeMin"), 1, LIMITS.size),
    numberIn(one("sizeMax"), 1, LIMITS.size),
  );
  [filters.floorMin, filters.floorMax] = orderedPair(
    numberIn(one("floorMin"), LIMITS.floorMin, LIMITS.floorMax),
    numberIn(one("floorMax"), LIMITS.floorMin, LIMITS.floorMax),
  );
  filters.buildingAge = pickOne(one("buildingAge"), BUILDING_AGES, enumKey);

  const sort = pickOne(one("sort"), SORT_OPTIONS, lowerKey);
  filters.sort = sort && availableSorts(filters.deal).includes(sort) ? sort : DEFAULT_SORT;
  filters.view = pickOne(one("view"), VIEW_MODES, exactKey) ?? DEFAULT_VIEW;

  const bounds = parseBounds(one("bounds"));
  // Clamped to Georgia: a saved world-sized area (zoomed far out) must not open on the world.
  filters.bounds =
    bounds && [bounds.north, bounds.south].every((lat) => Math.abs(lat) <= 90) &&
    [bounds.east, bounds.west].every((lng) => Math.abs(lng) <= 180)
      ? clampBoundsToGeorgia(bounds)
      : null;

  filters.page = numberIn(one("page"), 1, LIMITS.page) ?? 1;
  return filters;
}

// ─── Serializing ──────────────────────────────────────────────

function formatValue(key: FilterKey, value: SearchFilters[FilterKey]): string | null {
  if (value === null || value === undefined || value === false) return null;
  if (value === true) return "1";
  if (Array.isArray(value)) return value.length ? value.map((v) => String(v).toLowerCase()).join(",") : null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "object") return serializeBounds(value as Bounds);
  if (key === "sort") return value === DEFAULT_SORT ? null : value;
  if (key === "view") return value === DEFAULT_VIEW ? null : value;
  if (key === "sharedRoomFor" || key === "buildingAge") return String(value).toLowerCase();
  return String(value);
}

/**
 * URL parameters for `filters` in a stable order, without defaults. Accepts partial filters,
 * so links can be built from just what matters: serializeSearchParams({ deal: "buy", city: "batumi" }).
 * Values go through parseSearchParams first, so the result is always valid.
 */
export function serializeSearchParams(filters: Partial<SearchFilters>): URLSearchParams {
  const raw = new URLSearchParams();
  const merged = { ...emptyFilters(), ...filters };
  for (const key of PARAM_ORDER) {
    const value = formatValue(key, merged[key]);
    if (value !== null) raw.set(key, value);
  }
  if (merged.page <= 1) raw.delete("page");
  // Round-trip through the parser: drops anything invalid the caller passed in.
  const valid = parseSearchParams(raw);
  const out = new URLSearchParams();
  for (const key of PARAM_ORDER) {
    const value = formatValue(key, valid[key]);
    if (value !== null && !(key === "page" && valid.page <= 1)) out.set(key, value);
  }
  return out;
}

/** "deal=buy&city=batumi" (empty string when no filter is set). */
export function serializeSearchQuery(filters: Partial<SearchFilters>): string {
  return serializeSearchParams(filters).toString();
}

/**
 * New filters with `patch` applied. The page goes back to 1 unless the patch sets it, and a
 * changed city clears the neighborhood. Use for every filter change in the UI.
 */
export function withFilters(filters: SearchFilters, patch: Partial<SearchFilters>): SearchFilters {
  const next: SearchFilters = { ...filters, ...patch, page: patch.page ?? 1 };
  if ("city" in patch && patch.city !== filters.city && !("neighborhood" in patch)) next.neighborhood = null;
  if (!next.city) next.neighborhood = null;
  if (!availableSorts(next.deal).includes(next.sort)) next.sort = DEFAULT_SORT;
  return next;
}

// ─── Chips ────────────────────────────────────────────────────

/**
 * A removable chip. Ranges and dates are one chip each ("price", "size", "floor", "dates");
 * lists give one chip per value. The deal type, sort, view and page are not chips.
 */
export type ChipKey =
  | "city"
  | "neighborhood"
  | "q"
  | "dates"
  | "guests"
  | "price"
  | "rooms"
  | "bedrooms"
  | "bathrooms"
  | "propertyTypes"
  | "amenities"
  | "kitchen"
  | "shabbatFriendly"
  | "jewish"
  | "hotel"
  | "synagogueMaxWalk"
  | "bigFamily"
  | "sharedRoomFor"
  | "verifiedOnly"
  | "ownerType"
  | "hasPhotos"
  | "hasVideo"
  | "postedWithin"
  | "condition"
  | "heating"
  | "views"
  | "furnished"
  | "elevator"
  | "size"
  | "floor"
  | "buildingAge"
  | "bounds";

export type FilterChip = { key: ChipKey; value?: string };

/** Chips set from the search bar (where, dates, guests, text) rather than the filter panel. */
export const SEARCH_BAR_CHIPS: readonly ChipKey[] = ["city", "neighborhood", "q", "dates", "guests", "bounds"];

const LIST_CHIPS = ["propertyTypes", "amenities", "jewish", "hotel", "condition", "heating", "views"] as const;
const VALUE_CHIPS = [
  "rooms",
  "bedrooms",
  "bathrooms",
  "kitchen",
  "synagogueMaxWalk",
  "sharedRoomFor",
  "ownerType",
  "postedWithin",
  "buildingAge",
] as const;
const FLAG_CHIPS = [
  "shabbatFriendly",
  "bigFamily",
  "verifiedOnly",
  "hasPhotos",
  "hasVideo",
  "furnished",
  "elevator",
] as const;

/** Removable chips for the active filters, in URL order. */
export function activeFilterChips(filters: SearchFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  const push = (key: ChipKey, value?: string) => chips.push(value === undefined ? { key } : { key, value });
  for (const key of PARAM_ORDER) {
    switch (key) {
      case "city":
      case "neighborhood":
      case "q":
        if (filters[key]) push(key, filters[key]!);
        break;
      case "checkIn":
        if (filters.checkIn) push("dates", filters.checkOut ? `${filters.checkIn}/${filters.checkOut}` : filters.checkIn);
        break;
      case "guests":
        if (filters.guests) push("guests", String(filters.guests));
        break;
      case "priceMin":
        if (filters.priceMin !== null || filters.priceMax !== null) push("price");
        break;
      case "sizeMin":
        if (filters.sizeMin !== null || filters.sizeMax !== null) push("size");
        break;
      case "floorMin":
        if (filters.floorMin !== null || filters.floorMax !== null) push("floor");
        break;
      case "bounds":
        if (filters.bounds) push("bounds");
        break;
      default:
        if ((LIST_CHIPS as readonly string[]).includes(key)) {
          for (const value of filters[key as (typeof LIST_CHIPS)[number]]) push(key as ChipKey, value);
        } else if ((VALUE_CHIPS as readonly string[]).includes(key)) {
          const value = filters[key as (typeof VALUE_CHIPS)[number]];
          if (value !== null) push(key as ChipKey, String(value));
        } else if ((FLAG_CHIPS as readonly string[]).includes(key)) {
          if (filters[key as (typeof FLAG_CHIPS)[number]]) push(key as ChipKey);
        }
    }
  }
  return chips;
}

/** Filters without one chip (or without one value of a list chip). Goes back to page 1. */
export function removeFilter(filters: SearchFilters, key: ChipKey, value?: string): SearchFilters {
  const next: SearchFilters = { ...filters, page: 1 };
  switch (key) {
    case "city":
      next.city = null;
      next.neighborhood = null;
      break;
    case "dates":
      next.checkIn = null;
      next.checkOut = null;
      break;
    case "price":
      next.priceMin = null;
      next.priceMax = null;
      break;
    case "size":
      next.sizeMin = null;
      next.sizeMax = null;
      break;
    case "floor":
      next.floorMin = null;
      next.floorMax = null;
      break;
    case "neighborhood":
    case "q":
    case "guests":
    case "bounds":
      next[key] = null;
      break;
    default:
      if ((LIST_CHIPS as readonly string[]).includes(key)) {
        const listKey = key as (typeof LIST_CHIPS)[number];
        const current = filters[listKey] as string[];
        (next as Record<string, unknown>)[listKey] =
          value === undefined ? [] : current.filter((v) => v.toLowerCase() !== value.toLowerCase());
      } else if ((VALUE_CHIPS as readonly string[]).includes(key)) {
        (next as Record<string, unknown>)[key] = null;
      } else if ((FLAG_CHIPS as readonly string[]).includes(key)) {
        (next as Record<string, unknown>)[key] = false;
      }
  }
  return next;
}

/**
 * "Clear all": removes every chip but keeps the deal type, view and sort (the tabs and menus
 * the visitor chose), and the map area in map view.
 */
export function clearFilters(filters: SearchFilters, opts: { keepLocation?: boolean } = {}): SearchFilters {
  const next = emptyFilters();
  next.deal = filters.deal;
  next.view = filters.view;
  next.sort = availableSorts(filters.deal).includes(filters.sort) ? filters.sort : DEFAULT_SORT;
  if (opts.keepLocation) {
    next.city = filters.city;
    next.neighborhood = filters.neighborhood;
    next.bounds = filters.bounds;
  }
  return next;
}

/**
 * Number for the "Filters (3)" button: chips from the filter panel (each list value counts),
 * not the search-bar ones (place, text, dates, guests, map area).
 */
export function countActiveFilters(filters: SearchFilters): number {
  return activeFilterChips(filters).filter((chip) => !SEARCH_BAR_CHIPS.includes(chip.key)).length;
}

/** True when no chip is active. */
export function hasActiveFilters(filters: SearchFilters): boolean {
  return activeFilterChips(filters).length > 0;
}
