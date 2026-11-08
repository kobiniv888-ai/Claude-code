"use client";

import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDownIcon, SearchIcon, SlidersHorizontalIcon } from "lucide-react";
import { Chip } from "@/components/ds/chip";
import { useCurrency } from "@/components/providers/currency-provider";
import { formatDate, formatNumber } from "@/lib/format";
import { isSeaTown, isSkiTown } from "@/lib/geo/walk-towns";
import { countActiveFilters, withFilters } from "@/lib/listing/search-params";
import { chipLabel } from "@/lib/search/chip-label";
import { formatStay } from "@/lib/search/format-stay";
import { usesDatesAndGuests } from "@/lib/search/search-bar";
import { cn } from "@/lib/utils";
import { useSearch } from "./search-context";
import { useSearchSheets } from "./search-sheets";
import { setSearchTopHeight } from "./search-top-height";

/**
 * The sticky bar at the top of /search (round 2, brief 5.3):
 * - phones: a summary pill of the search ("Tbilisi · Dec 12–15 · 4 guests") that reopens the
 *   search sheet, and a "סינון" button with the number of filters set;
 * - every screen: a sideways-scrolling chip row — price, rooms, property type and the "כשר ושבת"
 *   quick chip (`?kosherShabbat=1`: a kosher kitchen OR Shabbat-friendly OR kosher hotel meals);
 *   in the sea and ski towns also "קרוב לים" / "קרוב למעליות" (round 3, brief 7.3: ≤ 15 min walk).
 *   Active chips are the purple tint with purple text. From 768px "Filters" leads the chip row
 *   (the full search bar sits above it).
 * Its height is published as --search-top-height for the map view below it (./search-top-height.ts).
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
    const observer = new ResizeObserver(() => setSearchTopHeight(node.offsetHeight));
    observer.observe(node);
    return () => {
      observer.disconnect();
      setSearchTopHeight(null);
    };
  }, []);

  const active = countActiveFilters(filters);
  const label = (key: Parameters<typeof chipLabel>[0]["key"], value?: number | null) =>
    chipLabel(value == null ? { key } : { key, value: String(value) }, filters, { t: chipsT, f, locale, currency, placeNames });
  const priceSet = filters.priceMin !== null || filters.priceMax !== null;
  const rooms = filters.bedrooms ?? filters.rooms;
  const roomsLabel =
    filters.bedrooms !== null ? label("bedrooms", filters.bedrooms) : filters.rooms !== null ? label("rooms", filters.rooms) : t("rooms");
  const types = filters.propertyTypes;
  const typesLabel =
    types.length === 0 ? t("propertyType") : types.length === 1 ? f(`propertyType.${types[0]}`) : t("propertyTypes", { count: types.length });
  const chevron = <ChevronDownIcon className="ms-0.5 inline size-3.5 align-[-0.15em] opacity-70" aria-hidden="true" />;
  const filtersLabel = active > 0 ? `${filtersT("title")} · ${filtersT("activeCount", { count: active })}` : undefined;

  return (
    <div
      ref={bar}
      data-search-top-bar=""
      className={cn(
        "sticky top-(--header-height) z-(--z-sticky) border-b border-border bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/85",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-screen-2xl px-4 pt-2 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 md:hidden">
          <SearchSummary placeNames={placeNames} onOpen={sheets.openSearch} onPreload={() => sheets.preload("search")} />
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={filtersLabel}
            onClick={() => sheets.openFilters()}
            onPointerEnter={() => sheets.preload("filters")}
            onFocus={() => sheets.preload("filters")}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-small font-medium outline-none transition-[transform,background-color] duration-(--motion-fast) active:scale-[0.97] focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:active:scale-100",
              active > 0 ? "border-primary-tint-border bg-primary-tint text-primary-text" : "border-border-strong bg-card text-foreground",
            )}
          >
            <SlidersHorizontalIcon className="size-4.5" aria-hidden="true" />
            {/* Below 390px (long Georgian and Russian labels) the icon and the count carry it. */}
            <span className="max-[389px]:sr-only">{filtersT("title")}</span>
            {active > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-caption leading-none font-semibold text-primary-foreground" dir="ltr">
                {formatNumber(active, locale)}
              </span>
            ) : null}
          </button>
        </div>
        <div
          role="group"
          aria-label={t("chipsLabel")}
          className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 [&::-webkit-scrollbar]:hidden"
        >
          <Chip
            size="sm"
            icon={SlidersHorizontalIcon}
            active={active > 0}
            count={active}
            aria-haspopup="dialog"
            aria-label={filtersLabel}
            onClick={() => sheets.openFilters()}
            onPointerEnter={() => sheets.preload("filters")}
            className="max-md:hidden"
          >
            {filtersT("title")}
          </Chip>
          <Chip size="sm" active={priceSet} aria-haspopup="dialog" onClick={() => sheets.openFilters("price")}>
            {priceSet ? label("price") : t("price")}
            {chevron}
          </Chip>
          <Chip size="sm" active={rooms !== null} aria-haspopup="dialog" onClick={() => sheets.openFilters("rooms")}>
            {roomsLabel}
            {chevron}
          </Chip>
          <Chip size="sm" active={types.length > 0} aria-haspopup="dialog" onClick={() => sheets.openFilters("deal")}>
            {typesLabel}
            {chevron}
          </Chip>
          <Chip
            size="sm"
            pressed={filters.kosherShabbat}
            onClick={() => navigate(withFilters(filters, { kosherShabbat: !filters.kosherShabbat }))}
          >
            {t("quick.kosherShabbat")}
          </Chip>
          {isSeaTown(filters.city) ? (
            <Chip size="sm" pressed={filters.nearSea} onClick={() => navigate(withFilters(filters, { nearSea: !filters.nearSea }))}>
              {t("quick.nearSea")}
            </Chip>
          ) : null}
          {isSkiTown(filters.city) ? (
            <Chip size="sm" pressed={filters.nearLifts} onClick={() => navigate(withFilters(filters, { nearLifts: !filters.nearLifts }))}>
              {t("quick.nearLifts")}
            </Chip>
          ) : null}
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
      className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-border-strong bg-card px-4 text-start outline-none transition-transform duration-(--motion-fast) active:scale-[0.99] focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:active:scale-100"
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
