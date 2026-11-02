import { useTranslations } from "next-intl";
import { MapPinIcon } from "lucide-react";
import { KosherStampIcon, SynagogueIcon, WelcomeHomeIcon } from "@/components/ds/jewish-icons";
import type { CommunityPlaceType } from "@/lib/map/community";
import type { NearbyCommunityPlace } from "@/lib/listing-page/places";
import type { ListingPageData } from "@/lib/listing-page/types";
import { AreaMapLoader } from "./area-map-loader";
import { NearbyList } from "./nearby-section";
import { Section } from "./section";

/** The map's place markers, for the legend (same colors as the markers in listings-map.css). */
const LEGEND = [
  { key: "synagogue", types: ["SYNAGOGUE"], icon: SynagogueIcon, color: "bg-primary" },
  { key: "chabad", types: ["CHABAD_HOUSE"], icon: WelcomeHomeIcon, color: "bg-primary" },
  { key: "kosher", types: ["KOSHER_RESTAURANT", "KOSHER_SHOP"], icon: KosherStampIcon, color: "bg-primary" },
] as const satisfies readonly { key: string; types: readonly CommunityPlaceType[]; icon: unknown; color: string }[];

/**
 * "Where it is": the approximate-area map (house pin, circle, nearby synagogues and kosher
 * places; lazy, near the viewport), a small legend, and the walking times to what is nearby.
 */
export function LocationSection({ data, place, places }: { data: ListingPageData; place: string; places: NearbyCommunityPlace[] }) {
  const t = useTranslations("listing.map");
  const tc = useTranslations("map.community.legend");
  const hasNearby = Object.values(data.nearby).some(Boolean);
  if (!data.approx && !hasNearby) return null;
  const types = new Set<CommunityPlaceType>(places.map((p) => p.type));
  const legend = LEGEND.filter((item) => item.types.some((type) => types.has(type)));

  return (
    <Section id="map" title={t("title")} description={place ? undefined : t("note")}>
      <div className="grid gap-4">
        {place ? (
          <p className="-mt-2 flex items-center gap-1.5 text-small text-muted-foreground">
            <MapPinIcon className="size-4 shrink-0 text-primary-text" aria-hidden />
            <span>{place}</span>
          </p>
        ) : null}
        {data.approx ? (
          <figure className="grid gap-2.5">
            <div dir="ltr" className="isolate h-72 overflow-hidden rounded-card border sm:h-96">
              <AreaMapLoader lat={data.approx.lat} lng={data.approx.lng} label={t("label", { place: place || data.title.shown })} places={places} />
            </div>
            <figcaption className="grid gap-2">
              {legend.length ? (
                <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-small" aria-label={tc("label")}>
                  {legend.map(({ key, icon: Icon, color }) => (
                    <li key={key} className="inline-flex items-center gap-1.5">
                      <span className={`inline-flex size-6 items-center justify-center rounded-full text-white ${color}`} aria-hidden="true">
                        <Icon className="size-3.5" />
                      </span>
                      {tc(key)}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-caption text-muted-foreground">{t("note")}</p>
            </figcaption>
          </figure>
        ) : null}
        {hasNearby ? <NearbyList nearby={data.nearby} /> : null}
      </div>
    </Section>
  );
}
