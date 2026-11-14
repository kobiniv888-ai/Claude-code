"use client";

import { useSyncExternalStore, type ReactNode } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("load", onChange);
  return () => window.removeEventListener("load", onChange);
}
const pageLoaded = () => document.readyState === "complete";
const notOnServer = () => false;

/**
 * Renders `children` only once the page has finished loading (the window's load event), and
 * `fallback` (nothing by default) before and on the server: for photos below the first screen
 * that the browser would otherwise fetch together with the first screen. Native lazy loading
 * starts every photo within ~1250 px of the screen right after the first layout, so on a phone the
 * home page's city photos competed with its first card photo, fonts and scripts (measured:
 * Lighthouse 89 instead of 93 in the runs where they arrived first). Use it only where the space
 * is reserved (fixed size or aspect ratio) and the content is decorative or repeated in text, so
 * nothing moves and nothing is lost without JavaScript.
 */
export function AfterLoad({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const loaded = useSyncExternalStore(subscribe, pageLoaded, notOnServer);
  return loaded ? children : fallback;
}
