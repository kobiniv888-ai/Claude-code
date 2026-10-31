/**
 * Which filters the filter panel offers for the chosen deal (pure). A filter that cannot match
 * the deal is hidden — no "guests" for a sale, no hotel features for a monthly rental — but a
 * filter that is already set always stays visible, so it can be changed or removed.
 */
import type { PropertyType } from "@/generated/prisma/enums";
import { PROPERTY_TYPES, PROPERTY_TYPES_BY_DEAL } from "@/lib/listing/fields";
import {
  DEAL_FILTER_TYPES,
  activeFilterChips,
  type ChipKey,
  type DealFilter,
  type SearchFilters,
} from "@/lib/listing/search-params";

export const FILTER_SECTIONS = [
  "deal",
  "price",
  "dates",
  "rooms",
  "jewish",
  "amenities",
  "property",
  "owner",
  "listing",
] as const;
export type FilterSection = (typeof FILTER_SECTIONS)[number];

/** The chips each section is responsible for (for its "2 selected" counter and auto-open). */
export const SECTION_CHIPS: Record<FilterSection, readonly ChipKey[]> = {
  deal: ["propertyTypes"],
  price: ["price"],
  dates: ["dates", "guests"],
  rooms: ["rooms", "bedrooms", "bathrooms"],
  jewish: ["kitchen", "shabbatFriendly", "synagogueMaxWalk", "jewish", "hotel", "bigFamily", "sharedRoomFor"],
  amenities: ["amenities"],
  property: ["size", "floor", "condition", "heating", "views", "furnished", "elevator", "buildingAge"],
  owner: ["verifiedOnly", "ownerType"],
  listing: ["hasPhotos", "hasVideo", "postedWithin"],
};

/** Active filters inside one section. */
export function sectionActiveCount(filters: SearchFilters, section: FilterSection): number {
  const keys = SECTION_CHIPS[section];
  return activeFilterChips(filters).filter((chip) => keys.includes(chip.key)).length;
}

/** Property types that exist for a deal filter (all types when no deal is chosen). */
export function propertyTypesFor(deal: DealFilter | null): PropertyType[] {
  if (!deal) return [...PROPERTY_TYPES];
  const allowed = new Set(DEAL_FILTER_TYPES[deal].flatMap((type) => PROPERTY_TYPES_BY_DEAL[type]));
  return PROPERTY_TYPES.filter((type) => allowed.has(type));
}

export type FilterVisibility = {
  price: boolean;
  dates: boolean;
  guests: boolean;
  /** A single "move-in" date instead of a check-in/check-out range. */
  moveIn: boolean;
  hotel: boolean;
  bigFamily: boolean;
  sharedRoomFor: boolean;
  /** Size, floor, condition, heating, views, building age (homes, not hotel rooms). */
  propertyDetails: boolean;
  furnished: boolean;
};

/** What the filter panel shows for these filters. */
export function filterVisibility(filters: SearchFilters): FilterVisibility {
  const { deal } = filters;
  const isSale = deal === "buy";
  const isHotel = deal === "hotels";
  const roomsOnly = filters.propertyTypes.length > 0 && filters.propertyTypes.every((t) => t === "ROOM");
  return {
    // Nightly, monthly and sale prices do not mix: the price range needs a deal type.
    price: deal !== null || filters.priceMin !== null || filters.priceMax !== null,
    dates: !isSale,
    guests: !isSale,
    moveIn: deal === "monthly",
    hotel: deal === null || isHotel || filters.hotel.length > 0,
    bigFamily: !isSale || filters.bigFamily,
    sharedRoomFor:
      ((deal === null || deal === "rent" || deal === "short-stay" || deal === "monthly") &&
        (filters.propertyTypes.length === 0 || filters.propertyTypes.includes("ROOM"))) ||
      filters.sharedRoomFor !== null,
    propertyDetails: !isHotel || hasPropertyDetail(filters),
    furnished: (deal !== "short-stay" && !isHotel && !roomsOnly) || filters.furnished,
  };
}

function hasPropertyDetail(filters: SearchFilters): boolean {
  return (
    filters.sizeMin !== null ||
    filters.sizeMax !== null ||
    filters.floorMin !== null ||
    filters.floorMax !== null ||
    filters.condition.length > 0 ||
    filters.heating.length > 0 ||
    filters.views.length > 0 ||
    filters.buildingAge !== null ||
    filters.elevator
  );
}
