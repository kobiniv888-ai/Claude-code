"use client";

/**
 * The compare list (public IDs, max siteConfig.listings.compareMax) in localStorage, synced
 * across tabs.
 *
 *   const compare = useCompare();
 *   compare.has(1234); compare.toggle(1234) → "added" | "removed" | "full"
 */
import { useMemo } from "react";
import { siteConfig } from "@/config/site";
import { createIdListStore, useIdList } from "./local-id-list";

export const COMPARE_MAX = siteConfig.listings.compareMax;
const store = createIdListStore("bayit:compare", COMPARE_MAX);

export type CompareResult = "added" | "removed" | "exists" | "full";

export function addToCompare(publicId: number): CompareResult {
  const current = store.read();
  if (current.includes(publicId)) return "exists";
  if (current.length >= COMPARE_MAX) return "full";
  store.write([...current, publicId]);
  return "added";
}

export function removeFromCompare(publicId: number): CompareResult {
  store.write(store.read().filter((id) => id !== publicId));
  return "removed";
}

export function toggleCompare(publicId: number): CompareResult {
  return store.read().includes(publicId) ? removeFromCompare(publicId) : addToCompare(publicId);
}

export function clearCompare(): void {
  store.write([]);
}

export function useCompare() {
  const ids = useIdList(store);
  return useMemo(
    () => ({
      ids,
      count: ids.length,
      max: COMPARE_MAX,
      isFull: ids.length >= COMPARE_MAX,
      has: (publicId: number) => ids.includes(publicId),
      add: addToCompare,
      remove: removeFromCompare,
      toggle: toggleCompare,
      clear: clearCompare,
    }),
    [ids],
  );
}
