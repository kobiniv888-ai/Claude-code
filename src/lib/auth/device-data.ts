/**
 * Private data this device keeps for the visitor (pure registry + small browser helpers). Logging
 * out clears it (round 3, bug 2.9); theme, language, cookie consent and the currency choice stay.
 *
 * A feature that stores something personal in localStorage adds its key (or prefix) HERE, so
 * logout clears it too:
 *   - recently viewed and the compare list (src/lib/recently-viewed/device.ts, src/hooks/use-compare.ts)
 *   - the last search (src/lib/home/last-search-store.ts) and the device copy of saved lists (phase 5)
 *   (sessionStorage is cleared whole, including the "merged into the account" flag of recently viewed)
 *   - the remembered phone country (src/lib/auth/phone-defaults.ts)
 *   - trip pages saved for offline use (Cache Storage "bayit-trips", src/lib/trip/offline.ts)
 * Not private, so kept: the theme (next-themes "theme"), "bayit:consent", dismissed alerts and the
 * demo banner, "bayit:safety-tip-seen" (a device hint, not personal data). The language and
 * currency choices are cookies and are not touched either.
 */

export const PRIVATE_STORAGE_KEYS: readonly string[] = [
  "bayit:recently-viewed",
  "bayit:compare",
  "bayit:last-search",
  "bayit:saved-lists",
];

export const PRIVATE_STORAGE_PREFIXES: readonly string[] = ["bayit:phone-country:", "bayit:private:"];

/** sessionStorage flag: the next page shows "התנתקתם" once. */
export const LOGGED_OUT_FLAG = "bayit:logged-out";

/** Which of these storage keys are private (pure). */
export function privateStorageKeys(keys: readonly string[]): string[] {
  return keys.filter(
    (key) => PRIVATE_STORAGE_KEYS.includes(key) || PRIVATE_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix)),
  );
}

type KeyedStorage = Pick<Storage, "length" | "key" | "removeItem">;

/** Removes the private keys from a storage; returns how many went. Never throws. */
export function clearPrivateData(storage: KeyedStorage | null | undefined): number {
  if (!storage) return 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key) keys.push(key);
    }
    const remove = privateStorageKeys(keys);
    for (const key of remove) storage.removeItem(key);
    return remove.length;
  } catch {
    return 0; // storage blocked (private mode): nothing stored to clear
  }
}

/** Cache Storage with trip pages the guest saved for offline use (round 3, src/lib/trip/offline.ts). */
export const PRIVATE_CACHE_NAMES: readonly string[] = ["bayit-trips"];

/**
 * Deletes the private Cache Storage above. Resolves within `maxMs` even when the browser is slow
 * (logout waits for it before leaving the page). Never throws.
 */
export async function clearPrivateCaches(maxMs = 1500): Promise<void> {
  try {
    if (typeof window === "undefined" || !("caches" in window)) return;
    const deletions = Promise.all(PRIVATE_CACHE_NAMES.map((name) => window.caches.delete(name).catch(() => false)));
    await Promise.race([deletions, new Promise((resolve) => window.setTimeout(resolve, maxMs))]);
  } catch {
    // Cache Storage blocked (private mode, insecure origin): nothing saved to clear.
  }
}

/**
 * Clears this device's private data: localStorage keys above, the whole sessionStorage, and (in
 * the background) the saved trip pages; await clearPrivateCaches() before leaving the page.
 */
export function clearPrivateDeviceData(): void {
  try {
    clearPrivateData(window.localStorage);
    window.sessionStorage.clear();
  } catch {
    // Storage blocked: nothing to clear.
  }
  void clearPrivateCaches();
}

export function markLoggedOut(): void {
  try {
    window.sessionStorage.setItem(LOGGED_OUT_FLAG, "1");
  } catch {
    // No storage: the page simply shows no message.
  }
}

/** True once after a logout (the flag is removed as it is read). */
export function takeLoggedOutFlag(): boolean {
  try {
    const set = window.sessionStorage.getItem(LOGGED_OUT_FLAG) === "1";
    if (set) window.sessionStorage.removeItem(LOGGED_OUT_FLAG);
    return set;
  } catch {
    return false;
  }
}
