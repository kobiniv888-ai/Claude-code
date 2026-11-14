import { chipStyles } from "@/components/ds/chip";
import { EmptyState } from "@/components/ds/empty-state";
import { HousePlusIcon, SearchIcon } from "@/components/ds/sprite-icons";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import {
  CITY_PAGE_TYPES,
  CITY_PAGE_TYPE_KEYS,
  cityPageDeal,
  cityPagePath,
  type CityPageType,
  type CityTypeCounts,
} from "@/lib/city-pages/core";
import { formatNumber } from "@/lib/format";
import { searchPath } from "@/lib/listing/urls";
import type { CityNames, CityPagesT } from "./city-text";

/**
 * No places of this type in the city at all: "עדיין אין כאן מקומות · פרסמו את שלכם" (brief 10),
 * with the one main action (post a listing) and one-tap ways on: the city's other types that have
 * places, and the same type in all of Georgia.
 */
export function CityEmpty({
  citySlug,
  type,
  counts,
  names,
  typeLabels,
  locale,
  t,
}: {
  citySlug: string;
  type: CityPageType;
  counts: CityTypeCounts;
  names: CityNames;
  typeLabels: Record<CityPageType, string>;
  locale: AppLocale;
  t: CityPagesT;
}) {
  const others = CITY_PAGE_TYPES.filter((other) => other !== type && counts[other].count > 0);
  return (
    <div data-city-empty="" className="rounded-card border border-dashed border-border bg-card/60 px-4">
      <EmptyState
        icon={HousePlusIcon}
        title={t("empty.title")}
        description={t(`empty.description.${CITY_PAGE_TYPE_KEYS[type]}`, names)}
        action={{ label: t("empty.action"), href: "/post", icon: HousePlusIcon }}
        quickFixes={[
          ...others.map((other) => (
            <Link key={other} href={cityPagePath(citySlug, other)} className={chipStyles({ size: "sm" })}>
              {typeLabels[other]}
              <span className="font-normal text-muted-foreground tabular-nums">· {formatNumber(counts[other].count, locale)}</span>
            </Link>
          )),
          <Link key="all" href={searchPath({ deal: cityPageDeal(type) })} className={chipStyles({ size: "sm" })}>
            <SearchIcon aria-hidden="true" />
            {t("empty.allGeorgia")}
          </Link>,
        ]}
      />
    </div>
  );
}
