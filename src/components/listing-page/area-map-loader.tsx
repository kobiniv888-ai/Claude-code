"use client";

import { useRef } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { MapIcon } from "lucide-react";
import { useNearViewport } from "@/hooks/use-near-viewport";
import type { AreaMapProps } from "./area-map";

function MapSkeleton() {
  const t = useTranslations("listing.map");
  return (
    <div role="status" className="skeleton-shimmer flex size-full items-center justify-center bg-muted text-muted-foreground">
      <MapIcon className="size-8" aria-hidden />
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}

const AreaMap = dynamic(() => import("./area-map"), { ssr: false, loading: MapSkeleton });

/**
 * The location map, loaded only in the browser (Leaflet needs `window`) and only when the
 * visitor scrolls near it, so Leaflet and the map tiles do not compete with the top of the page.
 */
export function AreaMapLoader(props: AreaMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useNearViewport(ref);
  return (
    <div ref={ref} className="size-full">
      {near ? <AreaMap {...props} /> : <MapSkeleton />}
    </div>
  );
}
