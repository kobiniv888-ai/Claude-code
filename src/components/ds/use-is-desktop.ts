"use client";

import { useSyncExternalStore } from "react";

/**
 * Wide screens (≥ 768px) get a centered dialog instead of a bottom sheet.
 *
 * Its own module, without Radix or vaul, so components that only need to know the screen size
 * (the login dialog's provider) do not pull the sheet code into every page.
 */
const DESKTOP_QUERY = "(min-width: 48rem)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True from 768px up (false while server rendering). */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}
