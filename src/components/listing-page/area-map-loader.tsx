"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { MapIcon } from "lucide-react";
import type { AreaMapProps } from "./area-map";

function MapSkeleton() {
  const t = useTranslations("listing.map");
  return (
    <div role="status" className="flex size-full animate-pulse items-center justify-center bg-muted text-muted-foreground motion-reduce:animate-none">
      <MapIcon className="size-8" aria-hidden />
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}

const AreaMap = dynamic(() => import("./area-map"), { ssr: false, loading: MapSkeleton });

/** The approximate-area map, loaded only in the browser (Leaflet needs `window`). */
export function AreaMapLoader(props: AreaMapProps) {
  return <AreaMap {...props} />;
}
