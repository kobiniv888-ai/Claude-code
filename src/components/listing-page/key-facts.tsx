import { useLocale, useTranslations } from "next-intl";
import { BathIcon, BedDoubleIcon, BuildingIcon, DoorOpenIcon, FootprintsIcon, RulerIcon, UsersIcon, type LucideIcon } from "lucide-react";
import { PROPERTY_TYPE_ICONS } from "@/components/listing/field-icons";
import { formatArea, formatNumber } from "@/lib/format";
import type { ListingPageData } from "@/lib/listing-page/types";

type Fact = { key: string; icon: LucideIcon | (typeof PROPERTY_TYPE_ICONS)[keyof typeof PROPERTY_TYPE_ICONS]; text: string };

/** The key facts under the title: type, guests, bedrooms, beds, bathrooms, size, floor. */
export function KeyFacts({ data }: { data: ListingPageData }) {
  const t = useTranslations("listingFields");
  const locale = useLocale();
  const beds = (data.bedsSingle ?? 0) + (data.bedsDouble ?? 0) + (data.bedsSofa ?? 0);
  const isSale = data.dealType === "SALE";
  const facts: Fact[] = [{ key: "type", icon: PROPERTY_TYPE_ICONS[data.propertyType], text: t(`propertyType.${data.propertyType}`) }];

  if (!isSale && data.maxGuests) facts.push({ key: "guests", icon: UsersIcon, text: t("facts.upToGuests", { count: data.maxGuests }) });
  if (isSale && data.rooms) facts.push({ key: "rooms", icon: DoorOpenIcon, text: t("facts.rooms", { count: data.rooms }) });
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
  if (data.synagogueWalkMin !== null) {
    facts.push({ key: "synagogue", icon: FootprintsIcon, text: t("facts.synagogueWalk", { count: data.synagogueWalkMin }) });
  }

  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2.5 text-sm sm:text-base">
      {facts.map(({ key, icon: Icon, text }) => (
        <li key={key} className="inline-flex items-center gap-2">
          <Icon className="size-5 shrink-0 text-primary" aria-hidden />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}
