import { spriteIcon } from "@/components/ds/sprite-icons";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { CITY_PAGE_TYPES, cityPagePath, type CityPageType, type CityTypeCounts } from "@/lib/city-pages/core";
import { formatNumber } from "@/lib/format";
import { CITY_TYPE_ICONS } from "./city-type-nav";
import type { CityPagesT } from "./city-text";

const ArrowIcon = spriteIcon("arrow-right");

/**
 * The city overview's four types as cards (two per row on phones, four on desktop): the icon, the
 * type and how many places visitors will see there ("עדיין אין" for none). Each card is one link.
 */
export function CityTypeCards({
  id,
  citySlug,
  counts,
  labels,
  locale,
  t,
}: {
  id: string;
  citySlug: string;
  counts: CityTypeCounts;
  labels: Record<CityPageType, string>;
  locale: AppLocale;
  t: CityPagesT;
}) {
  return (
    <section aria-labelledby={id} className="grid grid-cols-1 gap-3">
      <h2 id={id} className="sr-only">
        {t("overview.typesTitle")}
      </h2>
      <ul className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 lg:grid-cols-4">
        {CITY_PAGE_TYPES.map((type) => {
          const Icon = CITY_TYPE_ICONS[type];
          const count = counts[type].count;
          return (
            <li key={type} className="min-w-0">
              <Link
                href={cityPagePath(citySlug, type)}
                className="group/type flex h-full min-h-20 items-center gap-3 rounded-card border border-border bg-card p-4 outline-none transition-colors hover:border-border-strong focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary-text ring-1 ring-primary-tint-border"
                >
                  <Icon className="size-5" />
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-body font-semibold text-pretty text-foreground">{labels[type]}</span>
                  <span className="text-small text-muted-foreground">
                    {count > 0 ? t("count", { count, formatted: formatNumber(count, locale) }) : t("overview.none")}
                  </span>
                </span>
                <ArrowIcon className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
