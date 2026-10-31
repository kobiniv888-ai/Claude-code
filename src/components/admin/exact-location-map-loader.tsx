"use client";

import { MapIcon } from "lucide-react";
import dynamic from "next/dynamic";
import type { ExactLocationMapProps } from "./exact-location-map";

const Map = dynamic(() => import("./exact-location-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full animate-pulse items-center justify-center rounded-lg bg-muted text-muted-foreground motion-reduce:animate-none">
      <MapIcon aria-hidden className="size-6" />
    </div>
  ),
});

export function ExactLocationMapLoader(props: ExactLocationMapProps) {
  return <Map {...props} />;
}
