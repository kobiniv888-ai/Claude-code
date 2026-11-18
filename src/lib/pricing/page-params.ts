import { z } from "zod";
import type { DealType, PropertyType } from "@/generated/prisma/enums";
import { DEAL_TYPES, PROPERTY_TYPES_BY_DEAL } from "@/lib/listing/fields";

/**
 * The "מדריך מחירים" page's address (/account/listings/price-guide): which question the host
 * asked. Pure and client-safe (the page's form builds the same address).
 *
 *   ?listing=<id>                                   one of the host's listings
 *   ?city=batumi&deal=SHORT_STAY&type=APARTMENT&size=2   a city, deal type, property type and size
 *
 * `size` is bedrooms (hotels: how many guests the room sleeps), "any" for all sizes; 5 means
 * 5 and more. Anything unknown falls back to "not asked yet" instead of an error.
 */

export const GUIDE_SIZE_OPTIONS = ["any", "0", "1", "2", "3", "4", "5"] as const;
export const GUIDE_GUEST_OPTIONS = ["any", "1", "2", "3", "4", "5"] as const;
export type GuideSizeOption = (typeof GUIDE_SIZE_OPTIONS)[number];

export type GuidePageQuery =
  | { mode: "listing"; listingId: string | null }
  | { mode: "custom"; citySlug: string | null; dealType: DealType; propertyType: PropertyType; size: number | null };

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,64}$/);
const id = z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/);

/** Reads the page's search params; a listing wins over a custom question. */
export function parseGuidePageQuery(params: Record<string, string | string[] | undefined>): GuidePageQuery {
  const listing = id.safeParse(first(params.listing));
  const mode = first(params.mode);
  if (listing.success) return { mode: "listing", listingId: listing.data };
  const custom = mode === "custom" || first(params.city) !== undefined;
  if (!custom) return { mode: "listing", listingId: null };

  const deal = z.enum(DEAL_TYPES).safeParse(first(params.deal));
  const dealType: DealType = deal.success ? deal.data : "SHORT_STAY";
  const allowed = PROPERTY_TYPES_BY_DEAL[dealType];
  const type = first(params.type);
  const propertyType = allowed.find((t) => t === type) ?? allowed[0];
  const sizes: readonly string[] = dealType === "HOTEL_ROOM" ? GUIDE_GUEST_OPTIONS : GUIDE_SIZE_OPTIONS;
  const rawSize = first(params.size);
  const size = rawSize !== undefined && rawSize !== "any" && sizes.includes(rawSize) ? Number(rawSize) : null;
  const city = slug.safeParse(first(params.city));
  return { mode: "custom", citySlug: city.success ? city.data : null, dealType, propertyType, size };
}

/** The page's address for a custom question (the form and the links use it). */
export function guidePageHref(query: GuidePageQuery): { pathname: "/account/listings/price-guide"; query: Record<string, string> } {
  const pathname = "/account/listings/price-guide" as const;
  if (query.mode === "listing") return { pathname, query: query.listingId ? { listing: query.listingId } : {} };
  const out: Record<string, string> = { mode: "custom", deal: query.dealType, type: query.propertyType, size: query.size === null ? "any" : String(query.size) };
  if (query.citySlug) out.city = query.citySlug;
  return { pathname, query: out };
}
