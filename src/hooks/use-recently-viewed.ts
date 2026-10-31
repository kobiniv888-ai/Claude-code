"use client";

/**
 * Recently viewed listings (public IDs, newest first, max 12) in localStorage.
 *
 *   useEffect(() => addRecentlyViewed(listing.publicId), [listing.publicId]);   // listing page
 *   const ids = useRecentlyViewed();                                            // widgets
 */
import { createIdListStore, useIdList } from "./local-id-list";

export const RECENTLY_VIEWED_MAX = 12;
const store = createIdListStore("bayit:recently-viewed", RECENTLY_VIEWED_MAX);

export function addRecentlyViewed(publicId: number): void {
  if (typeof window === "undefined") return;
  const current = store.read();
  if (current[0] === publicId) return;
  store.write([publicId, ...current.filter((id) => id !== publicId)].slice(0, RECENTLY_VIEWED_MAX));
}

export function removeRecentlyViewed(publicId: number): void {
  if (typeof window === "undefined") return;
  store.write(store.read().filter((id) => id !== publicId));
}

export function clearRecentlyViewed(): void {
  if (typeof window === "undefined") return;
  store.write([]);
}

/** Public IDs, newest first ([] on the server and before hydration). */
export function useRecentlyViewed(): readonly number[] {
  return useIdList(store);
}
