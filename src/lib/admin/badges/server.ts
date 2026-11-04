import "server-only";
import { countryConfig } from "@/config/countries";
import type { Prisma } from "@/generated/prisma/client";
import type { ListingStatus, Locale } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { hmacHash } from "@/lib/crypto";
import { todayIn } from "@/lib/jewish-life/calendar";
import { normalizeSearchText } from "@/lib/search-text";
import { pageInfo, type PageInfo } from "../params";
import { ADMIN_PAGE_SIZE, cityName, coverPhotoSelect, coverUrl, staffNames } from "../server/shared";
import {
  changedSinceVisit,
  parseListingQuery,
  snapshotFromDetails,
  visitRefusal,
  type VisitChange,
  type VisitRefusal,
  type VisitSnapshot,
} from "./rules";

/**
 * Admin → Badges ("ביקרנו במקום") reads (server-only). The internal note is read here and on the
 * admin page only; public loaders select `visitedAt` alone (src/lib/listing/visited.ts).
 */

export const VISIT_SET_ACTION = "listing.visited_set";
export const VISIT_CLEAR_ACTION = "listing.visited_clear";
export const BADGE_SEARCH_LIMIT = 20;
/** Photos compared for "changed since the visit" (a listing has far fewer). */
const MAX_COMPARED_PHOTOS = 80;

/** Today ("YYYY-MM-DD") in the listing's country, for the "not in the future" rule. */
export function visitTodayFor(countryCode?: string | null, now: Date = new Date()): string {
  return todayIn(countryConfig(countryCode).timezone, now);
}

/** A keyed fingerprint of the city, address and pin (≈11 m), so the audit entry never holds the address. */
export function locationKey(place: { cityId: string | null; address: string | null; lat: number | null; lng: number | null }): string {
  const address = normalizeSearchText(place.address ?? "");
  const pin = place.lat !== null && place.lng !== null ? `${place.lat.toFixed(4)},${place.lng.toFixed(4)}` : "";
  return hmacHash(`visit-location|${place.cityId ?? ""}|${address}|${pin}`).slice(0, 32);
}

const placeSelect = {
  cityId: true,
  address: true,
  lat: true,
  lng: true,
  photos: { orderBy: { createdAt: "asc" }, take: MAX_COMPARED_PHOTOS, select: { id: true, createdAt: true } },
} satisfies Prisma.ListingSelect;

type PlaceRow = Prisma.ListingGetPayload<{ select: typeof placeSelect }>;

function currentPlace(row: PlaceRow) {
  return { location: locationKey(row), photos: row.photos };
}

/** What the listing looks like now, saved with the visit (see changedSinceVisit). */
export async function visitSnapshot(listingId: string): Promise<VisitSnapshot | null> {
  const row = await db.listing.findUnique({ where: { id: listingId }, select: placeSelect });
  if (!row) return null;
  const place = currentPlace(row);
  return { location: place.location, photoIds: place.photos.map((photo) => photo.id) };
}

const rowSelect = (locale: string) =>
  ({
    id: true,
    publicId: true,
    title: true,
    status: true,
    isDemo: true,
    deletedAt: true,
    countryCode: true,
    visitedAt: true,
    visitedNote: true,
    visitedById: true,
    owner: { select: { id: true, name: true, isDemo: true } },
    city: { select: { names: true } },
    translations: { where: { locale: locale as Locale }, take: 1, select: { title: true } },
    // The photo ids and dates for "changed since the visit"; the cover thumbnail is read separately.
    ...placeSelect,
  }) satisfies Prisma.ListingSelect;

export type BadgeRow = {
  id: string;
  publicId: number;
  title: string;
  status: ListingStatus;
  isDemo: boolean;
  ownerId: string;
  ownerName: string;
  cityName: string | null;
  thumb: string | null;
  /** "YYYY-MM-DD", or null without the badge. */
  visitedOn: string | null;
  /** STAFF ONLY. */
  visitedNote: string | null;
  visitedByName: string | null;
  /** Today in the listing's country (the date picker's latest day). */
  today: string;
  /** Why the badge cannot be set here (demo, deleted), or null. */
  refusal: VisitRefusal | null;
  /** "Changed since the visit" (only for visited listings). */
  changes: VisitChange[];
};

/** The latest visit snapshot of each listing, from the audit log. */
async function latestSnapshots(listingIds: string[]): Promise<Map<string, VisitSnapshot | null>> {
  const map = new Map<string, VisitSnapshot | null>();
  if (listingIds.length === 0) return map;
  // One row per listing: the latest "set" entry (a new visit date takes a new snapshot; a note
  // edit copies the previous one, see ./actions.ts).
  const entries = await db.auditLog.findMany({
    where: { action: VISIT_SET_ACTION, targetType: "Listing", targetId: { in: listingIds } },
    orderBy: [{ targetId: "asc" }, { createdAt: "desc" }],
    distinct: ["targetId"],
    select: { targetId: true, details: true },
  });
  for (const entry of entries) {
    if (entry.targetId && !map.has(entry.targetId)) map.set(entry.targetId, snapshotFromDetails(entry.details));
  }
  return map;
}

/** The snapshot taken when the current visit was entered (null when there is none). */
export async function latestVisitSnapshot(listingId: string): Promise<VisitSnapshot | null> {
  return (await latestSnapshots([listingId])).get(listingId) ?? null;
}

async function present(where: Prisma.ListingWhereInput, locale: string, opts: { skip?: number; take: number; orderBy: Prisma.ListingOrderByWithRelationInput[] }): Promise<BadgeRow[]> {
  const rows = await db.listing.findMany({
    where,
    orderBy: opts.orderBy,
    skip: opts.skip,
    take: opts.take,
    select: rowSelect(locale),
  });
  if (rows.length === 0) return [];
  const [covers, snapshots, names] = await Promise.all([
    db.listing.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true, photos: coverPhotoSelect } }),
    latestSnapshots(rows.filter((r) => r.visitedAt).map((r) => r.id)),
    staffNames(rows.map((r) => r.visitedById)),
  ]);
  const coverById = new Map(covers.map((c) => [c.id, coverUrl(c.photos)]));
  return rows.map((row) => {
    const visitedOn = row.visitedAt ? row.visitedAt.toISOString().slice(0, 10) : null;
    return {
      id: row.id,
      publicId: row.publicId,
      title: row.translations[0]?.title?.trim() || row.title.trim(),
      status: row.status,
      isDemo: row.isDemo,
      ownerId: row.owner.id,
      ownerName: row.owner.name,
      cityName: cityName(row.city, locale),
      thumb: coverById.get(row.id) ?? null,
      visitedOn,
      visitedNote: row.visitedNote,
      visitedByName: row.visitedById ? (names.get(row.visitedById) ?? null) : null,
      today: visitTodayFor(row.countryCode),
      refusal: visitRefusal(row),
      changes: visitedOn ? changedSinceVisit(visitedOn, snapshots.get(row.id) ?? null, currentPlace(row)) : [],
    };
  });
}

const notDeleted: Prisma.ListingWhereInput = { deletedAt: null, status: { not: "DELETED" } };

/** Listings with the badge, latest visit first. */
export async function listVisitedListings(page: number, locale: string): Promise<{ rows: BadgeRow[]; info: PageInfo }> {
  const where: Prisma.ListingWhereInput = { ...notDeleted, visitedAt: { not: null } };
  const total = await db.listing.count({ where });
  const info = pageInfo(total, page, ADMIN_PAGE_SIZE);
  const rows = await present(where, locale, { skip: info.skip, take: info.pageSize, orderBy: [{ visitedAt: "desc" }, { publicId: "desc" }] });
  return { rows, info };
}

/** "Find a listing" by its number or part of its title (any status except deleted; demo ones show why they can't). */
export async function findListingsForBadge(query: string, locale: string): Promise<BadgeRow[]> {
  const { publicId, text } = parseListingQuery(query);
  const or: Prisma.ListingWhereInput[] = [];
  if (publicId !== null) or.push({ publicId });
  if (text) {
    or.push({ title: { contains: text, mode: "insensitive" } });
    const normalized = normalizeSearchText(text);
    if (normalized) or.push({ searchText: { contains: normalized } });
  }
  if (or.length === 0) return [];
  return present({ ...notDeleted, OR: or }, locale, { take: BADGE_SEARCH_LIMIT, orderBy: [{ publicId: "desc" }] });
}
