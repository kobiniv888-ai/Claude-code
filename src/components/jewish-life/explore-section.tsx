import { getTranslations } from "next-intl/server";
import { PhotoSlot } from "@/components/photos/photo-slot";
import type { PhotoSlotKey } from "@/config/photos";
import type { AppLocale } from "@/config/site";
import { formatNumber } from "@/lib/format";
import { serializePlaceTypes, type JewishPlaceType } from "@/lib/jewish-life/places";
import { loadPlaces } from "./data";
import { PlaceTypeLink } from "./place-type-link";

type Topic = {
  key: "synagogues" | "kosher" | "community";
  slot: PhotoSlotKey;
  types: JewishPlaceType[];
};

/** Photo slots: kosher food and community show a stock fallback until real photos arrive (PHOTOS_NEEDED.md). */
const TOPICS: readonly Topic[] = [
  { key: "synagogues", slot: "jewish.synagogueInterior", types: ["SYNAGOGUE"] },
  { key: "kosher", slot: "jewish.kosherFood", types: ["KOSHER_RESTAURANT", "KOSHER_SHOP"] },
  { key: "community", slot: "jewish.community", types: ["CHABAD_HOUSE", "MIKVEH", "HERITAGE_SITE"] },
];

/**
 * Three small photo tiles — synagogues, kosher food, community — with the real number of places
 * on the map; a tap filters the map and list below. Three across on every screen (round 2: small
 * photos, the title under the photo, no overlays).
 */
export async function ExploreSection({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "jewishLife.explore" });
  const { records } = await loadPlaces();

  return (
    <section aria-labelledby="jl-explore-title" className="mb-6">
      <h3 id="jl-explore-title" className="sr-only">
        {t("title")}
      </h3>
      <ul className="grid grid-cols-3 gap-2 sm:gap-4">
        {TOPICS.map(({ key, slot, types }) => {
          const count = records.filter((place) => types.includes(place.type)).length;
          return (
            <li key={key} className="min-w-0">
              <PlaceTypeLink
                typeParam={serializePlaceTypes(types)}
                className="group flex h-full flex-col rounded-card outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="block overflow-hidden rounded-card bg-surface-muted">
                  <PhotoSlot
                    slot={slot}
                    sizes="(min-width: 1200px) 380px, (min-width: 640px) 31vw, 30vw"
                    className="aspect-[4/3] w-full transition-transform duration-(--motion-base) group-hover:scale-[1.03] motion-reduce:transition-none"
                  />
                </span>
                <span className="mt-2 text-small font-medium text-balance text-foreground sm:text-body">{t(`${key}.title`)}</span>
                <span className="hidden text-small text-pretty text-muted-foreground sm:block">{t(`${key}.body`)}</span>
                <span className="mt-0.5 text-caption text-pretty text-muted-foreground">
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
