"use client";

/**
 * Recently viewed listings on this device (round 3: with timestamps, consent-gated, synced to the
 * account when signed in; see src/lib/recently-viewed).
 *
 *   useEffect(() => addRecentlyViewed(listing.publicId), [listing.publicId]);   // listing page
 *   const ids = useRecentlyViewed();                                            // widgets
 */
import { useMemo } from "react";
import { useHistoryStore } from "@/lib/home/history-store";
import { RECENTLY_VIEWED_KEEP, viewedIds, type ViewedItem } from "@/lib/recently-viewed/core";
import { addDeviceView, clearDeviceViews, NO_VIEWS, recentlyViewedStore, removeDeviceView } from "@/lib/recently-viewed/device";

export const RECENTLY_VIEWED_MAX = RECENTLY_VIEWED_KEEP;

export const addRecentlyViewed = (publicId: number): void => addDeviceView(publicId);
export const removeRecentlyViewed = (publicId: number): void => removeDeviceView(publicId);
export const clearRecentlyViewed = (): void => clearDeviceViews();

/** The device list with view times, newest first ([] on the server, before hydration and without consent). */
export function useRecentlyViewedItems(): readonly ViewedItem[] {
  return useHistoryStore(recentlyViewedStore, NO_VIEWS);
}

/** Public IDs, newest first ([] on the server, before hydration and without consent). */
export function useRecentlyViewed(): readonly number[] {
  const items = useRecentlyViewedItems();
  return useMemo(() => viewedIds(items), [items]);
}
