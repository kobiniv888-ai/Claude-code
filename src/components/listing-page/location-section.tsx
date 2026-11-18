import { useTranslations } from "next-intl";
import type { ListingPageData } from "@/lib/listing-page/types";
import { AreaMapLoader } from "./area-map-loader";
import { NearbyList } from "./nearby-section";
import { Section } from "./section";

/**
 * Location: the approximate-area map (a circle and a purple pin with a white border, clear in
 * dark mode too; lazy, near the viewport), "the exact location is sent after booking" (stays) or
 * "after you get in touch" (rentals, sales), and what is nearby.
 */
export function LocationSection({ data, place }: { data: ListingPageData; place: string }) {
  const t = useTranslations("listing.map");
  const hasNearby = !!(data.nearby.supermarket || data.nearby.transport || data.nearby.airport);
  if (!data.approx && !hasNearby) return null;
  const stay = data.dealType === "SHORT_STAY" || data.dealType === "HOTEL_ROOM";

  return (
    <Section id="map" title={t("title")}>
      <div className="grid gap-4">
        {data.approx ? (
          <figure className="grid gap-2">
            <div dir="ltr" className="isolate h-56 overflow-hidden rounded-card border border-border sm:h-80">
              <AreaMapLoader lat={data.approx.lat} lng={data.approx.lng} label={t("label", { place: place || data.title.shown })} />
            </div>
            <figcaption className="grid gap-0.5">
              {place ? <span className="text-body font-medium">{place}</span> : null}
              <span className="text-small text-muted-foreground">{stay ? t("noteBooking") : t("note")}</span>
            </figcaption>
          </figure>
        ) : null}
        {hasNearby ? <NearbyList nearby={data.nearby} /> : null}
      </div>
    </Section>
  );
}
