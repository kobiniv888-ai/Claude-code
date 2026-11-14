import L from "leaflet";
import type { CommunityPlaceType } from "@/lib/map/community";

/**
 * Leaflet icons of the search map (styles in listings-map.css). The marker element is the hit
 * area (at least 44px tall); the visible shape inside it animates. State (hovered / selected) is a
 * class on the marker element, so changing it never rebuilds the icon or replays the scale-in.
 * Client-only (Leaflet needs `window`): import from the lazily loaded map only.
 */

const HIT = 44;

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const pillCache = new Map<string, L.DivIcon>();

/** A navy price pill ("₪450"). */
export function pricePillIcon(label: string): L.DivIcon {
  const cached = pillCache.get(label);
  if (cached) return cached;
  // Approximate width of the 13px bold label (invisible bidi marks do not count) + padding.
  const visible = label.replace(/[‎‏؜⁦-⁩]/g, "");
  const width = Math.max(HIT, Math.round(visible.length * 8 + 30));
  const icon = L.divIcon({
    className: "bayit-pill-marker",
    html: `<span class="bayit-pill" dir="ltr">${escapeHtml(label)}</span>`,
    iconSize: [width, HIT],
    iconAnchor: [width / 2, HIT / 2],
  });
  pillCache.set(label, icon);
  return icon;
}

/** The part of leaflet.markercluster's MarkerCluster we use (its type package is not installed). */
export type ClusterLike = { getChildCount(): number };

/** A navy bubble with the number of homes inside (the label names it for screen readers). */
export function clusterIcon(count: number, label: string): L.DivIcon {
  const size = count < 10 ? 44 : count < 100 ? 50 : 56;
  return L.divIcon({
    className: "bayit-cluster-marker",
    html: `<span class="bayit-cluster" dir="ltr" aria-hidden="true">${count}</span><span class="sr-only">${escapeHtml(label)}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Sprite symbol id of a community place type (the sprite is rendered by <CommunityIconSprite>). */
export function placeSymbolId(type: CommunityPlaceType): string {
  return `bayit-map-place-${type}`;
}

const placeCache = new Map<string, L.DivIcon>();

/** A round colored badge with the place type's icon (synagogue, Chabad house, kosher stamp). */
export function placeIcon(type: CommunityPlaceType): L.DivIcon {
  const cached = placeCache.get(type);
  if (cached) return cached;
  const icon = L.divIcon({
    className: "bayit-place-marker",
    html:
      `<span class="bayit-place" data-type="${type}">` +
      `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#${placeSymbolId(type)}"></use></svg>` +
      `</span>`,
    iconSize: [HIT, HIT],
    iconAnchor: [HIT / 2, HIT / 2],
    popupAnchor: [0, -HIT / 2 + 4],
  });
  placeCache.set(type, icon);
  return icon;
}

/** Width and height of the community-places bubble (an icon and a count, in a pill). */
const PLACE_CLUSTER = { width: 54, height: 32 } as const;

/**
 * Community places grouped at country or region zoom: a small pill with the synagogue icon and
 * a count. It is drawn up and to the right of the group's center (the map is always left-to-right),
 * so it sits beside the listings' bubble or price pill for the same town instead of on top of it.
 */
export function communityClusterIcon(count: number, label: string): L.DivIcon {
  return L.divIcon({
    className: "bayit-place-cluster-marker",
    html:
      `<span class="bayit-place-cluster" dir="ltr" aria-hidden="true">` +
      `<span class="bayit-place-cluster-icon"><svg width="14" height="14" viewBox="0 0 24 24" focusable="false"><use href="#${placeSymbolId("SYNAGOGUE")}"></use></svg></span>` +
      `${count}</span><span class="sr-only">${escapeHtml(label)}</span>`,
    iconSize: [PLACE_CLUSTER.width, PLACE_CLUSTER.height],
    // Negative x and a y larger than the height: the pill's bottom-left corner is 20px right of and
    // 20px above the point, clear of a 44-56px listings bubble centered on it.
    iconAnchor: [-20, PLACE_CLUSTER.height + 20],
  });
}
