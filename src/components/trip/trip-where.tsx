import { getTranslations } from "next-intl/server";
import { NavigationIcon } from "lucide-react";
import { buttonStyles } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { SpriteIcon } from "@/components/ds/sprite-icons";
import type { AppLocale } from "@/config/site";
import type { Directions } from "@/lib/booking/reveal";
import type { MapPoint } from "@/lib/trip/map-links";
import { TripMap } from "./trip-map";

/**
 * "כתובת" on the trip page (round 3, brief 7.1): the exact address — only for this booking's
 * guest, as before — a map of the exact point (loaded only when it scrolls near, ./trip-map.tsx),
 * and "פתיחה ב-Google Maps" / "פתיחה ב-Waze" with the coordinates.
 */
export async function TripWhere({
  locale,
  address,
  directions,
  point,
}: {
  locale: AppLocale;
  address: string | null;
  directions: Directions | null;
  point: MapPoint | null;
}) {
  const [t, tb] = await Promise.all([getTranslations({ locale, namespace: "trips.where" }), getTranslations({ locale, namespace: "booking.trip" })]);
  return (
    <Card as="section" aria-labelledby="trip-where" className="grid gap-3">
      <h2 id="trip-where" className="text-h2">
        {tb("address")}
      </h2>
      {address ? (
        <p dir="auto" className="flex items-start gap-2 text-body font-medium">
          <SpriteIcon name="map-pin" className="mt-1 size-5 shrink-0 text-primary-text" />
          <span className="min-w-0 break-words">{address}</span>
        </p>
      ) : (
        <p className="text-small text-muted-foreground">{tb("noAddress")}</p>
      )}
      {point ? <TripMap lat={point.lat} lng={point.lng} label={t("mapLabel")} /> : null}
      {directions ? (
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          <a href={directions.google} target="_blank" rel="noopener noreferrer" className={buttonStyles({ variant: "secondary", size: "md" })}>
            <NavigationIcon aria-hidden />
            {t("openGoogleMaps")}
          </a>
          <a href={directions.waze} target="_blank" rel="noopener noreferrer" className={buttonStyles({ variant: "secondary", size: "md" })}>
            <NavigationIcon aria-hidden />
            {t("openWaze")}
          </a>
        </div>
      ) : null}
    </Card>
  );
}
