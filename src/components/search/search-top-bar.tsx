"use client";

import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDownIcon, SearchIcon, SlidersHorizontalIcon } from "lucide-react";
import { Chip, HebrewBubbleIcon, KosherStampIcon, ShabbatCandlesIcon, SynagogueIcon, type IconComponent } from "@/components/ds";
import { useCurrency } from "@/components/providers/currency-provider";
import { formatDate } from "@/lib/format";
import { countActiveFilters, withFilters, type SearchFilters } from "@/lib/listing/search-params";
import { chipLabel } from "@/lib/search/chip-label";
import { formatStay } from "@/lib/search/format-stay";
import { QUICK_CHIPS, quickChipActive, toggleQuickChip, type QuickChip } from "@/lib/search/quick-chips";
import { usesDatesAndGuests } from "@/lib/search/search-bar";
import { cn } from "@/lib/utils";
import { useSearch } from "./search-context";
import { useSearchSheets } from "./search-sheets";

const QUICK_ICONS: Record<QuickChip, IconComponent> = {
  kosher: KosherStampIcon,
  shabbat: ShabbatCandlesIcon,
  synagogue: SynagogueIcon,
  hebrew: HebrewBubbleIcon,
};

/**
 * The sticky bar at the top of /search: on phones a one-line summary of the search ("Tbilisi ·
 * Dec 12–15 · 4 guests") that reopens the search sheet, and on every screen a sideways-scrolling
 * row of chips — Filters (n), deal, price, rooms, and the Jewish quick filters (active = navy).
 * Its height is published as --search-top-height for the map view below it.
 */
export function SearchTopBar({
  placeNames,
  className,
}: {
  placeNames: { city: string | null; neighborhood: string | null };
  className?: string;
}) {
  const t = useTranslations("search.top");
  const filtersT = useTranslations("search.filters");
  const chipsT = useTranslations("search.chips");
  const f = useTranslations("listingFields");
  const locale = useLocale();
  const { currency } = useCurrency();
  const { filters, navigate } = useSearch();
  const sheets = useSearchSheets();
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = bar.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty("--search-top-height", `${node.offsetHeight}px`));
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--search-top-height");
    };
  }, []);

  const active = countActiveFilters(filters);
  const label = (key: Parameters<typeof chipLabel>[0]["key"], value?: number | null) =>
    chipLabel(value == null ? { key } : { key, value: String(value) }, filters, { t: chipsT, f, locale, currency, placeNames });
  const priceSet = filters.priceMin !== null || filters.priceMax !== null;
  const rooms = filters.bedrooms ?? filters.rooms;
  const roomsLabel =
    filters.bedrooms !== null ? label("bedrooms", filters.bedrooms) : filters.rooms !== null ? label("rooms", filters.rooms) : t("rooms");
  const chevron = <ChevronDownIcon className="ms-0.5 inline size-3.5 align-[-0.15em] opacity-70" aria-hidden="true" />;
  const toggle = (patch: Partial<SearchFilters>) => navigate(withFilters(filters, patch));

  return (
    <div
      ref={bar}
      data-search-top-bar=""
      className={cn(
        "sticky top-(--header-height) z-(--z-sticky) border-b border-border/70 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/85",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-screen-2xl px-4 pt-2 sm:px-6 lg:px-8">
        <SearchSummary placeNames={placeNames} onOpen={sheets.openSearch} onPreload={() => sheets.preload("search")} />
        <div
          role="group"
          aria-label={t("chipsLabel")}
          className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-1.5 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 [&::-webkit-scrollbar]:hidden"
        >
          <Chip
            size="sm"
            icon={SlidersHorizontalIcon}
            active={active > 0}
            count={active}
            aria-haspopup="dialog"
            aria-label={active > 0 ? `${filtersT("title")} · ${filtersT("activeCount", { count: active })}` : undefined}
            onClick={() => sheets.openFilters()}
            onPointerEnter={() => sheets.preload("filters")}
          >
            {filtersT("title")}
          </Chip>
          <Chip size="sm" active={filters.deal !== null} aria-haspopup="dialog" onClick={() => sheets.openFilters("deal")}>
            {filters.deal ? f(`dealFilter.${filters.deal}`) : t("deal")}
            {chevron}
          </Chip>
          <Chip size="sm" active={priceSet} aria-haspopup="dialog" onClick={() => sheets.openFilters("price")}>
            {priceSet ? label("price") : t("price")}
            {chevron}
          </Chip>
          <Chip size="sm" active={rooms !== null} aria-haspopup="dialog" onClick={() => sheets.openFilters("rooms")}>
            {roomsLabel}
            {chevron}
          </Chip>
          <span aria-hidden="true" className="mx-0.5 h-6 w-px shrink-0 bg-border" />
          {QUICK_CHIPS.map((chip) => (
            <Chip
              key={chip}
              size="sm"
              icon={QUICK_ICONS[chip]}
              pressed={quickChipActive(filters, chip)}
              onClick={() => toggle(toggleQuickChip(filters, chip))}
            >
              {t(`quick.${chip}`)}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Phones: "Tbilisi · Dec 12–15 · 4 guests" — tap to change the place, dates or guests. */
function SearchSummary({
  placeNames,
  onOpen,
  onPreload,
}: {
  placeNames: { city: string | null; neighborhood: string | null };
  onOpen: () => void;
  onPreload: () => void;
}) {
  const t = useTranslations("search.top");
  const bar = useTranslations("search.bar");
  const locale = useLocale();
  const { filters } = useSearch();

  const place =
    placeNames.neighborhood && placeNames.city
      ? `${placeNames.neighborhood}, ${placeNames.city}`
      : (placeNames.city ?? (filters.q ? `„${filters.q}”` : t("anywhere")));
  const parts: string[] = [];
  if (usesDatesAndGuests(filters.deal)) {
    if (filters.checkIn && filters.checkOut) parts.push(formatStay(filters.checkIn, filters.checkOut, locale));
    else if (filters.checkIn) parts.push(t("moveIn", { date: formatDate(filters.checkIn, locale, { day: "numeric", month: "short" }) }));
    else parts.push(t("anyDates"));
    if (filters.guests) parts.push(bar("guestCount", { count: filters.guests }));
  } else {
    parts.push(bar("deal.buy"));
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerEnter={onPreload}
      onFocus={onPreload}
      aria-haspopup="dialog"
      aria-label={t("summaryLabel", { summary: [place, ...parts].join(" · ") })}
      className="flex h-11 w-full items-center gap-2.5 rounded-full bg-card px-4 text-start shadow-card ring-1 ring-border/70 outline-none transition-transform duration-(--motion-fast) active:scale-[0.99] focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:active:scale-100 md:hidden"
    >
      <SearchIcon className="size-4.5 shrink-0 text-primary" aria-hidden="true" />
      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-small">
        <span className="max-w-[55%] shrink-0 truncate font-semibold text-foreground" dir="auto">
          {place}
        </span>
        {parts.map((part, index) => (
          <span key={index} className={cn("flex min-w-0 items-center gap-1.5 text-muted-foreground", index > 0 && "shrink")}>
            <span aria-hidden="true">·</span>
            <span className="truncate">{part}</span>
          </span>
        ))}
      </span>
    </button>
  );
}
