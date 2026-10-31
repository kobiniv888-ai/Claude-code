"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { MapIcon } from "lucide-react";
import type { ListingsMapProps } from "./listings-map";

function MapSkeleton() {
  const t = useTranslations("search.map");
  return (
    <div
      role="status"
      className="flex h-full w-full animate-pulse items-center justify-center bg-muted text-muted-foreground motion-reduce:animate-none"
    >
      <MapIcon className="size-8" aria-hidden="true" />
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}

const ListingsMap = dynamic(() => import("./listings-map"), { ssr: false, loading: MapSkeleton });

/** The search map, loaded only in the browser (Leaflet needs `window`). */
export function ListingsMapLoader(props: ListingsMapProps) {
  return <ListingsMap {...props} />;
}
