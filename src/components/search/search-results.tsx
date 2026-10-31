"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { ImageOff, LoaderCircle, MapPin } from "lucide-react";
import { ListingCard } from "@/components/listing/listing-card";
import { Price } from "@/components/listing/price";
import { ListingsMapLoader } from "@/components/maps/listings-map-loader";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import type { Bounds } from "@/lib/geo";
import { withFilters } from "@/lib/listing/search-params";
import type { ListingCardData, ListingMapPoint } from "@/lib/listing/types";
import { cn } from "@/lib/utils";
import { FiltersDialogButton, FiltersSidebar } from "./filters-controls";
import { MapToggleButton, SortSelect, ViewSwitcher } from "./results-toolbar";
import { useSearch } from "./search-context";

const MOVE_DELAY_MS = 600;

export type SearchResultsProps = {
  items: ListingCardData[];
  /** Map points for the whole search (only in the map view). */
  mapPoints: ListingMapPoint[] | null;
  /** Changes with the search but not with the map area, page, sort or view. */
  fitKey: string;
  /** Server-rendered parts. */
  header: ReactNode;
  chips: ReactNode;
  notice: ReactNode;
  pagination: ReactNode;
  empty: ReactNode;
};

/**
 * The results area of /search: filter sidebar + grid/list on desktop, the split list/map view
 * (map on the end side, sticky), and on phones a list with a floating "Map" button or a
 * full-screen map with a card carousel.
 */
export function SearchResults({ items, mapPoints, fitKey, header, chips, notice, pagination, empty }: SearchResultsProps) {
  const { filters, isPending } = useSearch();
  const [hovered, setHovered] = useState<number | null>(null);
  const isMap = filters.view === "map" && mapPoints !== null;

  const list = (
    <ResultList
      items={items}
      variant={filters.view === "list" ? "list" : "grid"}
      compact={isMap}
      highlightedId={hovered}
      onHover={setHovered}
      empty={empty}
    />
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <FiltersDialogButton kind="drawer" className="lg:hidden" />
      {isMap ? <FiltersDialogButton kind="sheet" className="hidden lg:inline-flex" /> : null}
      <div className="ms-auto flex items-center gap-2">
        <SortSelect />
        <ViewSwitcher className="hidden lg:inline-flex" />
      </div>
    </div>
  );

  const body = (
    <div className={cn("grid gap-4 transition-opacity", isPending && "opacity-60 motion-reduce:opacity-80")} aria-busy={isPending}>
      {header}
      {toolbar}
      {chips}
      {notice}
      {list}
      {pagination}
    </div>
  );

  if (isMap) {
    return (
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,45%)] xl:grid-cols-[minmax(0,1fr)_minmax(0,48%)]">
        <div className="hidden px-4 py-5 sm:px-6 lg:block">{body}</div>
        <MapPanel
          items={items}
          points={mapPoints}
          fitKey={fitKey}
          highlightedId={hovered}
          onHighlight={setHovered}
        />
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-screen-2xl px-4 pb-24 sm:px-6 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8 lg:px-8 lg:pb-12 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <FiltersSidebar className="sticky top-[calc(var(--header-height)+1rem)] hidden max-h-[calc(100dvh-var(--header-height)-2rem)] overflow-y-auto overscroll-contain pe-2 pb-6 lg:block" />
        <div className="min-w-0 py-1">{body}</div>
      </div>
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-height)+2rem)] z-30 flex justify-center lg:hidden">
        <MapToggleButton className="pointer-events-auto" />
      </div>
    </>
  );
}

function ResultList({
  items,
  variant,
  compact,
  highlightedId,
  onHover,
  empty,
}: {
  items: ListingCardData[];
  variant: "grid" | "list";
  /** Next to the map: fewer columns. */
  compact: boolean;
  highlightedId: number | null;
  onHover: (id: number | null) => void;
  empty: ReactNode;
}) {
  const t = useTranslations("search.results");
  if (items.length === 0) return <>{empty}</>;
  return (
    <ul
      aria-label={t("listLabel")}
      className={cn(
        variant === "list"
          ? "flex flex-col gap-4"
          : compact
            ? "grid grid-cols-1 gap-x-5 gap-y-6 xl:grid-cols-2"
            : "grid grid-cols-1 gap-x-5 gap-y-6 sm:grid-cols-2 xl:grid-cols-3",
      )}
    >
      {items.map((listing, index) => (
        <li key={listing.id} className="min-w-0">
          <ListingCard
            listing={listing}
            variant={variant}
            priority={index < 3}
            showCompare
            onHover={onHover}
            className={cn(highlightedId === listing.publicId && "ring-2 ring-primary")}
          />
        </li>
      ))}
    </ul>
  );
}

function MapPanel({
  items,
  points,
  fitKey,
  highlightedId,
  onHighlight,
}: {
  items: ListingCardData[];
  points: ListingMapPoint[];
  fitKey: string;
  highlightedId: number | null;
  onHighlight: (id: number | null) => void;
}) {
  const t = useTranslations("search.map");
  const locale = useLocale();
  const { filters, navigate, total, isPending } = useSearch();
  const [moveSearch, setMoveSearch] = useState(filters.bounds !== null);
  const latest = useRef(filters);
  const timer = useRef<number | undefined>(undefined);
  const carousel = useRef<HTMLUListElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const checkboxId = useId();

  // Phones: the map fills the screen between the sticky header and the bottom bar.
  useEffect(() => {
    if (window.matchMedia("(max-width: 1023.98px)").matches) panel.current?.scrollIntoView({ block: "start" });
  }, []);

  useEffect(() => {
    latest.current = filters;
  }, [filters]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onBoundsChange = useCallback(
    (bounds: Bounds) => {
      if (!moveSearch) return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        navigate(withFilters(latest.current, { bounds }), { replace: true });
      }, MOVE_DELAY_MS);
    },
    [moveSearch, navigate],
  );

  function toggleMoveSearch(on: boolean) {
    setMoveSearch(on);
    if (!on) {
      window.clearTimeout(timer.current);
      if (latest.current.bounds) navigate(withFilters(latest.current, { bounds: null }), { replace: true });
    }
  }

  function onSelect(publicId: number) {
    onHighlight(publicId);
    const card = carousel.current?.querySelector<HTMLElement>(`[data-public-id="${publicId}"]`);
    card?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  // Phones: the card in the middle of the carousel lights up its marker.
  useEffect(() => {
    const root = carousel.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        const id = visible ? Number((visible.target as HTMLElement).dataset.publicId) : NaN;
        if (Number.isFinite(id)) onHighlight(id);
      },
      { root, threshold: 0.75 },
    );
    root.querySelectorAll("[data-public-id]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items, onHighlight]);

  return (
    <div
      ref={panel}
      className="relative isolate h-[calc(100dvh-var(--header-height)-var(--bottom-nav-height))] scroll-mt-(--header-height) lg:sticky lg:top-(--header-height) lg:h-[calc(100dvh-var(--header-height))]"
    >
      <ListingsMapLoader
        points={points}
        highlightedId={highlightedId}
        onHighlight={onHighlight}
        onSelect={onSelect}
        fitKey={fitKey}
        initialBounds={filters.bounds}
        onBoundsChange={onBoundsChange}
      />

      {/* Controls over the map. */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[1000] flex flex-wrap items-start justify-between gap-2">
        <div className="pointer-events-auto flex items-center gap-2 lg:hidden">
          <FiltersDialogButton kind="drawer" className="bg-background shadow-md" />
          <span className="rounded-full bg-background px-3 py-2 text-xs font-semibold shadow-md" aria-live="polite">
            {t("count", { count: total, formatted: formatNumber(total, locale) })}
          </span>
        </div>
        <label
          htmlFor={checkboxId}
          className="pointer-events-auto flex cursor-pointer items-center gap-2 rounded-full bg-background px-3.5 py-2 text-sm font-medium shadow-md"
        >
          <Checkbox id={checkboxId} checked={moveSearch} onCheckedChange={(v) => toggleMoveSearch(v === true)} />
          {t("searchAsMove")}
          {isPending ? <LoaderCircle className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" /> : null}
        </label>
      </div>

      {/* Phones: cards over the bottom of the map. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[1000] grid gap-3 lg:hidden">
        <div className="flex justify-center">
          <MapToggleButton className="pointer-events-auto" />
        </div>
        {items.length > 0 ? (
          <ul
            ref={carousel}
            aria-label={t("carouselLabel")}
            className="pointer-events-auto flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
          >
            {items.map((item) => (
              <li key={item.id} data-public-id={item.publicId} className="w-[85%] max-w-sm shrink-0 snap-center">
                <MapCarouselCard listing={item} highlighted={item.publicId === highlightedId} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="pointer-events-auto mx-4 rounded-2xl bg-background p-4 text-center text-sm shadow-md">{t("noResultsHere")}</p>
        )}
      </div>
    </div>
  );
}

function MapCarouselCard({ listing, highlighted }: { listing: ListingCardData; highlighted: boolean }) {
  const photo = listing.photos[0];
  const place = [listing.neighborhoodName, listing.cityName].filter(Boolean).join(" · ");
  return (
    <article
      className={cn(
        "relative flex h-28 overflow-hidden rounded-2xl bg-card shadow-lg ring-1 ring-foreground/10",
        highlighted && "ring-2 ring-primary",
      )}
    >
      <div className="relative w-28 shrink-0 bg-muted">
        {photo ? (
          <Image src={photo.url} alt={photo.alt} fill sizes="112px" className="object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-5" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm leading-snug font-semibold">
          <Link href={listing.href} dir="auto" className="after:absolute after:inset-0 focus-visible:underline">
            {listing.title}
          </Link>
        </h3>
        {place ? (
          <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{place}</span>
          </p>
        ) : null}
        <div className="mt-auto">
          <Price
            amount={listing.price}
            currency={listing.currency}
            period={listing.pricePeriod}
            from={listing.priceIsFrom}
            size="sm"
            showOriginal={false}
          />
        </div>
      </div>
    </article>
  );
}
