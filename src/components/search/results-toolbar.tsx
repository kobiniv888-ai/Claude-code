"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { ArrowDownUp, LayoutGrid, List, Map as MapIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DEFAULT_VIEW,
  VIEW_MODES,
  availableSorts,
  withFilters,
  type SortOption,
  type ViewMode,
} from "@/lib/listing/search-params";
import { cn } from "@/lib/utils";
import { useSearch } from "./search-context";

/** "Sort: Recommended ▾" — the options the deal offers (price per m² only for sales). */
export function SortSelect({ className }: { className?: string }) {
  const t = useTranslations("search.toolbar");
  const f = useTranslations("listingFields.sort");
  const { filters, navigate } = useSearch();
  const id = useId();
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label htmlFor={id} className="sr-only sm:not-sr-only sm:text-sm sm:text-muted-foreground">
        {t("sortLabel")}
      </label>
      <Select
        value={filters.sort}
        onValueChange={(value) => navigate(withFilters(filters, { sort: value as SortOption }))}
      >
        <SelectTrigger id={id} className="h-10! rounded-full px-3.5 font-medium">
          <ArrowDownUp className="sm:hidden" aria-hidden="true" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="end">
          {availableSorts(filters.deal).map((sort) => (
            <SelectItem key={sort} value={sort}>
              {f(sort)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const VIEW_ICONS: Record<ViewMode, typeof List> = { grid: LayoutGrid, list: List, map: MapIcon };

/** Grid · List · Map (desktop). Phones use the floating map button instead. */
export function ViewSwitcher({ className }: { className?: string }) {
  const t = useTranslations("search.toolbar");
  const f = useTranslations("listingFields.viewMode");
  const { filters, navigate } = useSearch();
  return (
    <div role="group" aria-label={t("viewLabel")} className={cn("inline-flex rounded-full border bg-background p-1", className)}>
      {VIEW_MODES.map((view) => {
        const Icon = VIEW_ICONS[view];
        const active = filters.view === view;
        return (
          <button
            key={view}
            type="button"
            aria-pressed={active}
            onClick={() => navigate(withFilters(filters, { view, page: filters.page }))}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span className="sr-only xl:not-sr-only">{f(view)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The floating "Map" / "List" button on phones. */
export function MapToggleButton({ className }: { className?: string }) {
  const t = useTranslations("search.toolbar");
  const { filters, navigate } = useSearch();
  const onMap = filters.view === "map";
  const Icon = onMap ? List : MapIcon;
  return (
    <button
      type="button"
      onClick={() => navigate(withFilters(filters, { view: onMap ? DEFAULT_VIEW : "map", page: filters.page }))}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold text-background shadow-lg outline-none transition-transform hover:scale-[1.03] focus-visible:ring-4 focus-visible:ring-ring/50 motion-reduce:transition-none",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {onMap ? t("showList") : t("showMap")}
    </button>
  );
}
