"use client";

import { useEffect } from "react";

/**
 * Trip pages saved for offline use belong to the account that saved them (round 3, brief 7.1;
 * src/lib/trip/offline.ts). Mounted once in the root layout (src/app/[locale]/layout.tsx), so it
 * runs on the first online page load after anything that ends or changes the session on this
 * device — the session expired, "log out of all devices" or an account deletion from another
 * device, a suspension, another account signing in:
 *   - `owner` null (signed out) → the whole saved-trips cache goes;
 *   - another account's key → that account's copies go (and copies past their keep window);
 *   - `owner` undefined (the account couldn't be checked: a server error) → nothing happens.
 * Offline it does nothing (the saved copy is what the guest needs then). Nearly free on every
 * page: one Cache Storage check; the code that edits the cache loads only when a copy exists.
 */
export function PrivateCacheGuard({ owner }: { owner: string | null | undefined }) {
  useEffect(() => {
    if (owner === undefined) return;
    if (typeof window === "undefined" || !window.isSecureContext || !("caches" in window) || !navigator.onLine) return;
    let alive = true;
    (async () => {
      // "bayit-trips": OFFLINE_TRIPS_CACHE (kept literal so this file stays tiny).
      if (!(await window.caches.has("bayit-trips")) || !alive) return;
      const { reconcileOfflineTrips } = await import("@/lib/trip/offline-device");
      if (alive) await reconcileOfflineTrips(owner);
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [owner]);
  return null;
}
