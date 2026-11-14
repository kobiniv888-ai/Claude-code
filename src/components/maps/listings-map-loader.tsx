"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { MapIcon } from "lucide-react";
import type { ListingsMapProps } from "./listings-map";

export type { ListingsMapControls, ListingsMapProps } from "./listings-map";

function MapSkeleton() {
  const t = useTranslations("map");
  return (
    <div role="status" className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground skeleton-shimmer">
      <MapIcon className="size-8" aria-hidden="true" />
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}

/**
 * Leaflet, the cluster plugin and the map's styles are a separate chunk, downloaded only when a
 * map is actually shown (the map view, or the desktop split view). Never rendered on the server.
 */
const ListingsMap = dynamic(() => import("./listings-map"), { ssr: false, loading: MapSkeleton });

/** The search map, loaded only in the browser (Leaflet needs `window`). */
export function ListingsMapLoader(props: ListingsMapProps) {
  return <ListingsMap {...props} />;
}
