/**
 * The visitor's history on this device (recently viewed, the last search) in localStorage, shared
 * by every component on the page and kept in step across tabs (the "storage" event).
 *
 * Cookie consent: this is a functional preference (round 3, brief 4). The store reads and writes
 * only after the visitor allowed "preferences" (or accepted all); before that it reads as empty
 * and writes nothing. Choosing "necessary only" removes what was stored. The banner's
 * "bayit:consent" event re-reads the store at once.
 *
 * The server render and the first client render see the empty value, so hydration never
 * mismatches; components re-render with the stored value right after.
 */
import { useSyncExternalStore } from "react";
import { CONSENT_EVENT, readConsent } from "@/lib/consent-cookie";
import { mayKeepOnDevice, mustClearDevice } from "@/lib/recently-viewed/core";

export type HistoryStore<T> = {
  /** The stored value (a stable reference until it changes); `empty` without consent. */
  read: () => T;
  /** Saves (nothing happens without consent). An empty value removes the key. */
  write: (value: T) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createHistoryStore<T>({
  key,
  empty,
  parse,
  serialize,
  isEmpty,
}: {
  key: string;
  empty: T;
  /** Lenient: never throws, returns `empty` for anything it does not understand. */
  parse: (value: unknown) => T;
  serialize: (value: T) => unknown;
  isEmpty: (value: T) => boolean;
}): HistoryStore<T> {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null | undefined;
  let cached: T = empty;
  /** The value kept for this page when storage is blocked (private mode). */
  let memory: T | undefined;

  const allowed = () => mayKeepOnDevice(readConsent());

  const read = (): T => {
    if (!allowed()) return empty;
    if (memory !== undefined) return memory;
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      return cached;
    }
    if (raw === cachedRaw) return cached;
    cachedRaw = raw;
    try {
      cached = raw ? parse(JSON.parse(raw)) : empty;
    } catch {
      cached = empty;
    }
    return cached;
  };

  const notify = () => listeners.forEach((listener) => listener());

  const write = (value: T) => {
    if (typeof window === "undefined" || !allowed()) return;
    try {
      if (isEmpty(value)) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, JSON.stringify(serialize(value)));
      memory = undefined;
    } catch {
      memory = isEmpty(value) ? empty : value;
    }
    notify();
  };

  /** "Necessary only": nothing of this stays on the device. */
  const purgeIfDeclined = () => {
    if (!mustClearDevice(readConsent())) return;
    memory = undefined;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage blocked: nothing stored.
    }
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    purgeIfDeclined();
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) listener();
    };
    const onConsent = () => {
      purgeIfDeclined();
      listener();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CONSENT_EVENT, onConsent);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CONSENT_EVENT, onConsent);
    };
  };

  return { read, write, subscribe };
}

/** The store's value, re-rendering when it changes (here, in another tab, or with the cookie choice). */
export function useHistoryStore<T>(store: HistoryStore<T>, empty: T): T {
  return useSyncExternalStore(
    store.subscribe,
    store.read,
    () => empty,
  );
}
