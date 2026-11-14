import { useSyncExternalStore, type CSSProperties } from "react";

/**
 * The height of the search page's sticky top bar (<SearchTopBar>), for the map view below it
 * (--search-top-height). It used to be written on <html>: each write made the browser recalculate
 * the styles of the whole page (a 25–50 ms task on a phone, right after the page loaded), although
 * only the map column uses it. Now the bar reports its height here and only the elements that use
 * the value carry it (useSearchTopHeightStyle), and only when it changes.
 */

let height: number | null = null;
const listeners = new Set<() => void>();

/** Called by <SearchTopBar> (null when it unmounts). Does nothing when the height is the same. */
export function setSearchTopHeight(value: number | null): void {
  if (value === height) return;
  height = value;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** `style` for an element whose classes use var(--search-top-height, …); undefined until measured. */
export function useSearchTopHeightStyle(): CSSProperties | undefined {
  const value = useSyncExternalStore(
    subscribe,
    () => height,
    () => null,
  );
  return value === null ? undefined : ({ "--search-top-height": `${value}px` } as CSSProperties);
}
