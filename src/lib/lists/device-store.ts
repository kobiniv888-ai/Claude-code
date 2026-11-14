/**
 * The smallest part of the device copy of saved lists (localStorage "bayit:saved-lists"): reading
 * the raw value, announcing changes, and `useDeviceSaved` for the heart on every card. Kept apart
 * from ./device.ts and ./core.ts so that the heart, which is on most public pages, only carries
 * this much code; everything else loads at the first tap.
 */
import { useSyncExternalStore } from "react";

export const DEVICE_LISTS_KEY = "bayit:saved-lists";

const listeners = new Set<() => void>();

export function deviceStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // blocked (private mode, settings)
  }
}

export function readDeviceRaw(): string | null {
  try {
    return deviceStorage()?.getItem(DEVICE_LISTS_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Tells every subscriber (hearts, the saved page) that the device copy changed. */
export function notifyDeviceLists(): void {
  for (const listener of listeners) listener();
}

export function subscribeDeviceLists(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === DEVICE_LISTS_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

let savedCache: { raw: string | null; ids: ReadonlySet<string> } = { raw: null, ids: new Set() };

/** The listing ids saved on this device (a quick read; ./core.ts sanitizes the full shape). */
function savedIds(): ReadonlySet<string> {
  const raw = readDeviceRaw();
  if (raw === savedCache.raw) return savedCache.ids;
  const ids = new Set<string>();
  try {
    const items = raw ? (JSON.parse(raw) as { items?: unknown }).items : null;
    if (Array.isArray(items)) {
      for (const item of items) {
        const id = (item as { listingId?: unknown } | null)?.listingId;
        if (typeof id === "string") ids.add(id);
      }
    }
  } catch {
    // Not JSON: nothing saved.
  }
  savedCache = { raw, ids };
  return ids;
}

const serverFalse = () => false;

/** Whether this device saved the place (false during server rendering and hydration). */
export function useDeviceSaved(listingId: string): boolean {
  return useSyncExternalStore(subscribeDeviceLists, () => savedIds().has(listingId), serverFalse);
}
