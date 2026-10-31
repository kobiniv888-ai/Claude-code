/**
 * Who may open a listing page (client-safe, pure).
 *
 * Public only when LIVE, not deleted or past its expiry, the owner's account is active, and —
 * for demo listings — while the "demo data" setting is on. The owner (unless deleted) and staff
 * may preview any other state with a status banner; everyone else gets a 404.
 */
import type { ListingStatus, UserStatus } from "@/generated/prisma/enums";

export type ListingAccessInput = {
  status: ListingStatus;
  ownerId: string;
  isDemo: boolean;
  deletedAt: Date | null;
  expiresAt: Date | null;
  owner: { status: UserStatus; deletedAt: Date | null };
};

export type ListingViewer = {
  id: string;
  /** Staff who may look at listings that are not public (moderation, reports or user support). */
  canPreviewAny: boolean;
} | null;

export type ListingAccess = "public" | "preview" | "none";

/** Why a previewed listing is not public: its status, or a reason a LIVE one is hidden. */
export type PreviewReason = ListingStatus | "EXPIRED_DATE" | "DEMO_HIDDEN" | "OWNER_INACTIVE";

const ACTIVE_OWNER: readonly UserStatus[] = ["ACTIVE", "WARNED"];

export function previewReason(
  listing: ListingAccessInput,
  opts: { demoVisible: boolean; now?: Date },
): PreviewReason | null {
  const now = opts.now ?? new Date();
  if (listing.deletedAt) return "DELETED";
  if (listing.status !== "LIVE") return listing.status;
  if (listing.expiresAt && listing.expiresAt.getTime() <= now.getTime()) return "EXPIRED_DATE";
  if (listing.owner.deletedAt || !ACTIVE_OWNER.includes(listing.owner.status)) return "OWNER_INACTIVE";
  if (listing.isDemo && !opts.demoVisible) return "DEMO_HIDDEN";
  return null;
}

export function isListingPublic(listing: ListingAccessInput, opts: { demoVisible: boolean; now?: Date }): boolean {
  return previewReason(listing, opts) === null;
}

export function listingAccess(
  listing: ListingAccessInput,
  viewer: ListingViewer,
  opts: { demoVisible: boolean; now?: Date },
): ListingAccess {
  if (isListingPublic(listing, opts)) return "public";
  if (!viewer) return "none";
  if (viewer.canPreviewAny) return "preview";
  if (viewer.id === listing.ownerId && !listing.deletedAt && listing.status !== "DELETED") return "preview";
  return "none";
}
