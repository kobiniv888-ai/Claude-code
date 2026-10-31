"use client";

import { useLocale, useTranslations } from "next-intl";
import { X } from "lucide-react";
import { useCurrency } from "@/components/providers/currency-provider";
import { formatArea, formatDate, formatMoney, formatNumber } from "@/lib/format";
import { formatStay } from "@/lib/search/format-stay";
import {
  activeFilterChips,
  clearFilters,
  removeFilter,
  type FilterChip,
  type SearchFilters,
} from "@/lib/listing/search-params";
import { cn } from "@/lib/utils";
import { useSearch } from "./search-context";

type Translator = ReturnType<typeof useTranslations>;

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
  const f = useTranslations("listingFields");
  const locale = useLocale();
  const { currency } = useCurrency();
  const { filters, navigate } = useSearch();
  const chips = activeFilterChips(filters);
  if (chips.length === 0) return null;

  const label = (chip: FilterChip) => chipLabel(chip, filters, { t, f, locale, currency, placeNames });

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <h2 className="sr-only">{t("heading")}</h2>
      <ul className="contents">
        {chips.map((chip) => {
          const text = label(chip);
          return (
            <li key={`${chip.key}:${chip.value ?? ""}`}>
              <button
                type="button"
                onClick={() => navigate(removeFilter(filters, chip.key, chip.value))}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-primary/25 bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground transition-colors outline-none hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span dir={chip.key === "q" ? "auto" : undefined}>{text}</span>
                <X className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="sr-only">{t("remove")}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {chips.length > 1 ? (
        <button
          type="button"
          onClick={() => navigate(clearFilters(filters))}
          className="ms-1 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t("clearAll")}
        </button>
      ) : null}
    </div>
  );
}

function chipLabel(
  chip: FilterChip,
  filters: SearchFilters,
  ctx: {
    t: Translator;
    f: Translator;
    locale: string;
    currency: ReturnType<typeof useCurrency>["currency"];
    placeNames: { city: string | null; neighborhood: string | null };
  },
): string {
  const { t, f, locale, currency, placeNames } = ctx;
  const value = chip.value ?? "";
  const money = (amount: number) => `⁦${formatMoney(amount, currency, locale, { maximumFractionDigits: 0 })}⁩`;
  const range = (min: number | null, max: number | null, show: (n: number) => string) =>
    min !== null && max !== null
      ? t("between", { min: show(min), max: show(max) })
      : min !== null
        ? t("atLeast", { min: show(min) })
        : t("atMost", { max: show(max ?? 0) });

  switch (chip.key) {
    case "city":
      return placeNames.city ?? value;
    case "neighborhood":
      return placeNames.neighborhood ?? value;
    case "q":
      return t("text", { q: value });
    case "dates":
      if (!filters.checkIn) return "";
      if (!filters.checkOut) {
        return t("moveIn", { date: formatDate(filters.checkIn, locale, { day: "numeric", month: "short" }) });
      }
      return formatStay(filters.checkIn, filters.checkOut, locale);
    case "guests":
      return f("facts.guests", { count: filters.guests ?? 0 });
    case "price":
      return range(filters.priceMin, filters.priceMax, money);
    case "rooms":
      return t("minRooms", { value: formatNumber(Number(value), locale) });
    case "bedrooms":
      return t("minBedrooms", { value: formatNumber(Number(value), locale) });
    case "bathrooms":
      return t("minBathrooms", { value: formatNumber(Number(value), locale) });
    case "propertyTypes":
      return f(`propertyType.${value}`);
    case "amenities":
      return value === "pets_allowed" || value === "smoking_allowed" ? f(`houseRule.${value}`) : f(`amenity.${value}`);
    case "kitchen":
      return f(`kitchenFilter.${value}`);
    case "jewish":
      return f(`jewishFeature.${value}`);
    case "hotel":
      return f(`hotelJewishFeature.${value}`);
    case "synagogueMaxWalk":
      return f("filter.synagogueMaxWalk", { count: Number(value) });
    case "sharedRoomFor":
      return f(`sharedRoomFor.${value}`);
    case "ownerType":
      return f(`ownerType.${value}`);
    case "postedWithin":
      return f(`postedWithin.${value}`);
    case "condition":
      return f(`condition.${value}`);
    case "heating":
      return f(`heating.${value}`);
    case "views":
      return f(`view.${value}`);
    case "buildingAge":
      return f(`buildingAge.${value}`);
    case "size":
      return range(filters.sizeMin, filters.sizeMax, (n) => formatArea(n, locale));
    case "floor":
      return t("floor", { range: range(filters.floorMin, filters.floorMax, (n) => formatNumber(n, locale)) });
    case "bounds":
      return t("mapArea");
    case "shabbatFriendly":
    case "bigFamily":
    case "verifiedOnly":
    case "hasPhotos":
    case "hasVideo":
    case "furnished":
    case "elevator":
      return f(`filter.${chip.key}`);
  }
}
