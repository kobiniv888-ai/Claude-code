import { UtensilsCrossed, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { IconCircle } from "@/components/ds/icon-circle";
import { SynagogueIcon, type IconComponent } from "@/components/ds/jewish-icons";
import { PhotoSlot } from "@/components/photos/photo-slot";
import type { PhotoSlotKey } from "@/config/photos";
import type { AppLocale } from "@/config/site";
import { formatNumber } from "@/lib/format";
import { serializePlaceTypes, type JewishPlaceType } from "@/lib/jewish-life/places";
import { cn } from "@/lib/utils";
import { loadPlaces } from "./data";
import { PlaceTypeLink } from "./place-type-link";

type Topic = {
  key: "synagogues" | "kosher" | "community";
  slot: PhotoSlotKey;
  icon: IconComponent;
  types: JewishPlaceType[];
};

/** Photo slots: kosher food and community show a stock fallback until real photos arrive (PHOTOS_NEEDED.md). */
const TOPICS: readonly Topic[] = [
  { key: "synagogues", slot: "jewish.synagogueInterior", icon: SynagogueIcon, types: ["SYNAGOGUE"] },
  { key: "kosher", slot: "jewish.kosherFood", icon: UtensilsCrossed, types: ["KOSHER_RESTAURANT", "KOSHER_SHOP"] },
  { key: "community", slot: "jewish.community", icon: Users, types: ["CHABAD_HOUSE", "MIKVEH", "HERITAGE_SITE"] },
];

/**
 * Three big photo cards — synagogues, kosher food, community — each with the real number of places
 * on the map, filtering the map below when tapped. A sideways row on phones, three columns on desktop.
 */
export async function ExploreSection({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "jewishLife.explore" });
  const { records } = await loadPlaces();

  return (
    <section aria-labelledby="jl-explore-title" className="pt-section">
      <h2 id="jl-explore-title" className="sr-only">
        {t("title")}
      </h2>
      <ul
        className={cn(
          // Phones: cards peek in from the side; scroll-snap, no visible scrollbar.
          "-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 scrollbar-none",
          "sm:mx-0 sm:grid sm:snap-none sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0",
        )}
      >
        {TOPICS.map(({ key, slot, icon, types }) => {
          const count = records.filter((place) => types.includes(place.type)).length;
          return (
            <li key={key} className="w-[78%] shrink-0 snap-start sm:w-auto">
              <PlaceTypeLink
                typeParam={serializePlaceTypes(types)}
                className="bh-press group relative isolate flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-card bg-muted p-4 text-white shadow-card outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 sm:aspect-[4/3] lg:aspect-[3/2] lg:p-5"
              >
                <span className="bh-zoom-hover absolute inset-0 -z-10">
                  <PhotoSlot slot={slot} sizes="(min-width: 640px) 32vw, 78vw" className="size-full" />
                </span>
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 -z-10 h-3/4 bg-linear-to-t from-black/85 via-black/45 to-transparent"
                />
                <IconCircle icon={icon} tone="glass" size="md" className="absolute top-3 start-3" />
                <span className="text-h3 font-bold text-balance [text-shadow:0_1px_8px_rgb(0_0_0/0.45)]">
                  {t(`${key}.title`)}
                </span>
                <span className="mt-0.5 text-small text-pretty text-white/90">{t(`${key}.body`)}</span>
                <span className="mt-3 inline-flex w-fit items-center rounded-full bg-white/15 px-3 py-1 text-caption font-semibold ring-1 ring-white/25 backdrop-blur-sm">
                  {count > 0 ? t("count", { count, formatted: formatNumber(count, locale) }) : t("soon")}
                </span>
              </PlaceTypeLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
