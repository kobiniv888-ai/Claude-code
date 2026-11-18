import { Droplets, House, Landmark, ScrollText, ShoppingBasket, Utensils, type LucideIcon } from "lucide-react";
import type { JewishPlaceType } from "@/lib/jewish-life/places";

/**
 * Icon and colors for each place type. Round 2: one purple pin for every type (the icon tells them
 * apart; white icon on top, 10:1) and quiet grey chips, in light and dark mode.
 */
export const PLACE_TYPE_STYLE: Record<JewishPlaceType, { icon: LucideIcon; pin: string; chip: string }> = {
  SYNAGOGUE: {
    icon: ScrollText,
    pin: "#4B2A8C",
    chip: "bg-surface-muted text-muted-foreground",
  },
  CHABAD_HOUSE: {
    icon: House,
    pin: "#4B2A8C",
    chip: "bg-surface-muted text-muted-foreground",
  },
  KOSHER_RESTAURANT: {
    icon: Utensils,
    pin: "#4B2A8C",
    chip: "bg-surface-muted text-muted-foreground",
  },
  KOSHER_SHOP: {
    icon: ShoppingBasket,
    pin: "#4B2A8C",
    chip: "bg-surface-muted text-muted-foreground",
  },
  MIKVEH: {
    icon: Droplets,
    pin: "#4B2A8C",
    chip: "bg-surface-muted text-muted-foreground",
  },
  HERITAGE_SITE: {
    icon: Landmark,
    pin: "#4B2A8C",
    chip: "bg-surface-muted text-muted-foreground",
  },
};
