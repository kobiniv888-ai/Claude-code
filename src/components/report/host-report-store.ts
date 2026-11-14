"use client";

import { useSyncExternalStore } from "react";

/**
 * "Report the host" from the listing page's "…" menus (round 3, brief 8.2). The menus only call
 * requestHostReport(); <HostReportRoot> (mounted once on the page, only for public listings that
 * are not the visitor's own) listens and opens the form. Tiny on purpose: the bars import it.
 */

type Listener = () => void;
const requestListeners = new Set<Listener>();
const availabilityListeners = new Set<Listener>();
let roots = 0;

export function requestHostReport(): void {
  requestListeners.forEach((listener) => listener());
}

/** Called by <HostReportRoot>: from now on the menus show "Report the host". */
export function registerHostReportRoot(onRequest: Listener): () => void {
  requestListeners.add(onRequest);
  roots++;
  availabilityListeners.forEach((l) => l());
  return () => {
    requestListeners.delete(onRequest);
    roots--;
    availabilityListeners.forEach((l) => l());
  };
}

function subscribe(listener: Listener) {
  availabilityListeners.add(listener);
  return () => availabilityListeners.delete(listener);
}

/** True when this page can open the host report (a public listing that is not the visitor's own). */
export function useHostReportAvailable(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => roots > 0,
    () => false,
  );
}
