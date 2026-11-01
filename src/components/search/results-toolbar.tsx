"use client";

import { useTranslations } from "next-intl";
import { ArrowDownUpIcon, ChevronDownIcon, LayoutGridIcon, ListIcon, MapIcon } from "lucide-react";
import { DEFAULT_SORT, DEFAULT_VIEW, availableSorts, withFilters } from "@/lib/listing/search-params";
import { cn } from "@/lib/utils";
import { useSearch } from "./search-context";
import { useSearchSheets } from "./search-sheets";

/** "Recommended ▾" next to the count: opens the "Sort by" sheet. */
export function SortButton({ className }: { className?: string }) {
  const t = useTranslations("search.sort");
  const f = useTranslations("listingFields.sort");
  const { filters } = useSearch();
  const { openSort, preload } = useSearchSheets();
  const current = f(availableSorts(filters.deal).includes(filters.sort) ? filters.sort : DEFAULT_SORT);
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={t("open", { sort: current })}
      onClick={openSort}
      onPointerEnter={() => preload("sort")}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 text-small font-semibold text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <ArrowDownUpIcon className="size-4 text-muted-foreground" aria-hidden="true" />
      {current}
      <ChevronDownIcon className="size-4 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

/** Grid · List cards (large screens, next to the map). */
export function ViewSwitcher({ className }: { className?: string }) {
  const t = useTranslations("search.toolbar");
  const f = useTranslations("listingFields.viewMode");
  const { filters, navigate } = useSearch();
  const current = filters.view === "list" ? "list" : "grid";
  return (
    <div role="group" aria-label={t("viewLabel")} className={cn("inline-flex rounded-full bg-muted p-1", className)}>
      {(["grid", "list"] as const).map((view) => {
        const Icon = view === "grid" ? LayoutGridIcon : ListIcon;
        const active = current === view;
        return (
          <button
            key={view}
            type="button"
            aria-pressed={active}
            aria-label={f(view)}
            onClick={() => navigate(withFilters(filters, { view, page: filters.page }))}
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-full outline-none transition-colors duration-(--motion-fast) focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

/**
 * The floating "Map | Sort" pill at the bottom center on phones (above the bottom bar).
 * On the map it reads "List | Sort".
 */
export function MapSortPill({ className }: { className?: string }) {
  const t = useTranslations("search.toolbar");
  const sortT = useTranslations("search.sort");
  const { filters, navigate } = useSearch();
  const { openSort, preload } = useSearchSheets();
  const onMap = filters.view === "map";
  const Icon = onMap ? ListIcon : MapIcon;
  const half =
    "inline-flex h-11 items-center gap-2 px-4 text-small font-semibold outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50";
  return (
    <div
      role="group"
      aria-label={t("pillLabel")}
      className={cn("inline-flex items-center overflow-hidden rounded-full bg-card text-foreground shadow-float ring-1 ring-border/70", className)}
    >
      <button
        type="button"
        onClick={() => navigate(withFilters(filters, { view: onMap ? DEFAULT_VIEW : "map", page: filters.page }))}
        className={cn(half, "ps-5")}
      >
        <Icon className="size-4.5" aria-hidden="true" />
        {onMap ? t("showList") : t("showMap")}
      </button>
      <span aria-hidden="true" className="h-5 w-px bg-border" />
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={openSort}
        onPointerEnter={() => preload("sort")}
        onFocus={() => preload("sort")}
        className={cn(half, "pe-5")}
      >
        <ArrowDownUpIcon className="size-4.5" aria-hidden="true" />
        {sortT("short")}
      </button>
    </div>
  );
}
