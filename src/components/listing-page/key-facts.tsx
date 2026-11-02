import { useLocale, useTranslations } from "next-intl";
import { ArrowUpDownIcon, BathIcon, BedDoubleIcon, BuildingIcon, DoorOpenIcon, RulerIcon, SofaIcon, UsersIcon } from "lucide-react";
import { IconCircle } from "@/components/ds/icon-circle";
import type { IconComponent } from "@/components/ds/jewish-icons";
import { AMENITY_ICONS, PROPERTY_TYPE_ICONS } from "@/components/listing/field-icons";
import { formatArea, formatNumber } from "@/lib/format";
import type { Amenity } from "@/lib/listing/fields";
import type { ListingPageData } from "@/lib/listing-page/types";

type Fact = { key: string; icon: IconComponent; text: string };

/** Amenities that are key facts too (the brief: parking, AC…), in this order. */
const KEY_AMENITIES = ["parking", "air_conditioning", "wifi", "balcony_terrace"] as const satisfies readonly Amenity[];

/** The facts as tiles, two per row (Zillow style): type, guests, rooms, beds, size, floor, parking, AC… */
export function KeyFacts({ data }: { data: ListingPageData }) {
  const t = useTranslations("listingFields");
  const tf = useTranslations("listing.facts");
  const locale = useLocale();
  const beds = (data.bedsSingle ?? 0) + (data.bedsDouble ?? 0) + (data.bedsSofa ?? 0);
  const isSale = data.dealType === "SALE";
  const facts: Fact[] = [{ key: "type", icon: PROPERTY_TYPE_ICONS[data.propertyType], text: t(`propertyType.${data.propertyType}`) }];

  if (!isSale && data.maxGuests) facts.push({ key: "guests", icon: UsersIcon, text: t("facts.upToGuests", { count: data.maxGuests }) });
  if (data.rooms && (isSale || data.dealType === "MONTHLY_RENT")) facts.push({ key: "rooms", icon: DoorOpenIcon, text: t("facts.rooms", { count: data.rooms }) });
  if (data.propertyType === "STUDIO") facts.push({ key: "studio", icon: DoorOpenIcon, text: t("facts.studio") });
  else if (data.bedrooms) facts.push({ key: "bedrooms", icon: BedDoubleIcon, text: t("facts.bedrooms", { count: data.bedrooms }) });
  if (!isSale && beds > 0) facts.push({ key: "beds", icon: BedDoubleIcon, text: t("facts.beds", { count: beds }) });
  if (data.bathrooms) facts.push({ key: "bathrooms", icon: BathIcon, text: t("facts.bathrooms", { count: data.bathrooms }) });
  if (data.sizeSqm) facts.push({ key: "size", icon: RulerIcon, text: formatArea(data.sizeSqm, locale) });
  if (data.floor !== null) {
    facts.push({
      key: "floor",
      icon: BuildingIcon,
      text:
        data.totalFloors !== null
          ? t("facts.floorOf", { floor: formatNumber(data.floor, locale), total: formatNumber(data.totalFloors, locale) })
          : t("facts.floor", { floor: formatNumber(data.floor, locale) }),
    });
  }
  if (data.elevator) facts.push({ key: "elevator", icon: ArrowUpDownIcon, text: tf("elevator") });
  if (data.furnished && data.dealType !== "SHORT_STAY" && data.dealType !== "HOTEL_ROOM") {
    facts.push({ key: "furnished", icon: SofaIcon, text: tf("furnished") });
  }
  for (const amenity of KEY_AMENITIES) {
    if (data.amenities.includes(amenity)) facts.push({ key: amenity, icon: AMENITY_ICONS[amenity], text: t(`amenity.${amenity}`) });
  }

  return (
    <section aria-labelledby="facts-title">
      <h2 id="facts-title" className="sr-only">
        {tf("title")}
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:gap-3">
        {facts.map(({ key, icon, text }) => (
          <li key={key} className="flex min-h-14 items-center gap-2.5 rounded-2xl bg-muted/80 px-3 py-2.5 dark:bg-muted">
            <IconCircle icon={icon} tone="navy" size="sm" className="bg-card dark:bg-navy-soft" />
            <span className="min-w-0 text-small leading-snug font-semibold">{text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
