/**
 * "My listings" rules (pure, client-safe): status filter tabs, which owner actions each status
 * allows (mirrors @/lib/listing/lifecycle), expiry countdowns and "needs attention".
 */
import { siteConfig } from "@/config/site";
import type { DealType, ListingStatus } from "@/generated/prisma/enums";

const DAY_MS = 86_400_000;

/** Filter tabs on /account/listings (?status=…). */
export const LISTING_FILTERS = ["all", "live", "review", "changes", "paused", "expired", "drafts", "closed", "other"] as const;
export type ListingFilter = (typeof LISTING_FILTERS)[number];

const FILTER_STATUSES: Record<Exclude<ListingFilter, "all">, readonly ListingStatus[]> = {
  live: ["LIVE"],
  review: ["IN_REVIEW"],
  changes: ["NEEDS_CHANGES"],
  paused: ["PAUSED"],
  expired: ["EXPIRED"],
  drafts: ["DRAFT"],
  closed: ["RENTED", "SOLD"],
  other: ["REJECTED", "HIDDEN"],
};

/** Every status an owner sees in the dashboard (deleted listings are gone for them). */
export const OWNER_VISIBLE_STATUSES: readonly ListingStatus[] = [
  "LIVE",
  "IN_REVIEW",
  "NEEDS_CHANGES",
  "PAUSED",
  "EXPIRED",
  "DRAFT",
  "RENTED",
  "SOLD",
  "REJECTED",
  "HIDDEN",
];

export function parseListingFilter(value: unknown): ListingFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return (LISTING_FILTERS as readonly string[]).includes(raw as string) ? (raw as ListingFilter) : "all";
}

/** The statuses a filter shows (all owner-visible statuses for "all"). */
export function statusesForFilter(filter: ListingFilter): readonly ListingStatus[] {
  return filter === "all" ? OWNER_VISIBLE_STATUSES : FILTER_STATUSES[filter];
}

export function filterForStatus(status: ListingStatus): ListingFilter {
  for (const [filter, statuses] of Object.entries(FILTER_STATUSES)) {
    if (statuses.includes(status)) return filter as ListingFilter;
  }
  return "all";
}

/** Count per filter tab from a count per status. */
export function countsByFilter(byStatus: Partial<Record<ListingStatus, number>>): Record<ListingFilter, number> {
  const out = Object.fromEntries(LISTING_FILTERS.map((f) => [f, 0])) as Record<ListingFilter, number>;
  for (const status of OWNER_VISIBLE_STATUSES) {
    const n = byStatus[status] ?? 0;
    out.all += n;
    out[filterForStatus(status)] += n;
  }
  return out;
}

/** Whole days until `date` (rounded up; 0 = today or past). Null without a date. */
export function daysUntil(date: Date | string | null | undefined, now: Date = new Date()): number | null {
  if (!date) return null;
  const time = typeof date === "string" ? Date.parse(date) : date.getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.ceil((time - now.getTime()) / DAY_MS));
}

export const EXPIRING_SOON_DAYS = 7;

/** LIVE (or paused) and expiring within `days`. */
export function isExpiringSoon(
  listing: { status: ListingStatus; expiresAt: Date | string | null },
  now: Date = new Date(),
  days = EXPIRING_SOON_DAYS,
): boolean {
  if (listing.status !== "LIVE" && listing.status !== "PAUSED") return false;
  const left = daysUntil(listing.expiresAt, now);
  if (left === null) return false;
  const time = typeof listing.expiresAt === "string" ? Date.parse(listing.expiresAt) : listing.expiresAt!.getTime();
  return time > now.getTime() && left <= days;
}

export type OwnerListingAction =
  | "continue"
  | "edit"
  | "view"
  | "stats"
  | "pause"
  | "unpause"
  | "renew"
  | "markRented"
  | "markSold"
  | "bump"
  | "delete";

/** Lifecycle actions that a server action performs (the rest are links). */
export const MUTATING_ACTIONS = ["pause", "unpause", "renew", "markRented", "markSold", "bump", "delete"] as const;
export type MutatingListingAction = (typeof MUTATING_ACTIONS)[number];

export type OwnerActionInput = {
  status: ListingStatus;
  dealType: DealType;
  expiresAt: Date | string | null;
  publishedAt: Date | string | null;
};

/**
 * Whether a LIVE listing may be renewed now: only in its last expiryWarningDays days (earlier
 * renewListing() is a no-op, so the button would do nothing).
 */
export function canRenewLive(expiresAt: Date | string | null, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const time = typeof expiresAt === "string" ? Date.parse(expiresAt) : expiresAt.getTime();
  if (!Number.isFinite(time)) return false;
  return now.getTime() >= time - siteConfig.listings.expiryWarningDays * DAY_MS;
}

/** The actions shown for a listing, in display order (same rules as @/lib/listing/lifecycle). */
export function ownerActionsFor(
  listing: OwnerActionInput,
  opts: { now?: Date; bumpEnabled?: boolean } = {},
): OwnerListingAction[] {
  const now = opts.now ?? new Date();
  const { status, dealType } = listing;
  if (status === "DELETED") return [];
  if (status === "DRAFT") return ["continue", "delete"];

  const actions: OwnerListingAction[] = ["edit"];
  if (status === "LIVE") actions.push("view");
  if (listing.publishedAt) actions.push("stats");
  if (status === "LIVE") actions.push("pause");
  if (status === "PAUSED") actions.push("unpause");
  if (status === "EXPIRED" || status === "RENTED" || status === "SOLD" || (status === "LIVE" && canRenewLive(listing.expiresAt, now))) {
    actions.push("renew");
  }
  if (status === "LIVE" || status === "PAUSED" || status === "EXPIRED") {
    actions.push(dealType === "SALE" ? "markSold" : "markRented");
  }
  if (status === "LIVE" && opts.bumpEnabled) actions.push("bump");
  actions.push("delete");
  return actions;
}

/** Statuses that need the owner to do something. */
export function needsOwnerAction(status: ListingStatus): boolean {
  return status === "NEEDS_CHANGES" || status === "EXPIRED" || status === "DRAFT";
}
