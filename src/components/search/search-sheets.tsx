"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { PopularPlace } from "./place-combobox";

/** A part of the filters sheet to scroll to when it opens (from the deal, price or rooms chips). */
export type FilterFocus = "deal" | "price" | "rooms" | "jewish";
type SheetKind = "filters" | "sort" | "search";

type SheetsValue = {
  openFilters: (focus?: FilterFocus) => void;
  openSort: () => void;
  openSearch: () => void;
  /** Starts loading a sheet's code (on hover or focus of its opener). */
  preload: (kind: SheetKind) => void;
};

const SheetsContext = createContext<SheetsValue | null>(null);

// The sheets are not part of the page's first load: each loads when it first opens (or when the
// browser is idle, so the first tap is instant).
const loaders = {
  filters: () => import("./filters-sheet"),
  sort: () => import("./sort-sheet"),
  search: () => import("./search-sheet"),
} as const;
const FiltersSheet = dynamic(() => loaders.filters().then((m) => m.FiltersSheet), { ssr: false });
const SortSheet = dynamic(() => loaders.sort().then((m) => m.SortSheet), { ssr: false });
const SearchSheet = dynamic(() => loaders.search().then((m) => m.SearchSheet), { ssr: false });

const preload = (kind: SheetKind) => {
  void loaders[kind]().catch(() => undefined);
};

/**
 * The search page's sheets — filters, sort and the search (place · dates · guests) — opened from
 * the chip row, the results line and the floating pill. Each sheet stays mounted after its first
 * opening so it can slide away when closed.
 */
export function SearchSheets({
  popular,
  placeNames,
  children,
}: {
  popular: PopularPlace[];
  /** City and neighborhood names in the page language (for the filter chips). */
  placeNames: { city: string | null; neighborhood: string | null };
  children: ReactNode;
}) {
  const [open, setOpen] = useState<SheetKind | null>(null);
  const [mounted, setMounted] = useState<readonly SheetKind[]>([]);
  const [focus, setFocus] = useState<FilterFocus | null>(null);

  const show = useCallback((kind: SheetKind) => {
    setMounted((list) => (list.includes(kind) ? list : [...list, kind]));
    setOpen(kind);
  }, []);

  // Fetch the sheets' code once the page is idle: none of it is needed for the first paint.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 2500));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(() => {
      preload("filters");
      preload("sort");
    });
    return () => cancel(id);
  }, []);

  const value = useMemo<SheetsValue>(
    () => ({
      openFilters: (next) => {
        setFocus(next ?? null);
        show("filters");
      },
      openSort: () => show("sort"),
      openSearch: () => show("search"),
      preload,
    }),
    [show],
  );

  const onOpenChange = (kind: SheetKind) => (next: boolean) => setOpen(next ? kind : null);

  return (
    <SheetsContext.Provider value={value}>
      {children}
      {mounted.includes("filters") ? (
        <FiltersSheet open={open === "filters"} onOpenChange={onOpenChange("filters")} focus={focus} placeNames={placeNames} />
      ) : null}
      {mounted.includes("sort") ? <SortSheet open={open === "sort"} onOpenChange={onOpenChange("sort")} /> : null}
      {mounted.includes("search") ? (
        <SearchSheet open={open === "search"} onOpenChange={onOpenChange("search")} popular={popular} placeNames={placeNames} />
      ) : null}
    </SheetsContext.Provider>
  );
}

export function useSearchSheets(): SheetsValue {
  const value = useContext(SheetsContext);
  if (!value) throw new Error("useSearchSheets() must be used inside <SearchSheets>");
  return value;
}
