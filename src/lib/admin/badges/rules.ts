/**
 * "ביקרנו במקום" (round 3, brief 8.3 and 9 "Badges"): the rules for setting the badge (pure,
 * client-safe, unit-tested in ./rules.test.ts).
 *
 * - Only an ADMIN sets or clears it (moderators can see the list, read-only).
 * - It needs the visit date (not in the future, at most VISIT_MAX_AGE_DAYS back) and an internal
 *   note saying who visited. The note is STAFF ONLY: public code reads src/lib/listing/visited.ts, never this.
 * - Demo listings (and listings of demo accounts) never get it; deleted listings neither.
 *
 * Conservative defaults taken without the founder (phase-3 report):
 * - the badge does not expire by itself;
 * - it stays when the host edits the listing, but the badges page shows "changed since the visit"
 *   when the address or pin, or most of the photos, changed after it was set (changedSinceVisit).
 */
import { z } from "zod";
import type { UserRole } from "@/generated/prisma/enums";

export const VISIT_NOTE_MIN = 3;
export const VISIT_NOTE_MAX = 500;
export const CLEAR_NOTE_MAX = 300;
/** A visit date further back than this is refused as a likely typo (2016 for 2026). */
export const VISIT_MAX_AGE_DAYS = 730;

const DAY_MS = 86_400_000;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Only the ADMIN role sets or clears the badge (brief 8.3: "only the admin"). */
export function canSetVisited(role: UserRole | string | null | undefined): boolean {
  return role === "ADMIN";
}

/** "YYYY-MM-DD" when it is a real calendar day, otherwise null. */
export function parseVisitDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = DAY.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return match[0];
}

/** The earliest visit day accepted on `today` ("YYYY-MM-DD"). */
export function earliestVisitDay(today: string): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) - VISIT_MAX_AGE_DAYS * DAY_MS).toISOString().slice(0, 10);
}

export type VisitDateProblem = "invalid" | "future" | "too_old";

/** Why a visit day cannot be saved on `today` (both "YYYY-MM-DD", today in Georgia), or null. */
export function visitDateProblem(value: unknown, today: string): VisitDateProblem | null {
  const day = parseVisitDay(value);
  if (!day) return "invalid";
  if (day > today) return "future";
  if (day < earliestVisitDay(today)) return "too_old";
  return null;
}

export const setVisitSchema = z.object({
  listingId: z.string().trim().min(1).max(64),
  visitedOn: z.string().trim().regex(DAY),
  note: z.string().trim().min(VISIT_NOTE_MIN).max(VISIT_NOTE_MAX),
});
export type SetVisitInput = z.infer<typeof setVisitSchema>;

export const clearVisitSchema = z.object({
  listingId: z.string().trim().min(1).max(64),
  note: z.string().trim().max(CLEAR_NOTE_MAX).optional().default(""),
});

export type VisitTarget = {
  isDemo: boolean;
  deletedAt: Date | null;
  status: string;
  owner: { isDemo: boolean };
};

/** Error codes the admin UI translates (admin.errors.<code>). */
export type VisitRefusal = "visited_demo" | "listing_not_found";

/** Why this listing cannot get the badge, or null. Demo data never does (brief: never invent trust). */
export function visitRefusal(listing: VisitTarget | null): VisitRefusal | null {
  if (!listing || listing.deletedAt || listing.status === "DELETED") return "listing_not_found";
  if (listing.isDemo || listing.owner.isDemo) return "visited_demo";
  return null;
}

/** Error code for a visit date problem (admin.errors.<code>). */
export function visitDateErrorCode(problem: VisitDateProblem): "visit_date_future" | "visit_date_too_old" | "invalid_input" {
  return problem === "future" ? "visit_date_future" : problem === "too_old" ? "visit_date_too_old" : "invalid_input";
}

// ─── Finding a listing ────────────────────────────────────────

const MAX_PUBLIC_ID = 2_147_483_647;

export type ListingQuery = { publicId: number | null; text: string | null };

/**
 * What staff typed into "find a listing": a number ("1234", "#1234", "ID 1234") is the listing's
 * public number (and also tried as text); anything else is part of the title.
 */
export function parseListingQuery(input: string | null | undefined): ListingQuery {
  const query = (input ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (!query) return { publicId: null, text: null };
  const number = /^(?:#|id[\s:#-]*|listing[\s:#-]*)?(\d{1,10})$/i.exec(query);
  if (number) {
    const id = Number(number[1]);
    return { publicId: id >= 1 && id <= MAX_PUBLIC_ID ? id : null, text: null };
  }
  return { publicId: null, text: query.length >= 2 ? query : null };
}

// ─── Changed since the visit ──────────────────────────────────

/**
 * What the listing looked like when the badge was set (kept in the audit entry, so no new
 * column is needed): a keyed hash of the address + pin (never the address itself) and the photo ids.
 */
export type VisitSnapshot = { location: string; photoIds: string[] };

export type CurrentPlace = {
  location: string;
  photos: { id: string; createdAt: Date }[];
};

export type VisitChange = "location" | "photos";

/** Reads a snapshot back from audit details (null when missing or malformed). */
export function snapshotFromDetails(details: unknown): VisitSnapshot | null {
  if (!details || typeof details !== "object") return null;
  const snapshot = (details as { snapshot?: unknown }).snapshot;
  if (!snapshot || typeof snapshot !== "object") return null;
  const { location, photoIds } = snapshot as { location?: unknown; photoIds?: unknown };
  if (typeof location !== "string" || !Array.isArray(photoIds) || !photoIds.every((id) => typeof id === "string")) return null;
  return { location, photoIds: photoIds as string[] };
}

/**
 * "Changed since the visit" (shown on the badges page only; the badge itself stays):
 * - location: the address or pin is not the one of the snapshot;
 * - photos: fewer than half of the photos are ones that were there at the visit (most were
 *   replaced, removed or added).
 * Without a snapshot (an old entry), photos added after the visit day count as new and the
 * location cannot be judged.
 */
export function changedSinceVisit(
  visitedOn: string,
  snapshot: VisitSnapshot | null,
  current: CurrentPlace,
): VisitChange[] {
  const changes: VisitChange[] = [];
  if (snapshot && snapshot.location !== current.location) changes.push("location");

  let kept: number;
  let total: number;
  if (snapshot) {
    const before = new Set(snapshot.photoIds);
    kept = current.photos.filter((photo) => before.has(photo.id)).length;
    total = Math.max(snapshot.photoIds.length, current.photos.length);
  } else {
    const endOfVisit = Date.parse(`${visitedOn}T00:00:00Z`) + DAY_MS;
    kept = current.photos.filter((photo) => photo.createdAt.getTime() < endOfVisit).length;
    total = current.photos.length;
  }
  if (total > 0 && kept * 2 < total) changes.push("photos");
  return changes;
}
