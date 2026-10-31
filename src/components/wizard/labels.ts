"use client";

import { useTranslations } from "next-intl";

/**
 * Labels of the listing vocabulary (deal types, amenities, Shabbat features…).
 * The shared labels live in messages/<locale>/listingFields.json (listing kit); anything not
 * there yet falls back to the wizard's own copy in wizard.json → options.*.
 */
export type OptionGroup =
  | "dealType"
  | "propertyType"
  | "amenity"
  | "shabbat"
  | "jewish"
  | "hotelJewish"
  | "condition"
  | "heating"
  | "view"
  | "kitchen"
  | "sharedRoomFor"
  | "channel"
  | "period"
  | "buildingAge";

/** listingFields.json group names for each wizard group. */
const SHARED_GROUPS: Record<OptionGroup, string> = {
  dealType: "dealType",
  propertyType: "propertyType",
  amenity: "amenity",
  shabbat: "shabbatFeature",
  jewish: "jewishFeature",
  hotelJewish: "hotelJewishFeature",
  condition: "condition",
  heating: "heating",
  view: "view",
  kitchen: "kitchenKosher",
  sharedRoomFor: "sharedRoomFor",
  channel: "contactChannel",
  period: "pricePeriod",
  buildingAge: "buildingAge",
};

export function useOptionLabel() {
  const own = useTranslations("wizard.options");
  const shared = useTranslations();
  return (group: OptionGroup, key: string): string => {
    const sharedKey = `listingFields.${SHARED_GROUPS[group]}.${key}`;
    if (shared.has(sharedKey)) {
      const value = shared.raw(sharedKey);
      if (typeof value === "string") return value;
    }
    const ownKey = `${group}.${key}`;
    return own.has(ownKey) ? own(ownKey) : key;
  };
}
