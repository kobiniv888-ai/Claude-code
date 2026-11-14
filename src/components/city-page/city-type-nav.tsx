import { Chip } from "@/components/ds/chip";
import { CalendarDaysIcon, HandCoinsIcon, HotelIcon, KeyRoundIcon, type SpriteIconComponent } from "@/components/ds/sprite-icons";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { CITY_PAGE_TYPES, cityPagePath, type CityPageType, type CityTypeCounts } from "@/lib/city-pages/core";

/** The same icons as the menu's four deal links. */
export const CITY_TYPE_ICONS: Record<CityPageType, SpriteIconComponent> = {
  "short-stays": CalendarDaysIcon,
  monthly: KeyRoundIcon,
  sale: HandCoinsIcon,
  hotels: HotelIcon,
};

/**
 * The four types of the city as chips (the current one filled, aria-current), each with the
 * number of places visitors will see there. Wraps onto a second line when the names are long
 * (Georgian, Russian) instead of scrolling sideways. Server component.
 */
export function CityTypeNav({
  citySlug,
  current,
  counts,
  labels,
  label,
  locale,
}: {
  citySlug: string;
  current: CityPageType | null;
  counts: CityTypeCounts;
  labels: Record<CityPageType, string>;
  /** Accessible name of the nav ("Places in Batumi by type"). */
  label: string;
  locale: AppLocale;
}) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-2 py-1">
        {CITY_PAGE_TYPES.map((type) => {
          const Icon = CITY_TYPE_ICONS[type];
          const active = type === current;
          return (
            <li key={type} className="min-w-0">
              <Chip asChild active={active} className="max-w-full [&_svg]:text-primary-text">
                <Link href={cityPagePath(citySlug, type)} aria-current={active ? "page" : undefined}>
                  <Icon aria-hidden="true" />
                  <span className="truncate">{labels[type]}</span>
                  <span className="font-normal text-muted-foreground tabular-nums">{formatNumber(counts[type].count, locale)}</span>
                </Link>
              </Chip>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
