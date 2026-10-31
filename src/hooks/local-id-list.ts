/**
 * A list of listing public IDs kept in localStorage, shared by every component on the page and
 * synced across tabs (the "storage" event). Used by recently viewed and compare.
 * Server render and the first client render see an empty list, so hydration never mismatches.
 */
import { useSyncExternalStore } from "react";

export type IdListStore = {
  /** Current IDs (a stable array reference until the list changes). */
  read: () => readonly number[];
  write: (ids: readonly number[]) => void;
  subscribe: (listener: () => void) => () => void;
};

const EMPTY: readonly number[] = Object.freeze([]);

export function sanitizeIds(value: unknown, max: number): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const item of value) {
    if (typeof item === "number" && Number.isSafeInteger(item) && item > 0 && !out.includes(item)) out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

export function createIdListStore(key: string, max: number): IdListStore {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null | undefined;
  let cached: readonly number[] = EMPTY;

  const read = (): readonly number[] => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      return cached; // storage blocked (private mode, cookies off)
    }
    if (raw === cachedRaw) return cached;
    cachedRaw = raw;
    try {
      const ids = sanitizeIds(raw ? JSON.parse(raw) : [], max);
      cached = ids.length ? Object.freeze(ids) : EMPTY;
    } catch {
      cached = EMPTY;
    }
    return cached;
  };

  const notify = () => listeners.forEach((listener) => listener());

  const write = (ids: readonly number[]) => {
    const clean = sanitizeIds(ids, max);
    try {
      if (clean.length) window.localStorage.setItem(key, JSON.stringify(clean));
      else window.localStorage.removeItem(key);
    } catch {
      // Keep the list in memory for this page when storage is unavailable.
      cachedRaw = undefined;
      cached = clean.length ? Object.freeze(clean) : EMPTY;
    }
    notify();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  };

  return { read, write, subscribe };
}

const serverSnapshot = () => EMPTY;

/** The store's IDs, re-rendering when they change (here or in another tab). */
export function useIdList(store: IdListStore): readonly number[] {
  return useSyncExternalStore(store.subscribe, store.read, serverSnapshot);
}
