import type { SpriteIconName } from "@/components/ds/sprite-icons.generated";
import type { Highlight } from "@/lib/listing-page/highlights";
import type { Amenity } from "@/lib/listing/fields";

/**
 * Sprite icons (server components) for the listing page's vocabulary: the same Lucide icons as
 * AMENITY_ICONS in @/components/listing/field-icons, drawn from the sprite.
 */
export const AMENITY_SPRITE: Record<Amenity, SpriteIconName> = {
  wifi: "wifi",
  air_conditioning: "air-vent",
  heating: "heater",
  washing_machine: "washing-machine",
  dryer: "wind",
  dishwasher: "droplets",
  full_kitchen: "cooking-pot",
  workspace: "laptop",
  tv: "tv",
  parking: "car",
  balcony_terrace: "sun",
  yard: "trees",
  pool: "waves-ladder",
  sauna: "thermometer-sun",
  gym: "dumbbell",
  near_sea: "waves-horizontal",
  near_ski_lifts: "mountain-snow",
  crib_high_chair: "baby",
  wheelchair_access: "accessibility",
  self_check_in: "key-round",
};

export const HIGHLIGHT_SPRITE: Record<Highlight, SpriteIconName> = {
  self_check_in: "key-round",
  sea_view: "waves-horizontal",
  kosher_kitchen: "utensils",
  mountain_view: "mountain-snow",
  pool: "waves-ladder",
  near_sea: "waves-horizontal",
  near_ski_lifts: "mountain-snow",
  yard: "trees",
  balcony_terrace: "sun",
  workspace: "laptop",
  parking: "car",
  washing_machine: "washing-machine",
  air_conditioning: "air-vent",
};
