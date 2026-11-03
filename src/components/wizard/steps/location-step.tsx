"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { EyeOffIcon, LoaderCircleIcon, LocateFixedIcon, MapPinIcon, SearchIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { siteConfig } from "@/config/site";
import { formatNumber } from "@/lib/format";
import { haversineMeters, type LatLng } from "@/lib/geo";
import { scrollBehavior } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { normalizeGeocodeQuery, type GeocodeResult } from "@/lib/geocode/core";
import { isInGeorgia, LIMITS } from "@/lib/wizard/schemas";
import type { WizardCity } from "@/lib/wizard/types";
import { Field, FieldError, Section } from "../fields";
import type { StepProps } from "../step-props";

const LocationPicker = dynamic(() => import("@/components/maps/location-picker"), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-none" />,
});

type SearchState = "idle" | "short" | "loading" | "done" | "error" | "busy";

/** A pin farther than this from every neighborhood center is not given a neighborhood. */
const NEIGHBORHOOD_MAX_METERS = 3500;
/** A pin within this distance of a city center picks that city when none is chosen. */
const CITY_GUESS_MAX_METERS = 30_000;

function nearest<T extends LatLng>(items: T[], point: LatLng, maxMeters: number): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const item of items) {
    const d = haversineMeters(item, point);
    if (d < bestDistance) {
      best = item;
      bestDistance = d;
    }
  }
  return bestDistance <= maxMeters ? best : null;
}

/**
 * Address search (bug 8.9): one request per "Search" press or Enter, through our own
 * `/api/geocode` (cached, 1 request per second site-wide to OpenStreetMap). Never per keystroke.
 */
function AddressSearch({
  locale,
  onPick,
}: {
  locale: string;
  onPick: (result: { lat: number; lng: number; street: string | null }) => void;
}) {
  const t = useTranslations("wizard.location");
  const tc = useTranslations("common");
  const id = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [state, setState] = useState<SearchState>("idle");
  const [open, setOpen] = useState(false);
  const lastSearched = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const search = async () => {
    const q = normalizeGeocodeQuery(query);
    if (!q) {
      setState("short");
      setOpen(false);
      return;
    }
    if (state === "loading") return;
    // The same words again: show the last answer instead of asking again.
    if (q === lastSearched.current && state === "done") {
      setOpen(true);
      return;
    }
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setState("loading");
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(q)}&locale=${encodeURIComponent(locale)}`, {
        signal: abort.signal,
        headers: { Accept: "application/json" },
      });
      if (response.status === 503 || response.status === 429) {
        setState("busy");
        return;
      }
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { results?: GeocodeResult[] };
      setResults(Array.isArray(data.results) ? data.results : []);
      lastSearched.current = q;
      setOpen(true);
      setState("done");
    } catch (error) {
      if ((error as Error).name !== "AbortError") setState("error");
    }
  };

  const pick = (result: GeocodeResult) => {
    // Only the street and house number go into the private address, never the place's name
    // (bug 2.6). Results cached before streets were parsed have none: the address stays as typed.
    const street = typeof result.street === "string" && result.street.trim() ? result.street.slice(0, LIMITS.addressMax) : null;
    onPick({ lat: result.lat, lng: result.lng, street });
    // The search box shows what was picked — the street when there is one, not the place's name.
    const shown = street ?? result.label;
    setQuery(shown);
    lastSearched.current = normalizeGeocodeQuery(shown);
    setOpen(false);
  };

  const listId = `${id}-list`;
  const showList = open && state === "done";
  const help =
    state === "error" ? t("searchError") : state === "busy" ? t("searchBusy") : state === "short" ? t("searchShort") : t("searchHelp");
  return (
    <div className="grid gap-2">
      <label htmlFor={`${id}-input`} className="text-sm font-medium">
        {t("searchLabel")}
      </label>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id={`${id}-input`}
            type="search"
            enterKeyHint="search"
            aria-describedby={`${id}-help`}
            aria-controls={showList ? listId : undefined}
            dir="auto"
            autoComplete="off"
            value={query}
            placeholder={t("searchPlaceholder")}
            onChange={(e) => {
              setQuery(e.target.value);
              if (state !== "loading") setState("idle");
              setOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // Enter searches; it never submits the post form.
                e.preventDefault();
                void search();
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            className="h-11 ps-9 text-base [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
        <Button type="button" onClick={() => void search()} disabled={state === "loading"} className="h-11 shrink-0 px-4">
          {state === "loading" ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : null}
          {tc("search")}
        </Button>
      </div>
      <p id={`${id}-help`} className="text-xs text-muted-foreground" aria-live="polite">
        {help}
      </p>
      {showList && (
        <ul id={listId} aria-label={t("searchResults")} className="grid gap-1 rounded-xl border border-border bg-popover p-1">
          {results.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-muted-foreground">{t("searchEmpty")}</li>
          ) : (
            results.map((result) => (
              <li key={result.id}>
                <button
                  type="button"
                  onClick={() => pick(result)}
                  className="flex min-h-11 w-full cursor-pointer items-start gap-2 rounded-lg px-3 py-2.5 text-start text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span dir="auto" className="line-clamp-2">
                    {result.label}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      <p className="sr-only" aria-live="polite">
        {showList ? t("searchCount", { count: results.length }) : ""}
      </p>
    </div>
  );
}

/** Step 3 — city, neighborhood, address search, pin on the map. Address and pin stay private. */
export function LocationStep({ values, set, errors, context, locale }: StepProps) {
  const t = useTranslations("wizard.location");
  const [focusKey, setFocusKey] = useState(0);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [filledFromSearch, setFilledFromSearch] = useState(false);
  const neighborhoodTouched = useRef(values.neighborhoodId !== null);
  const addressId = useId();

  const cities = context.cities;
  const city: WizardCity | undefined = cities.find((c) => c.id === values.cityId);
  const pin = values.lat !== null && values.lng !== null ? { lat: values.lat, lng: values.lng } : null;
  const center = useMemo(
    () => (city ? { lat: city.lat, lng: city.lng } : siteConfig.map.defaultCenter),
    [city],
  );

  /** A new pin: guess the city (if none) and the nearest neighborhood (unless chosen by hand). */
  const placePin = (point: LatLng, extra: { address?: string } = {}) => {
    const patch: Parameters<typeof set>[0] = { lat: Number(point.lat.toFixed(6)), lng: Number(point.lng.toFixed(6)), ...extra };
    let targetCity = city;
    if (!targetCity || haversineMeters(targetCity, point) > CITY_GUESS_MAX_METERS) {
      const guess = nearest(cities, point, CITY_GUESS_MAX_METERS);
      if (guess && guess.id !== targetCity?.id) {
        targetCity = guess;
        patch.cityId = guess.id;
        patch.neighborhoodId = null;
        neighborhoodTouched.current = false;
      }
    }
    if (targetCity && !neighborhoodTouched.current) {
      const guess = nearest(targetCity.neighborhoods, point, NEIGHBORHOOD_MAX_METERS);
      patch.neighborhoodId = guess?.id ?? null;
    }
    set(patch);
  };

  const locateMe = () => {
    if (!("geolocation" in navigator)) {
      setGeoError(t("geoUnsupported"));
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (!isInGeorgia(point.lat, point.lng)) {
          setGeoError(t("geoOutside"));
          return;
        }
        placePin(point);
        setFocusKey((k) => k + 1);
      },
      (error) => {
        setLocating(false);
        setGeoError(error.code === error.PERMISSION_DENIED ? t("geoDenied") : t("geoFailed"));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  const pinError = errors.lat;

  return (
    <div className="grid gap-6">
      <Section>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("cityLabel")} error={errors.cityId}>
            {(props) => (
              <Select
                value={values.cityId ?? ""}
                onValueChange={(cityId) => {
                  neighborhoodTouched.current = false;
                  const next = cities.find((c) => c.id === cityId);
                  // Keep the pin only if it is in (or near) the new city.
                  const keepPin = pin && next && haversineMeters(next, pin) <= CITY_GUESS_MAX_METERS;
                  set({
                    cityId,
                    neighborhoodId: keepPin && next ? nearest(next.neighborhoods, pin, NEIGHBORHOOD_MAX_METERS)?.id ?? null : null,
                    ...(keepPin ? {} : { lat: null, lng: null }),
                  });
                  setFocusKey((k) => k + 1);
                }}
              >
                <SelectTrigger {...props} className="h-11 w-full bg-card text-base">
                  <SelectValue placeholder={t("cityPlaceholder")} />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-80">
                  {cities.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field
            label={t("neighborhoodLabel")}
            optional
            description={city && city.neighborhoods.length > 0 ? t("neighborhoodHelp") : undefined}
          >
            {(props) => (
              <Select
                value={values.neighborhoodId ?? "none"}
                disabled={!city || city.neighborhoods.length === 0}
                onValueChange={(id) => {
                  neighborhoodTouched.current = id !== "none";
                  set({ neighborhoodId: id === "none" ? null : id });
                }}
              >
                <SelectTrigger {...props} className="h-11 w-full bg-card text-base">
                  <SelectValue placeholder={t("neighborhoodPlaceholder")} />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-80">
                  <SelectItem value="none">{t("neighborhoodNone")}</SelectItem>
                  {city?.neighborhoods.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        </div>
        {cities.length === 0 && <p className="text-sm text-foreground">{t("noCities")}</p>}

        <AddressSearch
          locale={locale}
          onPick={({ lat, lng, street }) => {
            if (!isInGeorgia(lat, lng)) return;
            // The pin goes on the chosen result; the address gets its street and number only.
            placePin({ lat, lng }, street ? { address: street } : {});
            setFocusKey((k) => k + 1);
            if (!street) return;
            setFilledFromSearch(true);
            // The host adds the entrance and apartment: the cursor waits at the end of the address.
            requestAnimationFrame(() => {
              const input = document.getElementById(addressId) as HTMLInputElement | null;
              if (!input) return;
              input.focus({ preventScroll: true });
              input.scrollIntoView({ block: "center", behavior: scrollBehavior() });
              input.setSelectionRange(input.value.length, input.value.length);
            });
          }}
        />

        <Field
          id={addressId}
          label={t("addressLabel")}
          description={filledFromSearch ? t("addressFromSearch") : t("addressHelp")}
          optional
          labelAddon={
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <EyeOffIcon className="size-3.5" aria-hidden />
              {t("private")}
            </span>
          }
        >
          {(props) => (
            <Input
              {...props}
              dir="auto"
              value={values.address}
              maxLength={LIMITS.addressMax}
              autoComplete="street-address"
              onChange={(e) => set({ address: e.target.value })}
              className="h-11 text-base"
            />
          )}
        </Field>
      </Section>

      <Section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-0.5">
            <h3 className="font-semibold">{t("mapTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("mapHelp")}</p>
          </div>
          <Button type="button" variant="outline" onClick={locateMe} disabled={locating} className="h-10">
            {locating ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : <LocateFixedIcon aria-hidden />}
            {t("useMyLocation")}
          </Button>
        </div>
        <div
          className={cn(
            "relative h-72 overflow-hidden rounded-xl border sm:h-96",
            pinError ? "border-destructive ring-3 ring-destructive/20" : "border-border",
          )}
          data-invalid={pinError ? true : undefined}
        >
          <LocationPicker
            value={pin}
            onChange={(point) => {
              setGeoError(null);
              placePin(point);
            }}
            allowed={(point) => isInGeorgia(point.lat, point.lng)}
            onRejected={() => setGeoError(t("tapOutside"))}
            center={center}
            zoom={city ? siteConfig.map.defaultZoom : 7}
            focusKey={focusKey}
            labels={{ map: t("mapLabel"), pin: t("pinLabel") }}
            className="size-full"
          />
        </div>
        {geoError && (
          <p className="text-sm text-foreground" role="status">
            {geoError}
          </p>
        )}
        {pinError && <FieldError id="pin-error">{pinError}</FieldError>}
        {pin && (
          <p className="text-xs text-muted-foreground">
            {t("pinSet")}{" "}
            <bdi dir="ltr" className="tabular-nums">
              {formatNumber(pin.lat, locale, { maximumFractionDigits: 5 })}, {formatNumber(pin.lng, locale, { maximumFractionDigits: 5 })}
            </bdi>
          </p>
        )}
        <div className="flex items-start gap-3 rounded-xl bg-primary-tint p-3.5 text-sm text-foreground">
          <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-primary-text" aria-hidden />
          <p className="text-pretty">{t("privacyNote", { meters: siteConfig.listings.approximateLocationMeters })}</p>
        </div>
      </Section>
    </div>
  );
}
