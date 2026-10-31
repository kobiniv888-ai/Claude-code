"use client";

import { List, Map as MapIcon, MapPinned, SearchX } from "lucide-react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { dirFor } from "@/i18n/locale";
import { formatNumber } from "@/lib/format";
import {
  JEWISH_PLACE_TYPES,
  serializePlaceTypes,
  type JewishPlaceType,
  type PublicJewishPlace,
} from "@/lib/jewish-life/places";
import { cn } from "@/lib/utils";
import { PlaceCard } from "./place-card";
import { PLACE_TYPE_STYLE } from "./place-type-style";
import type { MapFocusRequest } from "./places-map";
import { scrollBehavior } from "@/lib/motion";

function MapSkeleton() {
  return <Skeleton className="size-full rounded-2xl" />;
}

const PlacesMap = dynamic(() => import("./places-map"), { ssr: false, loading: MapSkeleton });

const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

export type ExplorerCity = { slug: string; name: string; count: number };

const ALL = "all";

/**
 * Map + list of Jewish places with type chips and a city selector.
 * Filters live in the URL (`?type=synagogue,mikveh&placeCity=batumi`) without reloading the page.
 */
export function PlacesExplorer({
  places,
  cities,
  initialTypes,
  initialCity,
  map,
}: {
  places: PublicJewishPlace[];
  cities: ExplorerCity[];
  initialTypes: JewishPlaceType[];
  initialCity: string | null;
  map: { tileUrl: string; tileAttribution: string; center: { lat: number; lng: number }; zoom: number };
}) {
  const t = useTranslations("jewishLife.places");
  const locale = useLocale();
  const isDesktop = useIsDesktop();

  const [types, setTypes] = useState<JewishPlaceType[]>(initialTypes);
  const [city, setCity] = useState<string | null>(
    initialCity && cities.some((c) => c.slug === initialCity) ? initialCity : null,
  );
  const [view, setView] = useState<"list" | "map">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<MapFocusRequest>(null);
  const cardRefs = useRef(new Map<string, HTMLLIElement>());

  // Keep the filters in the URL (shareable links) without a server round trip. Runs again after
  // other navigations on the page (calendar month or city), which bring their own query string.
  const searchParams = useSearchParams();
  useEffect(() => {
    const url = new URL(window.location.href);
    const typeParam = serializePlaceTypes(types);
    if (typeParam) url.searchParams.set("type", typeParam);
    else url.searchParams.delete("type");
    if (city) url.searchParams.set("placeCity", city);
    else url.searchParams.delete("placeCity");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [searchParams, types, city]);

  const inCity = useMemo(() => (city ? places.filter((p) => p.citySlug === city) : places), [places, city]);

  const filtered = useMemo(() => {
    const list = types.length ? inCity.filter((p) => types.includes(p.type)) : inCity;
    return [...list].sort(
      (a, b) =>
        Number(a.isDemo) - Number(b.isDemo) ||
        JEWISH_PLACE_TYPES.indexOf(a.type) - JEWISH_PLACE_TYPES.indexOf(b.type) ||
        a.name.localeCompare(b.name, locale),
    );
  }, [inCity, types, locale]);

  const countsByType = useMemo(() => {
    const counts = new Map<JewishPlaceType, number>();
    for (const place of inCity) counts.set(place.type, (counts.get(place.type) ?? 0) + 1);
    return counts;
  }, [inCity]);

  const presentTypes = JEWISH_PLACE_TYPES.filter((type) => places.some((p) => p.type === type));
  const hasDemo = filtered.some((p) => p.isDemo);
  const filtersActive = types.length > 0 || city !== null;

  function toggleType(type: JewishPlaceType) {
    const next = types.includes(type) ? types.filter((t) => t !== type) : [...types, type];
    setTypes(next);
  }

  function clearTypes() {
    setTypes([]);
  }

  function changeCity(value: string) {
    const next = value === ALL ? null : value;
    setCity(next);
  }

  function clearFilters() {
    setTypes([]);
    setCity(null);
  }

  function showOnMap(id: string) {
    setSelectedId(id);
    setFocusRequest((prev) => ({ id, nonce: (prev?.nonce ?? 0) + 1 }));
    if (!isDesktop) setView("map");
  }

  function selectFromMap(id: string) {
    setSelectedId(id);
    if (isDesktop) {
      cardRefs.current.get(id)?.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
    }
  }

  function showInList(id: string) {
    setSelectedId(id);
    setView("list");
    requestAnimationFrame(() => {
      const card = cardRefs.current.get(id);
      card?.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
      card?.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
    });
  }

  const showMap = isDesktop || view === "map";

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="space-y-4">
        <div role="group" aria-label={t("typeFilterLabel")} className="-mx-4 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
          <div className="flex w-max gap-2 lg:w-auto lg:flex-wrap">
            <button
              type="button"
              aria-pressed={types.length === 0}
              onClick={clearTypes}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                types.length === 0
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-foreground hover:bg-muted",
              )}
            >
              {t("allTypes")}
              <span className={cn("text-xs", types.length === 0 ? "opacity-85" : "text-muted-foreground")}>
                {formatNumber(inCity.length, locale)}
              </span>
            </button>
            {presentTypes.map((type) => {
              const style = PLACE_TYPE_STYLE[type];
              const Icon = style.icon;
              const active = types.includes(type);
              const count = countsByType.get(type) ?? 0;
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleType(type)}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-full border ps-2 pe-4 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    active ? "border-primary bg-secondary text-secondary-foreground ring-1 ring-primary" : "bg-card hover:bg-muted",
                    !active && count === 0 && "opacity-60",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="flex size-7 items-center justify-center rounded-full text-white"
                    style={{ background: style.pin }}
                  >
                    <Icon className="size-4" />
                  </span>
                  {t(`typesPlural.${type}`)}
                  <span className="text-xs text-muted-foreground">{formatNumber(count, locale)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="order-2 flex flex-wrap items-center gap-2 lg:order-1">
            <p aria-live="polite" className="text-sm font-medium text-muted-foreground">
              {t("resultCount", { count: filtered.length })}
            </p>
            {hasDemo ? (
              <p className="rounded-full bg-warning-soft px-3 py-1 text-xs font-medium text-amber-900 dark:text-warning">
                {t("demoLegend")}
              </p>
            ) : null}
          </div>
          <div className="order-1 flex items-end gap-3 lg:order-2">
            {cities.length > 0 ? (
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:w-60 lg:flex-none">
                <label id="jl-city-label" className="text-sm font-medium">
                  {t("cityLabel")}
                </label>
                <Select value={city ?? ALL} onValueChange={changeCity} dir={dirFor(locale)}>
                  <SelectTrigger aria-labelledby="jl-city-label" className="h-10! w-full bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value={ALL}>{t("allCities")}</SelectItem>
                    {cities.map((c) => (
                      <SelectItem key={c.slug} value={c.slug}>
                        {t("cityOption", { city: c.name, count: c.count })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {/* Mobile: list / map toggle */}
            <div role="group" aria-label={t("viewLabel")} className="flex shrink-0 rounded-xl border bg-card p-1 lg:hidden">
              <button
                type="button"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring",
                  view === "list" ? "bg-primary text-primary-foreground" : "text-foreground",
                )}
              >
                <List aria-hidden="true" className="size-4" />
                {t("viewList")}
              </button>
              <button
                type="button"
                aria-pressed={view === "map"}
                onClick={() => setView("map")}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring",
                  view === "map" ? "bg-primary text-primary-foreground" : "text-foreground",
                )}
              >
                <MapIcon aria-hidden="true" className="size-4" />
                {t("viewMap")}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        {/* List */}
        <div className={cn(view === "map" && "hidden", "lg:block")}>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-10 text-center">
              <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <SearchX className="size-6" />
              </span>
              <p className="font-semibold">{t("noMatchTitle")}</p>
              <p className="max-w-xs text-sm text-muted-foreground">{t("noMatchBody")}</p>
              {filtersActive ? (
                <Button type="button" variant="outline" className="h-10 px-4" onClick={clearFilters}>
                  {t("clearFilters")}
                </Button>
              ) : null}
            </div>
          ) : (
            <ul
              aria-label={t("listLabel")}
              className="space-y-3 lg:max-h-[38rem] lg:overflow-y-auto lg:overscroll-contain lg:pe-2"
            >
              {filtered.map((place) => (
                <li
                  key={place.id}
                  ref={(node) => {
                    if (node) cardRefs.current.set(place.id, node);
                    else cardRefs.current.delete(place.id);
                  }}
                >
                  <PlaceCard place={place} selected={place.id === selectedId} onShowOnMap={() => showOnMap(place.id)} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Map */}
        <div className={cn(view === "list" && "hidden", "lg:block")}>
          <div className="relative h-[28rem] overflow-hidden rounded-2xl border bg-muted shadow-card sm:h-[32rem] lg:sticky lg:top-32 lg:h-[38rem]">
            {showMap ? (
              <PlacesMap
                places={filtered}
                selectedId={selectedId}
                onSelect={selectFromMap}
                onShowInList={showInList}
                focusRequest={focusRequest}
                tileUrl={map.tileUrl}
                tileAttribution={map.tileAttribution}
                center={map.center}
                zoom={map.zoom}
                className="size-full"
              />
            ) : null}
            {filtered.length === 0 && showMap ? (
              <div className="pointer-events-none absolute inset-x-4 top-4 z-[500] flex justify-center">
                <p className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm font-medium shadow-card">
                  <MapPinned aria-hidden="true" className="size-4 text-muted-foreground" />
                  {t("noMatchTitle")}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
