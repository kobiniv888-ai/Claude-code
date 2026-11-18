"use client";

import { useEffect, useRef, useState } from "react";
import { MapIcon, RotateCcwIcon } from "lucide-react";
import { buttonStyles } from "@/components/ds/button";
import { ListingsMapLoader } from "@/components/maps/listings-map-loader";
import { useNearViewport } from "@/hooks/use-near-viewport";
import type { ListingMapPoint } from "@/lib/listing/types";
import { getSearchMapPoints } from "@/lib/search/actions";

export type CityMapLabels = { show: string; loading: string; error: string; retry: string };

type Loaded = { key: string; points: ListingMapPoint[] | null };

/**
 * The city page's map: the search map (approximate pins, price pills, the Jewish community layer),
 * loaded only when the visitor scrolls near it or taps "Show the map". Until then it is an empty
 * frame with that button, so neither Leaflet nor the points cost anything on the first load. The
 * points come from the search's own map action (the same filters as the page: deal + city).
 */
export function CityMap({ query, citySlug, labels }: { query: string; citySlug: string; labels: CityMapLabels }) {
  const frame = useRef<HTMLDivElement>(null);
  const near = useNearViewport(frame, "200px");
  const [tapped, setTapped] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const wanted = near || tapped;
  const key = `${query}#${attempt}`;

  useEffect(() => {
    if (!wanted || loaded?.key === key) return;
    let cancelled = false;
    void getSearchMapPoints(query)
      .catch(() => null)
      .then((result) => {
        if (!cancelled) setLoaded({ key, points: result?.ok ? result.data.points : null });
      });
    return () => {
      cancelled = true;
    };
  }, [wanted, key, query, loaded?.key]);

  const current = loaded?.key === key ? loaded : null;

  return (
    <div ref={frame} className="relative isolate h-72 overflow-hidden rounded-card border border-border bg-muted sm:h-96">
      {current?.points ? (
        // The map itself always stays left-to-right; its controls follow the page.
        <div dir="ltr" className="size-full">
          <ListingsMapLoader
            points={current.points}
            highlightedId={null}
            fitKey={query}
            initialBounds={null}
            focusPlace={{ citySlug }}
          />
        </div>
      ) : current ? (
        <div role="alert" className="flex size-full flex-col items-center justify-center gap-3 p-4 text-center">
          <p className="text-small text-muted-foreground">{labels.error}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className={buttonStyles({ variant: "secondary" })}>
            <RotateCcwIcon aria-hidden="true" />
            {labels.retry}
          </button>
        </div>
      ) : wanted ? (
        <div role="status" className="flex size-full items-center justify-center text-muted-foreground skeleton-shimmer">
          <MapIcon className="size-8" aria-hidden="true" />
          <span className="sr-only">{labels.loading}</span>
        </div>
      ) : (
        <div className="flex size-full items-center justify-center">
          <button type="button" onClick={() => setTapped(true)} className={buttonStyles({ variant: "secondary" })}>
            <MapIcon aria-hidden="true" />
            {labels.show}
          </button>
        </div>
      )}
    </div>
  );
}
