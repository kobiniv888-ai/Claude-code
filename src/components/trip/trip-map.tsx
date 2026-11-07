"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { MapIcon, WifiOffIcon } from "lucide-react";
import { Button } from "@/components/ds/button";
import { useNearViewport } from "@/hooks/use-near-viewport";
import type { TripMapViewProps } from "./trip-map-view";

function MapPlaceholder({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 bg-surface-muted p-4 text-center text-small text-muted-foreground">
      {children}
    </div>
  );
}

function Loading() {
  const t = useTranslations("trips.where");
  return (
    <div role="status" className="skeleton-shimmer flex size-full items-center justify-center bg-muted text-muted-foreground">
      <MapIcon className="size-8" aria-hidden />
      <span className="sr-only">{t("mapLabel")}</span>
    </div>
  );
}

const TripMapView = dynamic(() => import("./trip-map-view"), { ssr: false, loading: Loading });

type Connection = { saveData?: boolean; effectiveType?: string };

/** "Save data" on, or a 2G connection: wait for a tap instead of loading the map by itself. */
function savesData(): boolean {
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  return !!connection && (connection.saveData === true || connection.effectiveType === "slow-2g" || connection.effectiveType === "2g");
}

/**
 * The exact-location map of the trip page, light on weak connections (round 3, brief 7.1): no map
 * code until the map scrolls near the screen; with "save data" or on 2G only after a tap; offline
 * (a saved copy of the page) a short note instead, because map tiles are never saved.
 */
export function TripMap(props: TripMapViewProps) {
  const t = useTranslations("trips.where");
  const ref = useRef<HTMLDivElement>(null);
  const near = useNearViewport(ref);
  const [mode, setMode] = useState<"auto" | "tap" | "offline">("auto");
  const [tapped, setTapped] = useState(false);

  useEffect(() => {
    const update = () => setMode(!navigator.onLine ? "offline" : savesData() ? "tap" : "auto");
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  let content: React.ReactNode;
  if (mode === "offline") {
    content = (
      <MapPlaceholder>
        <WifiOffIcon className="size-7" aria-hidden />
        <p className="max-w-xs">{t("mapOffline")}</p>
      </MapPlaceholder>
    );
  } else if ((mode === "auto" && near) || tapped) {
    content = <TripMapView {...props} />;
  } else if (mode === "tap") {
    content = (
      <MapPlaceholder>
        <MapIcon className="size-7" aria-hidden />
        <p className="max-w-xs">{t("mapSaver")}</p>
        <Button variant="secondary" size="md" onClick={() => setTapped(true)}>
          {t("showMap")}
        </Button>
      </MapPlaceholder>
    );
  } else {
    content = <Loading />;
  }

  return (
    <div ref={ref} className="h-56 overflow-hidden rounded-xl border border-border sm:h-72">
      {content}
    </div>
  );
}
