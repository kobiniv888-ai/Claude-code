"use client";

import { useLocale, useTranslations } from "next-intl";
import { RemovableChip } from "@/components/ds/chip";
import { useCurrency } from "@/components/providers/currency-provider";
import { activeFilterChips, clearFilters, removeFilter } from "@/lib/listing/search-params";
import { chipLabel } from "@/lib/search/chip-label";
import { cn } from "@/lib/utils";
import { useSearch } from "./search-context";

/** Removable chips for the active filters, with "Clear all". Renders nothing without filters. */
export function ActiveFilterChips({
  placeNames,
  className,
}: {
  /** City and neighborhood names in the page language (from the server). */
  placeNames: { city: string | null; neighborhood: string | null };
  className?: string;
}) {
  const t = useTranslations("search.chips");
  const s = useTranslations("search.sheet");
  const f = useTranslations("listingFields");
  const locale = useLocale();
  const { currency } = useCurrency();
  const { filters, navigate } = useSearch();
  const chips = activeFilterChips(filters);
  if (chips.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <h2 className="sr-only">{t("heading")}</h2>
      <ul className="contents">
        {chips.map((chip) => {
          const text = chipLabel(chip, filters, { t, f, locale, currency, placeNames });
          return (
            <li key={`${chip.key}:${chip.value ?? ""}`}>
              <RemovableChip
                size="sm"
                removeLabel={s("removeChip", { label: text })}
                onRemove={() => navigate(removeFilter(filters, chip.key, chip.value))}
              >
                <span dir={chip.key === "q" ? "auto" : undefined}>{text}</span>
              </RemovableChip>
            </li>
          );
        })}
      </ul>
      {chips.length > 1 ? (
        <button
          type="button"
          onClick={() => navigate(clearFilters(filters))}
          className="ms-1 min-h-11 rounded-full px-2 text-sm font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {t("clearAll")}
        </button>
      ) : null}
    </div>
  );
}
