import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ds/card";
import { SpriteIcon } from "@/components/ds/sprite-icons";
import type { SpriteIconName } from "@/components/ds/sprite-icons.generated";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { formatDate, formatTime } from "@/lib/format";
import type { TripPlaceKind, TripShabbat } from "@/lib/trip/server";

const PLACE_ICONS: Record<TripPlaceKind, SpriteIconName> = {
  synagogue: "book-open",
  chabad: "house",
  kosher: "utensils",
};

/**
 * Shabbat and Yom Tov on the trip page (round 3, brief 7.1) — rendered ONLY when the stay
 * includes a Friday night or a night of a holiday (src/lib/trip/observance.ts): candle-lighting
 * and Havdalah times for the city on those dates, the nearest VERIFIED synagogue, Chabad house and
 * kosher place with walking times, and "המארח לא עונה בשבת" when the host turned it on.
 */
export async function TripShabbat({ locale, shabbat }: { locale: AppLocale; shabbat: TripShabbat }) {
  const t = await getTranslations({ locale, namespace: "trips.shabbat" });
  const zone = shabbat.timezone;
  const day = (date: string) => formatDate(date, locale, { weekday: "long", day: "numeric", month: "long" });
  const time = (value: Date) => formatTime(value, locale, zone);

  return (
    <Card as="section" aria-labelledby="trip-shabbat" className="grid gap-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary-text" aria-hidden>
          <SpriteIcon name="moon-star" className="size-5" />
        </span>
        <div className="grid min-w-0 gap-0.5">
          <h2 id="trip-shabbat" className="text-h2">
            {t("title", { kind: shabbat.kind })}
          </h2>
          <p className="text-caption text-muted-foreground">
            {shabbat.windows.length === 0 ? null : shabbat.cityName ? t("timesFor", { city: shabbat.cityName }) : t("timesHere")}
          </p>
        </div>
      </div>

      {shabbat.windows.length ? (
        <ul className="grid gap-3">
          {shabbat.windows.map((window) => (
            <li key={window.startDate} className="grid gap-2 rounded-input border border-border p-3">
              <p dir="auto" className="text-body font-semibold">
                {window.title}
              </p>
              <dl className="grid gap-1.5 text-small">
                {window.candleLighting.map((candles) => (
                  <div key={candles.date} className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <dt className="text-muted-foreground">
                      {t("candles")} · {day(candles.date)}
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      <bdi>{time(candles.time)}</bdi>
                    </dd>
                  </div>
                ))}
                {window.havdalah ? (
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <dt className="text-muted-foreground">
                      {t("havdalah")} · {day(window.havdalah.date)}
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      <bdi>{time(window.havdalah.time)}</bdi>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-muted-foreground">{t("noTimes")}</p>
      )}

      {shabbat.hostNoReply ? (
        <div className="flex items-start gap-2 rounded-input bg-primary-tint p-3">
          <SpriteIcon name="info" className="mt-0.5 size-5 shrink-0 text-primary-text" />
          <div className="grid gap-0.5">
            <p className="text-body font-semibold">{t("hostNoReply")}</p>
            <p className="text-small text-muted-foreground">{t("hostNoReplyText")}</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-2 border-t border-border pt-4">
        <h3 className="text-h3 font-semibold">{t("nearby")}</h3>
        {shabbat.places.length ? (
          <>
            <ul className="grid gap-2">
              {shabbat.places.map((place) => (
                <li key={place.kind} className="flex items-start gap-3 rounded-input border border-border p-3">
                  <SpriteIcon name={PLACE_ICONS[place.kind]} className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <p className="text-caption text-muted-foreground">{t(`place.${place.kind}`)}</p>
                    <p dir="auto" className="text-body font-medium break-words">
                      {place.name}
                    </p>
                    {place.address ? (
                      <p dir="auto" className="text-caption text-muted-foreground break-words">
                        {place.address}
                      </p>
                    ) : null}
                    <p className="flex flex-wrap items-center gap-x-3 text-small">
                      <span className="font-medium">{t("walk", { count: place.minutes })}</span>
                      {place.directions ? (
                        <a
                          href={place.directions}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 items-center rounded-md font-medium text-primary-text underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          {t("route")}
                        </a>
                      ) : null}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-caption text-muted-foreground">{t("nearbyNote")}</p>
          </>
        ) : (
          <p className="text-small text-muted-foreground">{t("noPlaces")}</p>
        )}
        <div className="flex flex-wrap gap-x-6">
          <Link
            href="/jewish-life#places"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-small font-medium text-primary-text underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <SpriteIcon name="map-pinned" className="size-4.5" />
            {t("placesLink")}
          </Link>
          <Link
            href="/jewish-life#shabbat-times"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-small font-medium text-primary-text underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <SpriteIcon name="calendar-days" className="size-4.5" />
            {t("calendarLink")}
          </Link>
        </div>
      </div>
    </Card>
  );
}
