"use client";

import { useTranslations } from "next-intl";
import { CheckIcon } from "lucide-react";
import { BottomSheet } from "@/components/ds";
import { availableSorts, withFilters } from "@/lib/listing/search-params";
import { cn } from "@/lib/utils";
import { useSearch } from "./search-context";

/** "Sort by": full-width options, the chosen one highlighted. A choice applies and closes. */
export function SortSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("search.sort");
  const f = useTranslations("listingFields.sort");
  const { filters, navigate } = useSearch();

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("title")}>
      <div role="radiogroup" aria-label={t("title")} className="-mx-2 grid gap-1">
        {availableSorts(filters.deal).map((sort) => {
          const selected = sort === filters.sort;
          return (
            <button
              key={sort}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                onOpenChange(false);
                if (!selected) navigate(withFilters(filters, { sort }));
              }}
              className={cn(
                "flex min-h-12 w-full items-center justify-between gap-3 rounded-input px-4 text-start text-body outline-none transition-colors duration-(--motion-fast)",
                "focus-visible:ring-3 focus-visible:ring-ring/50",
                selected ? "bg-navy-soft font-semibold text-navy" : "text-foreground hover:bg-muted",
              )}
            >
              {f(sort)}
              {selected ? <CheckIcon className="size-5 shrink-0" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
