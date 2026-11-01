"use client";

import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "./listings-map.css";
import L from "leaflet";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ImageOffIcon, XIcon } from "lucide-react";
import { MapContainer, Marker, Popup, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { ListingCard } from "@/components/listing/listing-card";
import { ListingCardSkeleton } from "@/components/listing/listing-card-skeleton";
import { Price } from "@/components/listing/price";
import { useCurrency } from "@/components/providers/currency-provider";
import { siteConfig } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { dirFor } from "@/i18n/locale";
import { formatNumber } from "@/lib/format";
import type { Bounds } from "@/lib/geo";
import { getListingCardsAction } from "@/lib/listing/card-actions";
import type { ListingCardData, ListingMapPoint } from "@/lib/listing/types";
import { georgiaBounds, paddedGeorgiaBounds } from "@/lib/map-bounds";
import type { CommunityPlace } from "@/lib/map/community";
import { pricePillLabel } from "@/lib/map/price-label";
import { countInBounds, searchAreaTarget, type FocusPlace, type MapTarget } from "@/lib/map/view";
import { prefersReducedMotion } from "@/lib/motion";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { BaseTiles } from "./base-tiles";
import { CommunityIconSprite, CommunityMarkers } from "./community-layer";
import { MapCardSheet } from "./map-card-sheet";
import { ListPill, MapControls } from "./map-controls";
import { clusterIcon, pricePillIcon, type ClusterLike } from "./map-icons";

/**
 * The search results map (client-only — load it through ListingsMapLoader / next/dynamic with
 * ssr: false). Only approximate points are ever shown (ListingMapPoint holds approxLat/approxLng).
 * The map itself always stays left-to-right; the controls over it follow the page direction.
 *
 * - Navy price pills in the display currency ("₪450", "₪1.2M"); they scale in as they appear.
 *   Dense areas become count bubbles. Hovering a result card lifts its pill.
 * - Tapping a pill turns it coral and slides the listing card up from the bottom (desktop: the card
 *   opens in a popup over the pill). Tap the map, swipe the card down, × or Escape to close.
 * - "Jewish community" layer (off by default): synagogues, Chabad houses and kosher places, each
 *   with its own icon and a small popup with a walking link.
 * - Controls: "Re-center" (back to the search area, or Georgia) always; with `controls`, also the
 *   "Loading…" / "24 homes in this area" chip, "Search as I move the map" and the phones' "List" pill.
 * - Opens on the results, the searched city, or Georgia — never the whole world.
 */

export type ListingsMapControls = {
  /** "Search as I move the map": the toggle (the page keeps the state and does the searching). */
  searchAsMove?: { checked: boolean; onChange: (on: boolean) => void };
  /** New results are loading: the status chip says "Loading…" instead of the count. */
  loading?: boolean;
  /** Phones: the "List" pill at the bottom, back to the results list. */
  onShowList?: () => void;
};

export type ListingsMapProps = {
  points: ListingMapPoint[];
  /** The listing to highlight (hovered card or marker). */
  highlightedId: number | null;
  onHighlight?: (publicId: number | null) => void;
  /** A marker was tapped (its card slides up over the map as well). */
  onSelect?: (publicId: number) => void;
  /** Changes when the search changes (not the map area): the map fits the results again. */
  fitKey: string;
  /** The map area from the URL ("Search as I move the map"), shown instead of fitting the points. */
  initialBounds: Bounds | null;
  /** The visitor moved or zoomed the map (fits, re-centering to show a card, popups: not reported). */
  onBoundsChange?: (bounds: Bounds) => void;
  /**
   * The city / neighborhood in the search filters: with no results the map shows that place
   * (otherwise all of Georgia — never the whole world).
   */
  focusPlace?: FocusPlace;
  /** Cards already on the page (the current results): a tapped pill shows its card without a request. */
  listings?: ListingCardData[];
  /**
   * The status chip, "Search as I move the map" and "List" over the map. Without it the page shows
   * its own; "Re-center" and the community layer are always there.
   */
  controls?: ListingsMapControls;
  className?: string;
};

/** Room the slide-up card takes at the bottom of the map (phones); a tapped pill below this line is shown above it. */
const CARD_AREA_PX = 264;
/** Desktop: the card opens in a popup over the pill, kept clear of the controls at the top. */
const POPUP_WIDTH_PX = 352;
const WIDE_QUERY = "(min-width: 1024px)";

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** The split view (list + map) breakpoint: popups instead of the bottom card. */
function useWideScreen(): boolean {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => false);
}
/** Room the controls take at the top and the "List" pill at the bottom when fitting the results. */
const FIT_PADDING_TOP_LEFT: L.PointTuple = [32, 120];
const FIT_PADDING_BOTTOM_RIGHT: L.PointTuple = [32, 72];

function toBounds(map: L.Map): Bounds {
  const b = map.getBounds();
  return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() };
}

/**
 * Moves made by the code (fitting results, popups panning into view, resizes) must not count as
 * the visitor moving the map ("Search as I move the map" would search again). `begin()` before such
 * a move; the next `moveend` is then swallowed. If none comes, the flag clears itself.
 */
type QuietMoves = { begin: () => void; consume: () => boolean };

function useQuietMoves(): QuietMoves {
  const quiet = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return useMemo(
    () => ({
      begin() {
        quiet.current = true;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          quiet.current = false;
        }, 1500);
      },
      consume() {
        if (!quiet.current) return false;
        quiet.current = false;
        window.clearTimeout(timer.current);
        return true;
      },
    }),
    [],
  );
}

function moveTo(map: L.Map, target: MapTarget, animate: boolean) {
  if (target.kind === "center") {
    map.setView(target.center, target.zoom, { animate });
  } else if (target.maxZoom) {
    map.fitBounds(target.bounds, {
      maxZoom: target.maxZoom,
      paddingTopLeft: FIT_PADDING_TOP_LEFT,
      paddingBottomRight: FIT_PADDING_BOTTOM_RIGHT,
      animate,
    });
  } else {
    map.fitBounds(target.bounds, { animate });
  }
}

/** Fits the map to the results when the search changes (not when the visitor moves the map). */
function FitToResults({
  points,
  fitKey,
  initialBounds,
  focusPlace,
  quiet,
}: {
  points: ListingMapPoint[];
  fitKey: string;
  initialBounds: Bounds | null;
  focusPlace: FocusPlace;
  quiet: QuietMoves;
}) {
  const map = useMap();
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (fitted.current === fitKey) return;
    const first = fitted.current === null;
    fitted.current = fitKey;
    quiet.begin();
    if (first && initialBounds) {
      map.fitBounds(
        [
          [initialBounds.south, initialBounds.west],
          [initialBounds.north, initialBounds.east],
        ],
        { animate: false },
      );
    } else {
      moveTo(map, searchAreaTarget({ points, focusPlace }), !first && !prefersReducedMotion());
    }
  }, [map, points, fitKey, initialBounds, focusPlace, quiet]);
  return null;
}

function MapEvents({
  quiet,
  onUserMove,
  onMapClick,
}: {
  quiet: QuietMoves;
  onUserMove?: (bounds: Bounds) => void;
  onMapClick: () => void;
}) {
  useMapEvents({
    moveend(event) {
      if (quiet.consume()) return;
      onUserMove?.(toBounds(event.target as L.Map));
    },
    // A popup panning itself into view is not the visitor moving the map.
    autopanstart() {
      quiet.begin();
    },
    click() {
      onMapClick();
    },
  });
  return null;
}

/** Keeps the map size right when its container changes size (split view, drawers). */
function InvalidateOnResize({ quiet }: { quiet: QuietMoves }) {
  const map = useMap();
  useEffect(() => {
    const element = map.getContainer();
    const observer = new ResizeObserver(() => {
      const size = map.getSize();
      if (element.clientWidth === size.x && element.clientHeight === size.y) return;
      quiet.begin();
      map.invalidateSize({ animate: false });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [map, quiet]);
  return null;
}

/**
 * "24 homes in this area": the points inside the visible map. Re-renders only when the number
 * changes, not on every move.
 */
function useInViewCount(map: L.Map | null, points: readonly ListingMapPoint[]): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      map?.on("moveend", onChange);
      return () => {
        map?.off("moveend", onChange);
      };
    },
    [map],
  );
  return useSyncExternalStore(
    subscribe,
    () => countInBounds(points, map ? toBounds(map) : null),
    () => points.length,
  );
}

type SheetState = { id: number; closing: boolean } | null;
type CommunityState = { on: boolean; status: "idle" | "loading" | "ready" | "error"; places: CommunityPlace[] };

export default function ListingsMap({
  points,
  highlightedId,
  onHighlight,
  onSelect,
  fitKey,
  initialBounds,
  onBoundsChange,
  focusPlace = null,
  listings,
  controls,
  className,
}: ListingsMapProps) {
  const t = useTranslations("map");
  const locale = useLocale();
  const { convert, format } = useCurrency();
  const quiet = useQuietMoves();
  const [map, setMap] = useState<L.Map | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [fetchedCards, setFetchedCards] = useState<ReadonlyMap<number, ListingCardData | null>>(() => new Map());
  const [community, setCommunity] = useState<CommunityState>({ on: false, status: "idle", places: [] });
  const [reducedMotion] = useState(prefersReducedMotion);
  const wide = useWideScreen();
  const markers = useRef(new Map<number, L.Marker>());
  const markerIds = useRef(new WeakMap<L.Layer, number>());
  /** The listing whose card is open right now (read by event handlers before React re-renders). */
  const openId = useRef<number | null>(null);
  const clusterGroup = useRef<L.FeatureGroup | null>(null);
  const markerState = useRef<{ hover: number | null; selected: number | null }>({ hover: null, selected: null });

  // The map is a labelled region for screen readers (Leaflet leaves the container unnamed).
  useEffect(() => {
    const container = map?.getContainer();
    if (!container) return;
    container.setAttribute("role", "region");
    container.setAttribute("aria-label", t("label"));
  }, [map, t]);

  const noPrice = t("pill.noPrice");
  const labels = useMemo(
    () => new Map(points.map((p) => [p.publicId, pricePillLabel(p.price, p.currency, { convert, format }, noPrice)])),
    [points, convert, format, noPrice],
  );
  // Stable positions: a new [lat, lng] array would make every re-render move each marker, and the
  // cluster plugin re-adds a moved marker (a new element that replays its scale-in).
  const positions = useMemo(() => new Map(points.map((p) => [p.publicId, [p.lat, p.lng] as L.LatLngTuple])), [points]);

  // ── Marker state: classes on the marker elements (no icon rebuild, no replayed scale-in) ──
  const paint = useCallback((publicId: number, marker: L.Marker) => {
    const element = marker.getElement();
    if (!element) return;
    element.classList.toggle("is-hover", markerState.current.hover === publicId);
    element.classList.toggle("is-selected", markerState.current.selected === publicId);
  }, []);

  useEffect(() => {
    markerState.current = { hover: highlightedId, selected: selectedId };
    markers.current.forEach((marker, publicId) => paint(publicId, marker));
  }, [highlightedId, selectedId, labels, paint]);

  const registerMarker = useCallback(
    (publicId: number) => (marker: L.Marker | null) => {
      if (marker) {
        markers.current.set(publicId, marker);
        markerIds.current.set(marker, publicId);
      } else {
        markers.current.delete(publicId);
      }
    },
    [],
  );

  // A pill gets a new element each time the cluster plugin shows it again (zooming, un-clustering):
  // put its state classes back on it. (The group's ref is called on every commit, null first:
  // bind once per group instance, never through state.)
  const onLayerAdd = useCallback(
    (event: L.LayerEvent) => {
      const publicId = markerIds.current.get(event.layer);
      if (publicId !== undefined) paint(publicId, event.layer as L.Marker);
    },
    [paint],
  );
  const clusterRef = useCallback(
    (group: L.FeatureGroup | null) => {
      if (!group || group === clusterGroup.current) return;
      clusterGroup.current?.off("layeradd", onLayerAdd);
      group.on("layeradd", onLayerAdd);
      clusterGroup.current = group;
    },
    [onLayerAdd],
  );

  const clusterIconFor = useCallback(
    (cluster: ClusterLike) => {
      const count = cluster.getChildCount();
      return clusterIcon(count, t("cluster", { count, formatted: formatNumber(count, locale) }));
    },
    [t, locale],
  );

  // ── The slide-up card ──
  const select = useCallback(
    (publicId: number) => {
      openId.current = publicId;
      setSelectedId(publicId);
      setSheet({ id: publicId, closing: false });
      onSelect?.(publicId);
      // Phones: keep the tapped pill visible above the card (desktop popups pan themselves).
      const marker = markers.current.get(publicId);
      if (map && marker && !window.matchMedia(WIDE_QUERY).matches) {
        const point = map.latLngToContainerPoint(marker.getLatLng());
        const limit = map.getSize().y - CARD_AREA_PX;
        if (point.y > limit) {
          quiet.begin();
          map.panBy([0, point.y - limit + 24], { animate: !reducedMotion });
        }
      }
    },
    [map, onSelect, quiet, reducedMotion],
  );

  const closeSheet = useCallback(() => {
    // Give focus back to the pill the card came from.
    const focusInside = document.querySelector(".bayit-map-card")?.contains(document.activeElement) ?? false;
    const current = markerState.current.selected;
    if (focusInside && current !== null) markers.current.get(current)?.getElement()?.focus({ preventScroll: true });
    openId.current = null;
    setSelectedId(null);
    // Phones: slide down first (onSheetClosed unmounts); desktop popups just close.
    const wideNow = window.matchMedia(WIDE_QUERY).matches;
    setSheet((current) => (wideNow ? null : current && !current.closing ? { ...current, closing: true } : current));
  }, []);

  /** Desktop: keyboard users land in the card that just opened. */
  const focusOnMount = useCallback((element: HTMLElement | null) => element?.focus({ preventScroll: true }), []);

  const onSheetClosed = useCallback(() => setSheet((current) => (current?.closing ? null : current)), []);

  useEffect(() => {
    if (!sheet || sheet.closing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) closeSheet();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sheet, closeSheet]);

  // Card data: from the page when it has it, otherwise fetched once (public data, rate-limited).
  const sheetId = sheet?.id ?? null;
  const pageCard = sheetId === null ? undefined : listings?.find((listing) => listing.publicId === sheetId);
  useEffect(() => {
    if (sheetId === null || pageCard || fetchedCards.has(sheetId)) return;
    let cancelled = false;
    void getListingCardsAction([sheetId])
      .catch(() => null)
      .then((result) => {
        if (cancelled) return;
        const card = result?.ok ? (result.data[0] ?? null) : null;
        setFetchedCards((previous) => new Map(previous).set(sheetId, card));
      });
    return () => {
      cancelled = true;
    };
  }, [sheetId, pageCard, fetchedCards]);

  // ── Re-center: back to the search area (the searched place or Georgia when the results are
  // limited to the map area). With "Search as I move the map" on, that area is searched. ──
  const recenter = useCallback(() => {
    if (!map) return;
    moveTo(map, searchAreaTarget({ points, focusPlace, ignorePoints: initialBounds !== null }), !reducedMotion);
  }, [map, points, focusPlace, initialBounds, reducedMotion]);

  // ── Jewish community layer ──
  const toggleCommunity = useCallback(() => {
    if (community.on) {
      setCommunity((current) => ({ ...current, on: false }));
      return;
    }
    if (community.status === "ready" || community.status === "loading") {
      setCommunity((current) => ({ ...current, on: true }));
      return;
    }
    setCommunity((current) => ({ ...current, on: true, status: "loading" }));
    fetch(`/api/map/community?locale=${encodeURIComponent(locale)}`)
      .then((response) => (response.ok ? (response.json() as Promise<{ places: CommunityPlace[] }>) : Promise.reject(new Error(String(response.status)))))
      .then(({ places }) => {
        setCommunity((current) => ({ ...current, status: "ready", places }));
        if (places.length === 0) toast.info(t("controls.communityEmpty"));
      })
      .catch(() => {
        setCommunity({ on: false, status: "error", places: [] });
        toast.error(t("controls.communityError"));
      });
  }, [community.on, community.status, locale, t]);

  const inView = useInViewCount(map, points);
  const status = controls ? { loading: controls.loading === true, count: inView } : null;
  const sheetPoint = sheetId === null ? undefined : points.find((p) => p.publicId === sheetId);
  const sheetCard = pageCard ?? (sheetId === null ? undefined : fetchedCards.get(sheetId));
  const cardContent = sheetCard ? (
    <ListingCard listing={sheetCard} variant="compact" priority />
  ) : sheetCard === null && sheetPoint ? (
    <PointCard point={sheetPoint} />
  ) : (
    <div role="status">
      <span className="sr-only">{t("card.loading")}</span>
      <ListingCardSkeleton variant="compact" />
    </div>
  );

  return (
    <div
      dir="ltr"
      className={cn(
        "bayit-map relative isolate z-0 h-full w-full overflow-hidden max-lg:[&_.leaflet-control-zoom]:hidden",
        className,
      )}
    >
      <MapContainer
        ref={setMap}
        bounds={georgiaBounds()}
        minZoom={siteConfig.map.minZoom}
        maxZoom={siteConfig.map.maxZoom}
        maxBounds={paddedGeorgiaBounds()}
        maxBoundsViscosity={0.9}
        scrollWheelZoom
        zoomAnimation={!reducedMotion}
        markerZoomAnimation={!reducedMotion}
        className="h-full w-full bg-muted"
        attributionControl
        zoomControl={false}
      >
        {/* Bottom corner: the top of the map holds the controls; phones pinch to zoom. */}
        <ZoomControl position="bottomright" />
        <BaseTiles noticeClassName="top-auto bottom-28 lg:bottom-10" />
        <MapEvents quiet={quiet} onUserMove={onBoundsChange} onMapClick={closeSheet} />
        <FitToResults points={points} fitKey={fitKey} initialBounds={initialBounds} focusPlace={focusPlace} quiet={quiet} />
        <InvalidateOnResize quiet={quiet} />
        <MarkerClusterGroup
          chunkedLoading
          showCoverageOnHover={false}
          spiderfyOnMaxZoom
          maxClusterRadius={52}
          animate={!reducedMotion}
          iconCreateFunction={clusterIconFor}
          ref={clusterRef}
        >
          {points.map((point) => {
            const selected = point.publicId === selectedId;
            const highlighted = point.publicId === highlightedId;
            return (
              <Marker
                key={point.publicId}
                ref={registerMarker(point.publicId)}
                position={positions.get(point.publicId) ?? [point.lat, point.lng]}
                icon={pricePillIcon(labels.get(point.publicId) ?? noPrice)}
                // Pills above community places (+500) above count bubbles (0); hovered and tapped on top.
                zIndexOffset={selected ? 3000 : highlighted ? 2000 : 1000}
                title={point.title}
                keyboard
                eventHandlers={{
                  mouseover: () => onHighlight?.(point.publicId),
                  mouseout: () => onHighlight?.(null),
                  click: () => select(point.publicId),
                  keypress: (event) => {
                    const { originalEvent } = event as L.LeafletKeyboardEvent;
                    if (originalEvent.key !== "Enter" && originalEvent.key !== " ") return;
                    originalEvent.preventDefault();
                    select(point.publicId);
                  },
                }}
              />
            );
          })}
        </MarkerClusterGroup>
        {community.on && community.status === "ready" ? <CommunityMarkers places={community.places} /> : null}
        {wide && sheet && !sheet.closing && sheetPoint ? (
          <Popup
            key={sheet.id}
            position={positions.get(sheetPoint.publicId) ?? [sheetPoint.lat, sheetPoint.lng]}
            offset={[0, -12]}
            closeButton={false}
            minWidth={POPUP_WIDTH_PX}
            maxWidth={POPUP_WIDTH_PX}
            autoPanPaddingTopLeft={[24, 150]}
            autoPanPaddingBottomRight={[24, 24]}
            className="bayit-popup bayit-card-popup"
            eventHandlers={{
              // Leaflet closed it (Escape): close the card. Our own unmount is ignored.
              remove: () => {
                if (openId.current === sheet.id) closeSheet();
              },
            }}
          >
            <section
              ref={focusOnMount}
              tabIndex={-1}
              dir={dirFor(locale)}
              aria-label={t("card.label")}
              className="bayit-map-card-popup relative outline-none"
              style={{ width: POPUP_WIDTH_PX }}
            >
              <button
                type="button"
                onClick={closeSheet}
                aria-label={t("card.close")}
                className="absolute -end-2.5 -top-2.5 z-30 inline-flex size-8 items-center justify-center rounded-full bg-card text-foreground shadow-raised ring-1 ring-foreground/10 outline-none before:absolute before:-inset-1.5 before:content-[''] hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <XIcon className="size-4" aria-hidden="true" />
              </button>
              {cardContent}
            </section>
          </Popup>
        ) : null}
      </MapContainer>

      {/* Over the map, in the page's reading direction. */}
      <div dir={dirFor(locale)} className="pointer-events-none absolute inset-0 z-[1000]">
        <CommunityIconSprite />
        <MapControls
          status={status}
          searchAsMove={controls?.searchAsMove}
          community={{ on: community.on, loading: community.status === "loading", onToggle: toggleCommunity }}
          onRecenter={recenter}
        />
        {controls?.onShowList && !sheet ? (
          // Above the bottom bar's "+" button, which rises ~28px into the map.
          <div className="absolute inset-x-0 bottom-11 flex justify-center lg:hidden">
            <ListPill onClick={controls.onShowList} />
          </div>
        ) : null}
        {sheet && !wide ? (
          <div className="absolute inset-x-2 bottom-9">
            <MapCardSheet key={sheet.id} closing={sheet.closing} onClose={closeSheet} onClosed={onSheetClosed}>
              {cardContent}
            </MapCardSheet>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** When the full card cannot be loaded: what the map point knows (photo, title, price). */
function PointCard({ point }: { point: ListingMapPoint }) {
  const t = useTranslations("map.card");
  return (
    <article className="relative flex min-h-36 overflow-hidden rounded-card bg-card">
      <div className="relative w-[38%] max-w-44 shrink-0 bg-muted">
        {point.photo ? (
          <Image src={point.photo} alt="" fill sizes="176px" className="object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-muted-foreground">
            <ImageOffIcon className="size-6" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5">
        <Price amount={point.price} currency={point.currency} period={point.pricePeriod} from={point.priceIsFrom} size="card" showOriginal={false} />
        <h3 className="truncate text-sm leading-snug font-semibold">
          <Link href={point.href} dir="auto" className="after:absolute after:inset-0 after:content-[''] focus-visible:underline">
            {point.title}
          </Link>
        </h3>
        <span className="mt-auto text-sm font-semibold text-primary">{t("open")}</span>
      </div>
    </article>
  );
}
