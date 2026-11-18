"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import MarkerClusterGroup from "react-leaflet-cluster";
import type { CommunityPlace } from "@/lib/map/community";
import { formatNumber } from "@/lib/format";
import { CommunityMarkers } from "./community-layer";
import { communityClusterIcon, type ClusterLike } from "./map-icons";

/**
 * The community places on the search map, grouped separately from the listings: at country or
 * region zoom each town's places become one small synagogue pill with a count, drawn beside the
 * listings' bubble instead of on top of it. From street level (zoom 14) every place shows alone.
 * The listing page's small map keeps plain markers (<CommunityMarkers>).
 */
export function CommunityClusters({ places, animate }: { places: CommunityPlace[]; animate: boolean }) {
  const t = useTranslations("map.community");
  const locale = useLocale();
  const iconFor = useCallback(
    (cluster: ClusterLike) => {
      const count = cluster.getChildCount();
      return communityClusterIcon(count, t("cluster", { count, formatted: formatNumber(count, locale) }));
    },
    [t, locale],
  );
  return (
    <MarkerClusterGroup
      showCoverageOnHover={false}
      spiderfyOnMaxZoom={false}
      disableClusteringAtZoom={14}
      maxClusterRadius={70}
      animate={animate}
      iconCreateFunction={iconFor}
    >
      <CommunityMarkers places={places} />
    </MarkerClusterGroup>
  );
}
