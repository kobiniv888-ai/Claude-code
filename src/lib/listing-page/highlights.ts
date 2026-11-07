/**
 * What the quiet listing page says about the place, computed from the listing's own data only
 * (client-safe, pure): the three highlights, the amenities preview, the "Kosher and Shabbat"
 * section and the house rules. Nothing here is invented: a line appears only when the owner
 * filled the field it comes from.
 */
import type { DealType, KitchenKosher, ViewType } from "@/generated/prisma/enums";
import { AMENITIES, type Amenity } from "@/lib/listing/fields";

export const HIGHLIGHTS = [
  "self_check_in",
  "sea_view",
  "kosher_kitchen",
  "mountain_view",
  "pool",
  "near_sea",
  "near_ski_lifts",
  "yard",
  "balcony_terrace",
  "workspace",
  "parking",
  "washing_machine",
  "air_conditioning",
] as const;
export type Highlight = (typeof HIGHLIGHTS)[number];

/** The amenity a highlight comes from (so the amenities preview does not say it again). */
export const HIGHLIGHT_AMENITY: Partial<Record<Highlight, Amenity>> = {
  self_check_in: "self_check_in",
  pool: "pool",
  near_sea: "near_sea",
  near_ski_lifts: "near_ski_lifts",
  yard: "yard",
  balcony_terrace: "balcony_terrace",
  workspace: "workspace",
  parking: "parking",
  washing_machine: "washing_machine",
  air_conditioning: "air_conditioning",
};

type HighlightInput = {
  dealType: DealType;
  amenities: readonly string[];
  views: readonly ViewType[];
  kitchenKosher: KitchenKosher | null;
} & WalkInput;

type WalkInput = {
  /** Round 3 (brief 7.3): computed from the pin (src/lib/geo/walk-targets.ts). Missing = none. */
  seaWalkMinutes?: number | null;
  liftWalkMinutes?: number | null;
};

/** "≈ 5 דקות הליכה לים" / "למעליות הסקי": the computed walk, shown first among the highlights. */
export type WalkHighlight = { kind: "sea" | "lift"; minutes: number };

/** The walk highlight of a listing in a sea or ski town (any stored value, i.e. up to 30 minutes). */
export function walkHighlight(data: WalkInput): WalkHighlight | null {
  const valid = (m: number | null | undefined): m is number => typeof m === "number" && Number.isFinite(m) && m > 0;
  if (valid(data.seaWalkMinutes)) return { kind: "sea", minutes: data.seaWalkMinutes };
  if (valid(data.liftWalkMinutes)) return { kind: "lift", minutes: data.liftWalkMinutes };
  return null;
}

/**
 * Up to `max` highlights in a fixed priority order (the same listing always gets the same three).
 * A sea view makes "near the sea" redundant; self check-in and the kosher kitchen only matter
 * to people who stay (not to buyers). A computed walk to the sea / lifts (walkHighlight) takes
 * the first of the `max` places and makes the host's "near the ski lifts" redundant ("near the
 * sea" is already gone from a pinned listing's amenities, see displayAmenities).
 */
export function listingHighlights(data: HighlightInput, max = 3): Highlight[] {
  const walk = walkHighlight(data);
  const stays = data.dealType !== "SALE";
  const has = (key: Highlight): boolean => {
    switch (key) {
      case "sea_view":
        return data.views.includes("SEA");
      case "mountain_view":
        return data.views.includes("MOUNTAIN");
      case "kosher_kitchen":
        return stays && data.kitchenKosher === "KOSHER";
      case "self_check_in":
        return stays && data.amenities.includes("self_check_in");
      case "near_sea":
        return !data.views.includes("SEA") && walk?.kind !== "sea" && data.amenities.includes("near_sea");
      case "near_ski_lifts":
        return walk?.kind !== "lift" && data.amenities.includes("near_ski_lifts");
      default: {
        const amenity = HIGHLIGHT_AMENITY[key];
        return !!amenity && data.amenities.includes(amenity);
      }
    }
  };
  return HIGHLIGHTS.filter(has).slice(0, Math.max(0, max - (walk ? 1 : 0)));
}

/**
 * The known amenities in a stable order, those already shown as highlights last, so the first
 * six ("What this place offers") add something new and "Show all" still lists everything.
 */
export function orderedAmenities(amenities: readonly string[], highlights: readonly Highlight[]): Amenity[] {
  const known = AMENITIES.filter((key) => amenities.includes(key));
  const said = new Set(highlights.map((h) => HIGHLIGHT_AMENITY[h]).filter(Boolean));
  return [...known.filter((key) => !said.has(key)), ...known.filter((key) => said.has(key))];
}

/** One line of the Shabbat checklist: a plain statement with a ✓ or ✗ (bug 8.8: no strikethrough). */
export type ShabbatLine =
  | { key: "key"; ok: boolean }
  | { key: "elevator"; ok: boolean; floor: number | null }
  | { key: "sensors"; ok: boolean }
  | { key: "hotPlate"; ok: boolean }
  | { key: "urn"; ok: boolean }
  | { key: "timers"; ok: boolean }
  | { key: "sukkah"; ok: boolean };

type ShabbatInput = { shabbatFeatures: readonly string[]; jewishFeatures: readonly string[]; floor: number | null };

/**
 * The Shabbat checklist, or [] when the owner did not fill in any Shabbat detail (seven ✗ lines
 * for a place whose owner skipped the step would only be noise). The floor is mentioned next to
 * a missing Shabbat elevator from the second floor up.
 */
export function shabbatChecklist({ shabbatFeatures, jewishFeatures, floor }: ShabbatInput): ShabbatLine[] {
  if (shabbatFeatures.length === 0) return [];
  const has = (key: string) => shabbatFeatures.includes(key);
  const stairsOk = has("stairs_or_shabbat_elevator");
  return [
    { key: "key", ok: has("mechanical_key") },
    { key: "elevator", ok: stairsOk, floor: !stairsOk && floor !== null && floor >= 2 ? floor : null },
    { key: "sensors", ok: has("no_motion_sensors") },
    { key: "hotPlate", ok: has("hot_plate") },
    { key: "urn", ok: has("hot_water_urn") },
    { key: "timers", ok: has("light_timers") },
    { key: "sukkah", ok: jewishFeatures.includes("sukkah_space") },
  ];
}

/** Jewish details other than the checklist and what the host block already says. */
const OTHER_JEWISH = ["mezuzot", "separable_beds", "pesach_ready", "kosher_food_nearby", "mikveh_nearby", "host_keeps_shabbat"] as const;
export type OtherJewishFeature = (typeof OTHER_JEWISH)[number];

export function otherJewishFeatures(jewishFeatures: readonly string[], hostKeepsShabbat: boolean): OtherJewishFeature[] {
  return OTHER_JEWISH.filter((key) => jewishFeatures.includes(key) || (key === "host_keeps_shabbat" && hostKeepsShabbat));
}

/**
 * Whether the folded "Kosher and Shabbat" section appears: only when the place has at least one
 * such feature (a "not kosher" kitchen alone is not one).
 */
export function hasKosherShabbat(data: {
  kitchenKosher: KitchenKosher | null;
  shabbatFeatures: readonly string[];
  jewishFeatures: readonly string[];
  hotelJewishFeatures: readonly string[];
  kosherCertName: string | null;
  hostKeepsShabbat: boolean;
  verifiedSynagogue: boolean;
}): boolean {
  return (
    data.kitchenKosher === "KOSHER" ||
    data.kitchenKosher === "CAN_KASHER" ||
    data.shabbatFeatures.length > 0 ||
    data.jewishFeatures.some((key) => key !== "host_speaks_hebrew") ||
    data.hotelJewishFeatures.length > 0 ||
    !!data.kosherCertName ||
    data.hostKeepsShabbat ||
    data.verifiedSynagogue
  );
}

export type HouseRule = { key: "smoking" | "pets" | "parties"; allowed: boolean } | { key: "quietHours"; from: string; to: string };

/** The house rules the owner set, in a fixed order (the page shows three, then "Show all"). */
export function houseRules(data: {
  smokingAllowed: boolean | null;
  petsAllowed: boolean | null;
  partiesAllowed: boolean | null;
  quietHoursFrom: string | null;
  quietHoursTo: string | null;
}): HouseRule[] {
  const rules: HouseRule[] = [];
  if (data.smokingAllowed !== null) rules.push({ key: "smoking", allowed: data.smokingAllowed });
  if (data.petsAllowed !== null) rules.push({ key: "pets", allowed: data.petsAllowed });
  if (data.partiesAllowed !== null) rules.push({ key: "parties", allowed: data.partiesAllowed });
  if (data.quietHoursFrom && data.quietHoursTo) rules.push({ key: "quietHours", from: data.quietHoursFrom, to: data.quietHoursTo });
  return rules;
}
