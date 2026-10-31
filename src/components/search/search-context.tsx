"use client";

import { createContext, useCallback, useContext, useMemo, useOptimistic, useTransition, type ReactNode } from "react";
import { useRouter } from "@/i18n/navigation";
import type { SearchFilters } from "@/lib/listing/search-params";
import { searchPath } from "@/lib/listing/urls";
import type { HolidayMark } from "@/lib/search/holiday-marks";

type SearchContextValue = {
  /** The filters on screen: the URL's, plus a change that is still loading (optimistic). */
  filters: SearchFilters;
  /** Results for the URL's filters (server). */
  total: number;
  holidays: HolidayMark[];
  /** Go to other filters (keeps the scroll position; `replace` for map moves). */
  navigate: (next: SearchFilters, options?: { replace?: boolean }) => void;
  /** True while new results are loading. */
  isPending: boolean;
};

const SearchContext = createContext<SearchContextValue | null>(null);

/**
 * Shared state of the search page: the filters from the URL (the server renders the results),
 * navigation that shows a change at once while the new results load, and the holidays for the
 * date pickers.
 */
export function SearchProvider({
  filters,
  total,
  holidays,
  children,
}: {
  filters: SearchFilters;
  total: number;
  holidays: HolidayMark[];
  children: ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(filters);

  const navigate = useCallback(
    (next: SearchFilters, options: { replace?: boolean } = {}) => {
      startTransition(() => {
        setOptimistic(next);
        const href = searchPath(next);
        if (options.replace) router.replace(href, { scroll: false });
        else router.push(href, { scroll: false });
      });
    },
    [router, setOptimistic],
  );

  const value = useMemo(
    () => ({ filters: optimistic, total, holidays, navigate, isPending }),
    [optimistic, total, holidays, navigate, isPending],
  );
  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch(): SearchContextValue {
  const value = useContext(SearchContext);
  if (!value) throw new Error("useSearch() must be used inside <SearchProvider>");
  return value;
}
