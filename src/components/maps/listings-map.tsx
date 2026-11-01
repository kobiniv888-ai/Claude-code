"use client";

import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import L from "leaflet";
import Image from "next/image";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { MapContainer, Marker, Popup, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { Price } from "@/components/listing/price";
import { useCurrency } from "@/components/providers/currency-provider";
import { siteConfig } from "@/config/site";
import { Link } from "@/i18n/navigation";
import type { Bounds } from "@/lib/geo";
import { georgiaBounds, paddedGeorgiaBounds } from "@/lib/map-bounds";
import { findGazetteerPlace } from "@/lib/places-match";
import type { ListingMapPoint } from "@/lib/listing/types";
import { cn } from "@/lib/utils";
import { BaseTiles } from "./base-tiles";

/**
 * The search results map (client-only — load it through ListingsMapLoader / next/dynamic with
 * ssr: false). Price pills in the visitor's display currency, clustering, a mini card in each
 * popup, and two-way highlighting with the result cards. Only approximate points are ever shown
 * (ListingMapPoint holds approxLat/approxLng). The map itself always stays left-to-right.
 */

export type ListingsMapProps = {
  points: ListingMapPoint[];
  /** The listing to highlight (hovered card or marker). */
  highlightedId: number | null;
  onHighlight?: (publicId: number | null) => void;
  /** A marker was clicked (the popup opens as well). */
  onSelect?: (publicId: number) => void;
  /** Changes when the search changes (not the map area): the map fits the results again. */
  fitKey: string;
  /** The map area from the URL ("Search as I move the map"), shown instead of fitting the points. */
  initialBounds: Bounds | null;
  /** The visitor moved or zoomed the map (programmaticRef moves are not reported). */
  onBoundsChange?: (bounds: Bounds) => void;
  /**
   * The city / neighborhood in the search filters: with no results the map shows that place
   * (otherwise all of Georgia — never the whole world).
   */
  focusPlace?: { citySlug: string | null; neighborhoodSlug?: string | null } | null;
  className?: string;
};

const iconCache = new Map<string, L.DivIcon>();

function pillIcon(label: string, highlighted: boolean): L.DivIcon {
  const key = `${label}|${highlighted}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const escaped = label.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  // A real size (not 0×0) keeps the marker clickable and its keyboard focus ring visible.
  const width = Math.round(label.length * 7.6 + 24);
  const height = 28;
  const icon = L.divIcon({
    className:
      "bayit-price-marker rounded-full outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring",
    html: `<span class="${
      highlighted
        ? "scale-110 bg-primary text-primary-foreground ring-2 ring-background"
        : "bg-card text-foreground ring-1 ring-foreground/15"
    } flex h-full w-full items-center justify-center whitespace-nowrap rounded-full px-2 text-[13px] font-bold shadow-md transition-transform" dir="ltr">${escaped}</span>`,
    iconSize: [width, height],
    iconAnchor: [width / 2, height / 2],
    popupAnchor: [0, -height / 2],
  });
  iconCache.set(key, icon);
  return icon;
}

/** The part of leaflet.markercluster's MarkerCluster we use (its type package is not installed). */
type ClusterLike = { getChildCount(): number };

function clusterIcon(cluster: ClusterLike): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count < 10 ? 36 : count < 100 ? 42 : 48;
  return L.divIcon({
    className: "bayit-cluster-marker",
    html: `<span class="flex items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-md ring-4 ring-primary/25" style="width:${size}px;height:${size}px" dir="ltr">${count}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function toBounds(map: L.Map): Bounds {
  const b = map.getBounds();
  return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() };
}

/** Fits the map to the results when the search changes (not when the visitor moves the map). */
function FitToResults({
  points,
  fitKey,
  initialBounds,
  focusPlace,
  programmaticRef,
}: {
  points: ListingMapPoint[];
  fitKey: string;
  initialBounds: Bounds | null;
  focusPlace: ListingsMapProps["focusPlace"];
  programmaticRef: RefObject<boolean>;
}) {
  const map = useMap();
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (fitted.current === fitKey) return;
    const first = fitted.current === null;
    fitted.current = fitKey;
    // Animated fits end with a moveend that MoveEvents ignores; instant ones finish right here.
    const animate = !first;
    programmaticRef.current = animate;
    if (first && initialBounds) {
      map.fitBounds(
        [
          [initialBounds.south, initialBounds.west],
          [initialBounds.north, initialBounds.east],
        ],
        { animate: false },
      );
    } else if (points.length > 0) {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15, animate });
    } else {
      // No results: the searched city / neighborhood, else all of Georgia.
      const place = findGazetteerPlace(focusPlace?.citySlug, focusPlace?.neighborhoodSlug);
      if (place) {
        map.setView([place.lat, place.lng], place.type === "neighborhood" ? 14 : siteConfig.map.defaultZoom, { animate });
      } else {
        map.fitBounds(georgiaBounds(), { animate });
      }
    }
  }, [map, points, fitKey, initialBounds, focusPlace, programmaticRef]);
  return null;
}

function MoveEvents({
  onBoundsChange,
  programmaticRef,
}: {
  onBoundsChange?: (bounds: Bounds) => void;
  programmaticRef: RefObject<boolean>;
}) {
  useMapEvents({
    moveend(event) {
      if (programmaticRef.current) {
        programmaticRef.current = false;
        return;
      }
      onBoundsChange?.(toBounds(event.target as L.Map));
    },
  });
  return null;
}

/** Keeps the map size right when its container changes size (split view, drawers). */
function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    const element = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    observer.observe(element);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function PopupCard({ point }: { point: ListingMapPoint }) {
  const t = useTranslations("search.map");
  return (
    <div className="w-56 overflow-hidden" dir="auto">
      {point.photo ? (
        <div className="relative aspect-[3/2] w-full bg-muted">
          <Image src={point.photo} alt="" fill sizes="224px" className="object-cover" />
        </div>
      ) : null}
      <div className="grid gap-1 p-3">
        <Link href={point.href} className="line-clamp-2 text-sm leading-snug font-semibold text-foreground! hover:underline">
          <span dir="auto">{point.title}</span>
        </Link>
        <Price amount={point.price} currency={point.currency} period={point.pricePeriod} from={point.priceIsFrom} size="sm" showOriginal={false} />
        <Link href={point.href} className="text-xs font-semibold text-primary! hover:underline">
          {t("openListing")}
        </Link>
      </div>
    </div>
  );
}

export default function ListingsMap({
  points,
  highlightedId,
  onHighlight,
  onSelect,
  fitKey,
  initialBounds,
  onBoundsChange,
  focusPlace = null,
  className,
}: ListingsMapProps) {
  const t = useTranslations("search.map");
  const { format } = useCurrency();
  const programmaticRef = useRef(false);

  const labels = useMemo(
    () =>
      new Map(
        points.map((p) => [
          p.publicId,
          p.price !== null && p.price > 0
            ? format(p.price, p.currency, { compact: p.price >= 100_000, maximumFractionDigits: p.price >= 100_000 ? 1 : 0 })
            : t("noPrice"),
        ]),
      ),
    [points, format, t],
  );

  return (
    <div
      dir="ltr"
      className={cn("relative isolate z-0 h-full w-full max-lg:[&_.leaflet-control-zoom]:hidden", className)}
    >
      <MapContainer
        bounds={georgiaBounds()}
        minZoom={siteConfig.map.minZoom}
        maxZoom={siteConfig.map.maxZoom}
        maxBounds={paddedGeorgiaBounds()}
        maxBoundsViscosity={0.9}
        scrollWheelZoom
        className="h-full w-full bg-muted"
        attributionControl
        zoomControl={false}
      >
        {/* Bottom corner: the top of the map holds the search controls; phones pinch to zoom. */}
        <ZoomControl position="bottomright" />
        {/* Below the filter / count / "search as I move" controls at the top of the map. */}
        <BaseTiles noticeClassName="top-28 lg:top-16" />
        <MoveEvents onBoundsChange={onBoundsChange} programmaticRef={programmaticRef} />
        <FitToResults
          points={points}
          fitKey={fitKey}
          initialBounds={initialBounds}
          focusPlace={focusPlace}
          programmaticRef={programmaticRef}
        />
        <InvalidateOnResize />
        <MarkerClusterGroup
          chunkedLoading
          showCoverageOnHover={false}
          spiderfyOnMaxZoom
          maxClusterRadius={48}
          iconCreateFunction={clusterIcon}
        >
          {points.map((point) => {
            const highlighted = point.publicId === highlightedId;
            return (
              <Marker
                key={point.publicId}
                position={[point.lat, point.lng]}
                icon={pillIcon(labels.get(point.publicId) ?? "", highlighted)}
                zIndexOffset={highlighted ? 1000 : 0}
                title={point.title}
                alt={point.title}
                keyboard
                eventHandlers={{
                  mouseover: () => onHighlight?.(point.publicId),
                  mouseout: () => onHighlight?.(null),
                  click: () => onSelect?.(point.publicId),
                }}
              >
                <Popup
                  closeButton
                  minWidth={224}
                  maxWidth={224}
                  className="[&_.leaflet-popup-content]:m-0! [&_.leaflet-popup-content]:w-56! [&_.leaflet-popup-content-wrapper]:overflow-hidden [&_.leaflet-popup-content-wrapper]:rounded-xl! [&_.leaflet-popup-content-wrapper]:p-0!"
                >
                  <PopupCard point={point} />
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}
