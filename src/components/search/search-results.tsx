"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { MapIcon, ShieldCheckIcon } from "lucide-react";
import { ListingCardSkeleton } from "@/components/listing/listing-card-skeleton";
import { preferredCardTags, stayNights, type CardTagKind } from "@/components/listing/card-tags";
import { ListingCard, type ListingCardVariant } from "@/components/listing/listing-card";
import { ListingsMapLoader } from "@/components/maps/listings-map-loader";
import type { Bounds } from "@/lib/geo";
import { DEFAULT_SORT, DEFAULT_VIEW, serializeSearchQuery, withFilters } from "@/lib/listing/search-params";
import type { ListingCardData, ListingMapPoint } from "@/lib/listing/types";
import { scrollBehavior } from "@/lib/motion";
import { getSearchMapPoints } from "@/lib/search/actions";
import { cn } from "@/lib/utils";
import { resultListClass } from "./result-cards";
import { MapPill, SortButton, ViewSwitcher } from "./results-toolbar";
import { useSearch } from "./search-context";
import { useMediaQuery } from "./use-media-query";

const MOVE_DELAY_MS = 600;

export type SearchResultsProps = {
  items: ListingCardData[];
  /** Map points for the whole search (only in the map view; large screens fetch their own otherwise). */
  mapPoints: ListingMapPoint[] | null;
  /** Changes with the search but not with the map area, page, sort or view. */
  fitKey: string;
  /** Server-rendered parts. */
  header: ReactNode;
  /** The grid/list view's cards (<ResultCards>); null in the map view or without results. */
  cards: ReactNode;
  chips: ReactNode;
  notice: ReactNode;
  pagination: ReactNode;
  empty: ReactNode;
};

/**
 * The results area of /search. Phones: the count and sort line, the cards, and a floating
 * "Map | Sort" pill — or, in the map view, a full-screen map with a card carousel. From 1024px:
 * the list on one side and the map on the other (sticky), with "search as I move the map".
 * While new results load, the cards fade into shimmering skeletons (after a short delay, so fast
 * changes do not flash).
 */
export function SearchResults({ items, mapPoints, fitKey, header, cards, chips, notice, pagination, empty }: SearchResultsProps) {
  const t = useTranslations("search.results");
  const { filters, isPending } = useSearch();
  const [hovered, setHovered] = useState<number | null>(null);
  const wide = useMediaQuery("(min-width: 1024px)");
  const phoneMap = filters.view === "map" && mapPoints !== null;
  const variant: ListingCardVariant = filters.view === "list" ? "list" : "grid";

  // The server's cards (hover syncs with the map through data-public-id), except in the map view,
  // where the client list keeps the hovered card and pin in sync.
  const list =
    !phoneMap && cards ? (
      <div onPointerOver={(event) => setHovered(publicIdAt(event))} onPointerLeave={() => setHovered(null)}>
        <HighlightStyle id={hovered} />
        <Fragment key="cards">{cards}</Fragment>
      </div>
    ) : (
      <ResultList
        items={items}
        variant={variant}
        nights={stayNights(filters.checkIn, filters.checkOut)}
        preferTags={preferredCardTags(filters)}
        highlightedId={hovered}
        onHover={setHovered}
        empty={empty}
      />
    );

  const body = (
    // minmax(0,1fr): the count line's nowrap title must not widen the column (it pushed the page
    // wider than the phone screen in Russian and Georgian, where "Recommended" is long).
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <div className="grid gap-0.5">
        {/* The promise, once on this screen (brief 4): every host here took the pledge. */}
        <p className="flex items-start gap-1.5 text-small text-muted-foreground">
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-primary-text" aria-hidden="true" />
          <span>{t("promise")}</span>
        </p>
        <div className="flex min-h-11 min-w-0 items-center gap-1">
          <div className="min-w-0 shrink">
            <Fragment key="header">{header}</Fragment>
          </div>
          <span aria-hidden="true" className="text-muted-foreground">
            ·
          </span>
          <SortButton />
          <ViewSwitcher className="ms-auto hidden lg:inline-flex" />
        </div>
      </div>
      <Fragment key="chips">{chips}</Fragment>
      <Fragment key="notice">{notice}</Fragment>
      <div className="relative" aria-busy={isPending}>
        <div
          className={cn(
            "transition-opacity duration-(--motion-base)",
            isPending && "opacity-0 delay-200 motion-reduce:opacity-60 motion-reduce:delay-0",
          )}
        >
          {list}
        </div>
        {isPending ? <PendingSkeleton variant={variant} /> : null}
      </div>
      <Fragment key="pagination">{pagination}</Fragment>
    </div>
  );

  return (
    <>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,42%)] xl:grid-cols-[minmax(0,1fr)_minmax(0,45%)]">
        <div className={cn("min-w-0 px-4 pt-2 pb-28 sm:px-6 lg:px-8 lg:pt-4 lg:pb-12", phoneMap && "hidden lg:block")}>{body}</div>
        {phoneMap ? (
          <MapPanel items={items} points={mapPoints} fitKey={fitKey} highlightedId={hovered} onHighlight={setHovered} />
        ) : wide ? (
          <DesktopMap items={items} fitKey={fitKey} highlightedId={hovered} onHighlight={setHovered} />
        ) : (
          // Before hydration `wide` is false: hold the map column's place on large screens (CSS
          // only), so the footer does not jump down when the map mounts.
          <div
            aria-hidden="true"
            className="sticky top-[calc(var(--header-height)+var(--search-top-height,3.75rem))] hidden h-[calc(100dvh-var(--header-height)-var(--search-top-height,3.75rem))] bg-muted skeleton-shimmer lg:block"
          />
        )}
      </div>
      {!phoneMap ? (
        <div
          data-floating-map-toggle
          className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-height)+1rem)] z-(--z-sticky) flex justify-center lg:hidden"
        >
          <MapPill className="pointer-events-auto" />
        </div>
      ) : null}
    </>
  );
}

function publicIdAt(event: PointerEvent<HTMLElement>): number | null {
  const item = (event.target as HTMLElement).closest<HTMLElement>("[data-public-id]");
  const id = item ? Number(item.dataset.publicId) : NaN;
  return Number.isFinite(id) ? id : null;
}

/** Rings the server-rendered card of the hovered map pin (no re-render of the cards). */
function HighlightStyle({ id }: { id: number | null }) {
  if (id === null) return null;
  return (
    <style>{`[data-result-cards] [data-public-id="${id}"] > *{box-shadow:0 0 0 2px var(--color-primary);border-radius:var(--radius-card)}`}</style>
  );
}

/** Shimmering cards over the old results while new ones load (they fade in after 200ms). */
function PendingSkeleton({ variant }: { variant: ListingCardVariant }) {
  const t = useTranslations("search.results");
  return (
    <div
      role="status"
      className="absolute inset-0 animate-fade-in overflow-hidden [animation-delay:200ms] motion-reduce:hidden"
    >
      <span className="sr-only">{t("loading")}</span>
      <div className={resultListClass(variant, false)}>
        {Array.from({ length: 4 }, (_, index) => (
          <ListingCardSkeleton key={index} variant={variant} />
        ))}
      </div>
    </div>
  );
}

function ResultList({
  items,
  variant,
  nights,
  preferTags,
  highlightedId,
  onHover,
  empty,
}: {
  items: ListingCardData[];
  variant: ListingCardVariant;
  nights: number | null;
  preferTags: CardTagKind[];
  highlightedId: number | null;
  onHover: (id: number | null) => void;
  empty: ReactNode;
}) {
  const t = useTranslations("search.results");
  if (items.length === 0) return <>{empty}</>;
  return (
    <ul aria-label={t("listLabel")} className={resultListClass(variant, false)}>
      {items.map((listing, index) => (
        <li key={listing.id} className="min-w-0">
          <ListingCard
            listing={listing}
            variant={variant}
            // Only the first photo is above the fold on phones; the rest load as they come into view.
            priority={index === 0}
            showCompare
            nights={nights}
            preferTags={preferTags}
            onHover={onHover}
            className={cn(highlightedId === listing.publicId && "ring-2 ring-primary")}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * Large screens outside the map view: the map next to the list. Its points are fetched here
 * (phones never load them, nor the map).
 */
function DesktopMap({
  items,
  fitKey,
  highlightedId,
  onHighlight,
}: {
  items: ListingCardData[];
  fitKey: string;
  highlightedId: number | null;
  onHighlight: (id: number | null) => void;
}) {
  const t = useTranslations("search.map");
  const { filters } = useSearch();
  const query = serializeSearchQuery({ ...filters, page: 1, sort: DEFAULT_SORT, view: DEFAULT_VIEW });
  const [points, setPoints] = useState<{ query: string; value: ListingMapPoint[] } | null>(null);

  useEffect(() => {
    if (points?.query === query) return;
    let cancelled = false;
    void getSearchMapPoints(query)
      .catch(() => null)
      .then((result) => {
        if (!cancelled) setPoints({ query, value: result?.ok ? result.data.points : [] });
      });
    return () => {
      cancelled = true;
    };
  }, [query, points?.query]);

  if (!points) {
    return (
      <div className="sticky top-[calc(var(--header-height)+var(--search-top-height,3.75rem))] h-[calc(100dvh-var(--header-height)-var(--search-top-height,3.75rem))]">
        <div role="status" className="flex size-full items-center justify-center bg-muted text-muted-foreground skeleton-shimmer">
          <MapIcon className="size-8" aria-hidden="true" />
          <span className="sr-only">{t("loading")}</span>
        </div>
      </div>
    );
  }
  return <MapPanel items={items} points={points.value} fitKey={fitKey} highlightedId={highlightedId} onHighlight={onHighlight} />;
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
  const { filters, navigate, isPending } = useSearch();
  const [moveSearch, setMoveSearch] = useState(filters.bounds !== null);
  const latest = useRef(filters);
  const timer = useRef<number | undefined>(undefined);
  const panel = useRef<HTMLDivElement>(null);

  // Phones: the map fills the screen between the sticky bars and the bottom bar.
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

  const toggleMoveSearch = useCallback(
    (on: boolean) => {
      setMoveSearch(on);
      if (!on) {
        window.clearTimeout(timer.current);
        if (latest.current.bounds) navigate(withFilters(latest.current, { bounds: null }), { replace: true });
      }
    },
    [navigate],
  );

  // A tapped pill opens its card over the map; next to the list (desktop) its result card lights up.
  const onSelect = useCallback(
    (publicId: number) => {
      onHighlight(publicId);
      if (!window.matchMedia("(min-width: 1024px)").matches) return;
      document
        .getElementById(`listing-${publicId}-title`)
        ?.closest("article")
        ?.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
    },
    [onHighlight],
  );

  const showList = useCallback(
    () => navigate(withFilters(latest.current, { view: DEFAULT_VIEW, page: latest.current.page })),
    [navigate],
  );

  return (
    <div
      ref={panel}
      className={cn(
        "relative isolate h-[calc(100dvh-var(--header-height)-var(--bottom-nav-height)-var(--search-top-height,6.75rem))] scroll-mt-[calc(var(--header-height)+var(--search-top-height,6.75rem))]",
        "lg:sticky lg:top-[calc(var(--header-height)+var(--search-top-height,3.75rem))] lg:h-[calc(100dvh-var(--header-height)-var(--search-top-height,3.75rem))]",
      )}
    >
      {/* The map draws its own controls: count, "search as I move", re-center, Jewish community, "List". */}
      <ListingsMapLoader
        points={points}
        highlightedId={highlightedId}
        onHighlight={onHighlight}
        onSelect={onSelect}
        fitKey={fitKey}
        initialBounds={filters.bounds}
        onBoundsChange={onBoundsChange}
        focusPlace={{ citySlug: filters.city, neighborhoodSlug: filters.neighborhood }}
        listings={items}
        card={{ nights: stayNights(filters.checkIn, filters.checkOut), preferTags: preferredCardTags(filters) }}
        controls={{
          searchAsMove: { checked: moveSearch, onChange: toggleMoveSearch },
          loading: isPending,
          onShowList: showList,
        }}
      />
    </div>
  );
}
