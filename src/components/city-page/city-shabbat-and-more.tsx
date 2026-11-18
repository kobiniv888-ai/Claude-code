import { spriteIcon, MoonStarIcon } from "@/components/ds/sprite-icons";
import { ShabbatTimesCard } from "@/components/shabbat/shabbat-times-card";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import {
  CITY_PAGE_TYPES,
  cityOverviewPath,
  cityPagePath,
  type CityPageType,
  type CityTypeCounts,
} from "@/lib/city-pages/core";
import { formatNumber } from "@/lib/format";
import { jewishLifeHref } from "@/lib/jewish-life/urls";
import type { CityRecord } from "@/lib/places";
import { cn } from "@/lib/utils";
import { CITY_TYPE_ICONS } from "./city-type-nav";
import type { CityNames, CityPagesT } from "./city-text";

const ArrowIcon = spriteIcon("arrow-right");
const MapPinIcon = spriteIcon("map-pin");

const linkRow =
  "group/row flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 text-body text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * The end of a city page: this week's Shabbat in the city (candle lighting, Havdalah) with a link
 * to the city's Shabbat times and the Jewish calendar on /jewish-life, and "עוד בבטומי": the
 * city's other types (with their counts) and its overview. Server component.
 */
export function CityShabbatAndMore({
  city,
  cityName,
  names,
  current,
  counts,
  typeLabels,
  locale,
  t,
  ids,
}: {
  city: Pick<CityRecord, "slug" | "lat" | "lng" | "timezone">;
  cityName: string;
  names: CityNames;
  /** The page's own type (left out of "more"); null on the overview, which lists every type itself (no "more"). */
  current: CityPageType | null;
  counts: CityTypeCounts;
  typeLabels: Record<CityPageType, string>;
  locale: AppLocale;
  t: CityPagesT;
  ids: { more: string };
}) {
  const others = CITY_PAGE_TYPES.filter((type) => type !== current);
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-6 lg:items-start lg:gap-8",
        current ? "lg:grid-cols-2" : "lg:max-w-[calc(50%-1rem)]",
      )}
    >
      <div className="grid min-w-0 grid-cols-1 gap-3">
        <ShabbatTimesCard
          city={{
            name: cityName,
            lat: city.lat,
            lng: city.lng,
            timezone: city.timezone,
          }}
          variant="compact"
          headingLevel="h2"
          showMoreLink={false}
          locale={locale}
        />
        <Link
          href={jewishLifeHref({}, { city: city.slug }, "shabbat-times")}
          className={linkRow}
        >
          <MoonStarIcon
            className="size-5 shrink-0 text-primary-text"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 font-medium">
            {t("shabbat.link", names)}
          </span>
          <ArrowIcon
            className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100"
            aria-hidden="true"
          />
        </Link>
      </div>

      {current ? (
        <section
          aria-labelledby={ids.more}
          className="grid gap-2 rounded-card border border-border bg-card p-3 sm:p-4"
        >
          <h2
            id={ids.more}
            className="px-3 pt-1 text-h2 text-balance text-foreground"
          >
            {t("more.title", names)}
          </h2>
          <ul className="grid">
            {others.map((type) => {
              const Icon = CITY_TYPE_ICONS[type];
              return (
                <li key={type}>
                  <Link
                    href={cityPagePath(city.slug, type)}
                    className={linkRow}
                  >
                    <Icon
                      className="size-5 shrink-0 text-primary-text"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">{typeLabels[type]}</span>
                    <span className="text-small text-muted-foreground tabular-nums">
                      {formatNumber(counts[type].count, locale)}
                    </span>
                    <ArrowIcon
                      className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              );
            })}
            <li>
              <Link href={cityOverviewPath(city.slug)} className={linkRow}>
                <MapPinIcon
                  className="size-5 shrink-0 text-primary-text"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  {t("more.overview", names)}
                </span>
                <ArrowIcon
                  className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100"
                  aria-hidden="true"
                />
              </Link>
            </li>
          </ul>
        </section>
      ) : null}
    </div>
  );
}
