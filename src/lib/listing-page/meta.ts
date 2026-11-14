/**
 * The listing page's title, description lead and breadcrumb trail (round 3, brief 10: "a unique
 * title and description for every page"; breadcrumbs as structured data). Pure: the page passes
 * in its translations and what the database said, so the rules are unit-tested (meta.test.ts).
 */
import type { DealType } from "@/generated/prisma/enums";
import { CITY_PAGE_TYPE_KEYS, cityOverviewPath, cityPagePath, cityPageTypeForDealType } from "@/lib/city-pages/core";
import type { BreadcrumbItem } from "@/lib/seo";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** "Vake, Tbilisi": the neighborhood (when known) and the city. */
export function listingPlace(neighborhoodName: string | null | undefined, cityName: string | null | undefined): string {
  return [neighborhoodName, cityName].filter(Boolean).join(", ");
}

export type ListingTitleInput = {
  /** The owner's title in the visitor's language. */
  title: string;
  cityName: string | null;
  neighborhoodName: string | null;
  publicId: number;
  /** Another live public listing in the same city has the same title (sameTitleInCity). */
  titleTaken: boolean;
};

/**
 * "Sunny flat · Vake, Tbilisi". Owners often type generic titles ("Apartment in Batumi"), so the
 * neighborhood is added when it is known, and when another live listing in the city still has the
 * same title, the public ID too ("… · #1234"): no two indexed listings share a title.
 * `t` is the "listing" namespace (meta.title / meta.titleWithId).
 */
export function listingMetaTitle(input: ListingTitleInput, t: Translate): string {
  if (!input.cityName) return input.title;
  const values = { title: input.title, city: listingPlace(input.neighborhoodName, input.cityName) };
  return input.titleTaken ? t("meta.titleWithId", { ...values, id: String(input.publicId) }) : t("meta.title", values);
}

export type ListingLeadInput = {
  /** "₾120 / night" (already formatted), or null without a price. */
  price: string | null;
  bedrooms: number | null;
  /** The size, already formatted ("65 m²"), or null. */
  size: string | null;
  place: string;
};

/**
 * The start of the description: "₾120 / night · 2 bedrooms · Vake, Tbilisi". The main size fact
 * (bedrooms, "Studio", else the size in m²) tells similar listings apart before the owner's text.
 * `tFacts` is the "listingFields.facts" namespace.
 */
export function listingMetaLead(input: ListingLeadInput, tFacts: Translate): string {
  const size =
    input.bedrooms !== null && input.bedrooms !== undefined && input.bedrooms >= 0
      ? input.bedrooms === 0
        ? tFacts("studio")
        : tFacts("bedrooms", { count: input.bedrooms })
      : input.size;
  return [input.price, size, input.place].filter(Boolean).join(" · ");
}

export type ListingCrumbsInput = {
  title: string;
  /** The listing's path without the locale ("/listing/89-sunny-flat"). */
  path: string;
  dealType: DealType;
  city: { slug: string; name: string } | null;
  /** The city has city pages (an active city whose slug can have them: findCityPageCity). */
  cityHasPages: boolean;
  /** The search's address for the city ("/search?city=batumi"), the fallback without city pages. */
  citySearchPath: string;
  labels: {
    home: string;
    /** "Listings": the search, when the city has no pages. */
    search: string;
    /** The city page type's name ("Short stays"), by CITY_PAGE_TYPE_KEYS key. */
    types: Record<(typeof CITY_PAGE_TYPE_KEYS)[keyof typeof CITY_PAGE_TYPE_KEYS], string>;
  };
};

/**
 * The trail above the gallery and in the BreadcrumbList (seo-7), the same as the city pages':
 * Home → Batumi (/batumi) → Short stays (/batumi/short-stays) → the listing. A city without pages
 * keeps the search: Home → Listings → Batumi (/search?city=batumi) → the listing.
 */
export function listingBreadcrumbs(input: ListingCrumbsInput): BreadcrumbItem[] {
  const home = { name: input.labels.home, path: "/" };
  const last = { name: input.title, path: input.path };
  if (input.city && input.cityHasPages) {
    const type = cityPageTypeForDealType(input.dealType);
    return [
      home,
      { name: input.city.name, path: cityOverviewPath(input.city.slug) },
      { name: input.labels.types[CITY_PAGE_TYPE_KEYS[type]], path: cityPagePath(input.city.slug, type) },
      last,
    ];
  }
  return [
    home,
    { name: input.labels.search, path: "/search" },
    ...(input.city ? [{ name: input.city.name, path: input.citySearchPath }] : []),
    last,
  ];
}
