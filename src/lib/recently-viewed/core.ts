/**
 * "נצפו לאחרונה" (round 3, brief 4): the pure rules shared by the device copy, the account copy and
 * the merge at sign-in (client-safe, no database).
 *
 * An item is a listing's public ID and when it was viewed (epoch ms). Lists are newest first, one
 * item per listing, at most RECENTLY_VIEWED_KEEP long; the home page shows RECENTLY_VIEWED_SHOW.
 *
 *   addViewed([{ id: 7, at: 1 }], 9, 2)                     → [{ id: 9, at: 2 }, { id: 7, at: 1 }]
 *   mergeViewed([device, account], Date.now())              → one list, the newest view of each listing wins
 *   sanitizeViewed([12, 7], now)                            → the round-2 format (IDs only) still reads
 *
 * Consent: the device copy is a functional preference. It is kept only after the visitor allowed
 * "preferences" (or accepted all); when they chose "necessary only" it is removed. The account copy
 * of a signed-in user is account data and does not depend on the device's cookie choice.
 */
import type { Consent } from "@/lib/consent-cookie";

/** Items kept per list (device and account). */
export const RECENTLY_VIEWED_KEEP = 50;
/** Places the home page shows. */
export const RECENTLY_VIEWED_SHOW = 10;
/** IDs the page asks cards for: a few more than it shows, so hidden or deleted listings are skipped without leaving gaps. */
export const RECENTLY_VIEWED_FETCH = 20;

/** The device copy's localStorage key (also in PRIVATE_STORAGE_KEYS, so logging out clears it). */
export const RECENTLY_VIEWED_STORAGE_KEY = "bayit:recently-viewed";

/** Largest public ID (Postgres INT). */
const MAX_PUBLIC_ID = 2_147_483_647;

export type ViewedItem = { id: number; at: number };

export function isPublicId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= MAX_PUBLIC_ID;
}

/** A view time, never in the future (another device's clock may be ahead) and never negative. */
function clampTime(at: number, now: number): number {
  if (!Number.isFinite(at) || at < 0) return 0;
  return Math.min(Math.floor(at), now);
}

/**
 * Reads a stored list leniently. The round-2 format (public IDs, newest first, no times) is read
 * as views just before `now`, in the same order. Invalid entries are dropped, duplicates keep their
 * newest view, the result is sorted newest first and cut to `max`.
 */
export function sanitizeViewed(value: unknown, now: number, max = RECENTLY_VIEWED_KEEP): ViewedItem[] {
  if (!Array.isArray(value)) return [];
  const items: ViewedItem[] = [];
  value.forEach((entry: unknown, index) => {
    if (isPublicId(entry)) {
      items.push({ id: entry, at: Math.max(0, now - index) });
      return;
    }
    if (entry && typeof entry === "object") {
      const { id, at } = entry as { id?: unknown; at?: unknown };
      if (isPublicId(id) && typeof at === "number") items.push({ id, at: clampTime(at, now) });
    }
  });
  return mergeViewed([items], now, max);
}

/**
 * One list from several: per listing the newest view wins; newest first; at most `max`. On equal
 * times the earlier list (then the earlier position) comes first, so a merge never reorders a
 * list that is already sorted.
 */
export function mergeViewed(lists: readonly (readonly ViewedItem[])[], now: number, max = RECENTLY_VIEWED_KEEP): ViewedItem[] {
  const best = new Map<number, { at: number; rank: number }>();
  let rank = 0;
  for (const list of lists) {
    for (const item of list) {
      rank++;
      if (!isPublicId(item.id)) continue;
      const at = clampTime(item.at, now);
      const seen = best.get(item.id);
      if (!seen || at > seen.at) best.set(item.id, { at, rank });
    }
  }
  return [...best.entries()]
    .sort(([, a], [, b]) => b.at - a.at || a.rank - b.rank)
    .slice(0, Math.max(0, max))
    .map(([id, { at }]) => ({ id, at }));
}

/** The list with this view on top (a listing appears once). */
export function addViewed(list: readonly ViewedItem[], id: number, at: number, max = RECENTLY_VIEWED_KEEP): ViewedItem[] {
  if (!isPublicId(id)) return [...list];
  return [{ id, at }, ...list.filter((item) => item.id !== id)].slice(0, Math.max(0, max));
}

/** The public IDs, newest first. */
export function viewedIds(list: readonly ViewedItem[], max = RECENTLY_VIEWED_KEEP): number[] {
  return list.slice(0, Math.max(0, max)).map((item) => item.id);
}

/** Same listings, same order and same times. */
export function sameViewed(a: readonly ViewedItem[], b: readonly ViewedItem[]): boolean {
  return a.length === b.length && a.every((item, i) => item.id === b[i].id && item.at === b[i].at);
}

// ─── Consent ──────────────────────────────────────────────────

/** May this device keep the visitor's history (recently viewed, last search)? Only with "preferences". */
export function mayKeepOnDevice(consent: Consent | null): boolean {
  return consent?.preferences === true;
}

/** Must this device's history be removed? Yes once the visitor chose without "preferences"; not before they chose. */
export function mustClearDevice(consent: Consent | null): boolean {
  return consent !== null && consent.preferences !== true;
}
