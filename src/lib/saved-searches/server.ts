import "server-only";
import type { CurrencyCode } from "@/config/site";
import { tbilisiToday } from "@/lib/booking/dates";
import { db } from "@/lib/db";
import { parseNotificationPrefs } from "@/lib/account/settings-schema";
import {
  MAX_SAVED_SEARCHES,
  datesPassed,
  isSameSearch,
  readStoredFilters,
  savedSearchPath,
  toStoredFilters,
  type SavedSearchCriteria,
} from "./core";

/**
 * Saved searches in the database (round 3, brief 7.4): every function takes the signed-in user's
 * id and touches only that user's rows (`where: { id, userId }`), so the server actions only
 * need to check the session. Pure rules: ./core.ts; the daily email: ./run.ts.
 */

export type SavedSearchRow = {
  id: string;
  name: string;
  query: string;
  currency: CurrencyCode;
  criteria: SavedSearchCriteria;
  active: boolean;
  /** The check-in (or move-in) day is over: nothing is sent for it any more. */
  datesPassed: boolean;
  lastSentAt: Date | null;
  createdAt: Date;
  /** "/search?city=batumi" */
  path: string;
};

const SELECT = { id: true, name: true, filters: true, active: true, lastSentAt: true, createdAt: true } as const;

function toRow(row: { id: string; name: string; filters: unknown; active: boolean; lastSentAt: Date | null; createdAt: Date }, today: string): SavedSearchRow | null {
  const criteria = readStoredFilters(row.filters);
  if (!criteria) return null;
  return {
    id: row.id,
    name: row.name,
    query: criteria.query,
    currency: criteria.currency,
    criteria,
    active: row.active,
    datesPassed: datesPassed(criteria.filters, today),
    lastSentAt: row.lastSentAt,
    createdAt: row.createdAt,
    path: savedSearchPath(criteria.query),
  };
}

/** The user's saved searches, the newest first (rows that cannot be read are left out). */
export async function listSavedSearches(userId: string, now: Date = new Date()): Promise<SavedSearchRow[]> {
  const rows = await db.savedSearch.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: SELECT });
  const today = tbilisiToday(now);
  return rows.map((row) => toRow(row, today)).filter((row): row is SavedSearchRow => row !== null);
}

/** Active saved searches of the user (the account overview's number). */
export function countActiveSavedSearches(userId: string): Promise<number> {
  return db.savedSearch.count({ where: { userId, active: true } });
}

export type CreateSavedSearchResult =
  | { kind: "created"; id: string }
  /** The same search was saved before: nothing new, it is turned back on if it was paused. */
  | { kind: "exists"; id: string; name: string }
  | { kind: "limit" };

/**
 * Saves a search under a name. The same search saved again is not duplicated (its row is
 * reactivated instead). Serialized per user (an advisory lock), so two taps cannot pass the limit
 * or save the same search twice.
 */
export async function createSavedSearch(userId: string, input: { query: string; currency: CurrencyCode; name: string }, now: Date = new Date()): Promise<CreateSavedSearchResult> {
  const stored = toStoredFilters(input.query, input.currency);
  const wanted = readStoredFilters(stored)!;
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`saved-searches:${userId}`}))`;
    const existing = await tx.savedSearch.findMany({ where: { userId }, select: { id: true, name: true, filters: true, active: true } });
    const same = existing.find((row) => {
      const criteria = readStoredFilters(row.filters);
      return criteria !== null && isSameSearch(criteria, wanted);
    });
    if (same) {
      // Saved again while paused: it starts again from now (nothing from the paused days).
      if (!same.active) await tx.savedSearch.update({ where: { id: same.id }, data: { active: true, lastCheckedAt: now } });
      return { kind: "exists", id: same.id, name: same.name };
    }
    if (existing.length >= MAX_SAVED_SEARCHES) return { kind: "limit" };
    const created = await tx.savedSearch.create({
      data: { userId, name: input.name, filters: stored, active: true, lastCheckedAt: null, lastMatchIds: [] },
      select: { id: true },
    });
    return { kind: "created", id: created.id };
  });
}

export async function renameSavedSearch(userId: string, id: string, name: string): Promise<boolean> {
  const { count } = await db.savedSearch.updateMany({ where: { id, userId }, data: { name } });
  return count === 1;
}

/**
 * Pause or resume. Resuming starts from now: places published while it was paused are not sent
 * (the window starts at lastCheckedAt).
 */
export async function setSavedSearchActive(userId: string, id: string, active: boolean, now: Date = new Date()): Promise<boolean> {
  const { count } = await db.savedSearch.updateMany({
    where: { id, userId, active: !active },
    data: active ? { active: true, lastCheckedAt: now } : { active: false },
  });
  if (count === 1) return true;
  // Already in that state (a second tap): fine, as long as the row is the user's.
  return (await db.savedSearch.count({ where: { id, userId } })) === 1;
}

export async function deleteSavedSearch(userId: string, id: string): Promise<boolean> {
  const { count } = await db.savedSearch.deleteMany({ where: { id, userId } });
  return count === 1;
}

/** The two switches of /account/alerts (User.notificationPrefs.email). */
export async function alertEmailSwitches(userId: string): Promise<{ savedSearches: boolean; priceDrops: boolean }> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { notificationPrefs: true } });
  const email = parseNotificationPrefs(user?.notificationPrefs).email;
  return { savedSearches: email.savedSearches, priceDrops: email.priceDrops };
}

/** Saved places with a price alert (the account page's line under the price-drop switch). */
export function countWatchedPlaces(userId: string): Promise<number> {
  return db.favorite.count({ where: { userId, listing: { status: "LIVE", deletedAt: null, isDemo: false, ownerId: { not: userId } } } });
}
