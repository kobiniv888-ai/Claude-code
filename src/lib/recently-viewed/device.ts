/**
 * The device copy of "נצפו לאחרונה" (localStorage "bayit:recently-viewed", consent-gated by
 * createHistoryStore): [{ id, at }] newest first, at most RECENTLY_VIEWED_KEEP. Browser only;
 * the functions do nothing on the server. Components use the hooks in @/hooks/use-recently-viewed.
 */
import { createHistoryStore } from "@/lib/home/history-store";
import {
  addViewed,
  RECENTLY_VIEWED_KEEP,
  RECENTLY_VIEWED_STORAGE_KEY,
  sanitizeViewed,
  type ViewedItem,
} from "./core";

export const NO_VIEWS: readonly ViewedItem[] = Object.freeze([]);

export const recentlyViewedStore = createHistoryStore<readonly ViewedItem[]>({
  key: RECENTLY_VIEWED_STORAGE_KEY,
  empty: NO_VIEWS,
  parse: (value) => {
    const items = sanitizeViewed(value, Date.now(), RECENTLY_VIEWED_KEEP);
    return items.length ? Object.freeze(items) : NO_VIEWS;
  },
  serialize: (items) => items.map(({ id, at }) => ({ id, at })),
  isEmpty: (items) => items.length === 0,
});

/** Puts this listing on top of the device list (with consent). */
export function addDeviceView(publicId: number, at = Date.now()): void {
  if (typeof window === "undefined") return;
  const current = recentlyViewedStore.read();
  if (current[0]?.id === publicId) return;
  recentlyViewedStore.write(addViewed(current, publicId, at));
}

export function removeDeviceView(publicId: number): void {
  if (typeof window === "undefined") return;
  recentlyViewedStore.write(recentlyViewedStore.read().filter((item) => item.id !== publicId));
}

export function setDeviceViews(items: readonly ViewedItem[]): void {
  if (typeof window === "undefined") return;
  recentlyViewedStore.write(sanitizeViewed(items, Date.now()));
}

export function clearDeviceViews(): void {
  if (typeof window === "undefined") return;
  recentlyViewedStore.write(NO_VIEWS);
}

/**
 * sessionStorage flag: this tab already merged the device list into the signed-in account. The
 * merge is idempotent, so the flag only saves requests; logging out clears sessionStorage.
 */
const MERGED_FLAG = "bayit:recently-viewed-merged";

export function deviceMergedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(MERGED_FLAG) === "1";
  } catch {
    return false;
  }
}

export function markDeviceMerged(): void {
  try {
    window.sessionStorage.setItem(MERGED_FLAG, "1");
  } catch {
    // No storage: the next page may merge again (harmless).
  }
}
