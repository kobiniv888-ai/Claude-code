/**
 * The 20 demo listings (data only — safe to import from scripts and tests). Listings that an
 * earlier version of the seed created and that are gone now are deleted by the seed.
 */
import { BATUMI_LISTINGS } from "./batumi";
import { KUTAISI_LISTINGS } from "./kutaisi";
import { MOUNTAIN_LISTINGS } from "./mountains";
import { REGION_LISTINGS } from "./regions";
import { TBILISI_LISTINGS } from "./tbilisi";
import type { ListingSeed } from "./types";

export const ALL_LISTINGS: ListingSeed[] = [
  ...TBILISI_LISTINGS,
  ...KUTAISI_LISTINGS,
  ...BATUMI_LISTINGS,
  ...MOUNTAIN_LISTINGS,
  ...REGION_LISTINGS,
].sort((a, b) => a.n - b.n);

/** Demo listing numbers of earlier seeds that no longer exist (deleted on every seed run). */
export const REMOVED_LISTING_NUMBERS = [7, 8, 9, 10, 22] as const;

/** Folder of a demo listing's photos under public/: "/photos/listings/01-tbilisi-vake". */
export function demoPhotoFolder(seed: Pick<ListingSeed, "n" | "city" | "neighborhood">): string {
  return `/photos/listings/${String(seed.n).padStart(2, "0")}-${seed.city}-${seed.neighborhood}`;
}

/** Public path of one demo photo: "/photos/listings/01-tbilisi-vake/lv14.webp". */
export function demoPhotoPath(seed: Pick<ListingSeed, "n" | "city" | "neighborhood">, key: string): string {
  return `${demoPhotoFolder(seed)}/${key}.webp`;
}
