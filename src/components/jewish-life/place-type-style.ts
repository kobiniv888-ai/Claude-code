import { Droplets, House, Landmark, ScrollText, ShoppingBasket, Utensils, type LucideIcon } from "lucide-react";
import type { JewishPlaceType } from "@/lib/jewish-life/places";

/**
 * Icon and colors for each place type. `pin` colors are used on the map (fixed, white icon on top,
 * all at least 4.5:1 against white); `chip` classes tint cards and filter chips in light and dark mode.
 */
export const PLACE_TYPE_STYLE: Record<JewishPlaceType, { icon: LucideIcon; pin: string; chip: string }> = {
  SYNAGOGUE: {
    icon: ScrollText,
    pin: "#1E3A6E",
    chip: "bg-primary/10 text-primary",
  },
  CHABAD_HOUSE: {
    icon: House,
    pin: "#7B2D3B",
    chip: "bg-wine/10 text-wine",
  },
  KOSHER_RESTAURANT: {
    icon: Utensils,
    pin: "#A3462F",
    chip: "bg-terracotta/10 text-accent-foreground dark:text-terracotta",
  },
  KOSHER_SHOP: {
    icon: ShoppingBasket,
    pin: "#15803D",
    chip: "bg-verified-soft text-verified",
  },
  MIKVEH: {
    icon: Droplets,
    pin: "#0E7490",
    chip: "bg-cyan-600/10 text-cyan-800 dark:text-cyan-300",
  },
  HERITAGE_SITE: {
    icon: Landmark,
    pin: "#92400E",
    chip: "bg-warning-soft text-amber-800 dark:text-warning",
  },
};
