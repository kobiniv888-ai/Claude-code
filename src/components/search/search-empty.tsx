import { RotateCcwIcon, SearchXIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { chipStyles } from "@/components/ds/chip";
import { EmptyState } from "@/components/ds/empty-state";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import type { ListingQueryContext } from "@/lib/listing/queries";
import { clearFilters, hasActiveFilters, type SearchFilters } from "@/lib/listing/search-params";
import { searchPath } from "@/lib/listing/urls";
import { loosenLabel } from "@/lib/search/chip-label";
import type { PopularCity } from "@/lib/search/home";
import { rankLoosenFixes } from "@/lib/search/sheet-queries";

/**
 * No results: a friendly empty state with one-tap fixes built from the active filters ("Remove the
 * 'Kosher' filter · 5", "Wider area", "Clear the dates") — only fixes that bring results, most
 * first — then "Clear all filters" and the popular cities.
 */
export async function SearchEmpty({
  filters,
  cities,
  locale,
  ctx,
  placeNames,
}: {
  filters: SearchFilters;
  cities: PopularCity[];
  locale: AppLocale;
  ctx: ListingQueryContext;
  placeNames: { city: string | null; neighborhood: string | null };
}) {
  const filtered = hasActiveFilters(filters);
  const [t, chipsT, f, fx, fixes] = await Promise.all([
    getTranslations({ locale, namespace: "search.empty" }),
    getTranslations({ locale, namespace: "search.chips" }),
    getTranslations({ locale, namespace: "listingFields" }),
    getTranslations({ locale, namespace: "search.fixes" }),
    filtered ? rankLoosenFixes(filters, ctx, 4) : Promise.resolve([]),
  ]);
  const suggestions = cities.filter((city) => city.slug !== filters.city && city.count > 0).slice(0, 8);
  const fallback = suggestions.length > 0 ? suggestions : cities.filter((city) => city.slug !== filters.city).slice(0, 8);
  const labelCtx = { t: chipsT, f, fx, locale, currency: ctx.currency, placeNames };

  return (
    <div className="rounded-card border border-dashed border-border bg-card/60 px-4">
      <EmptyState
        icon={SearchXIcon}
        tone="coral"
        title={filtered ? t("title") : t("titleNoListings")}
        description={filtered ? (fixes.length > 0 ? t("descriptionFixes") : t("description")) : t("descriptionNoListings")}
        quickFixes={fixes.map((fix) => (
          <Link key={fix.id} href={searchPath(fix.filters)} className={chipStyles({ size: "sm" })}>
            {loosenLabel(fix.fix, filters, labelCtx)}
            <span className="font-normal text-muted-foreground">· {fx("count", { count: fix.count, formatted: formatNumber(fix.count, locale) })}</span>
          </Link>
        ))}
        action={
          filtered
            ? { label: t("clear"), href: searchPath(clearFilters(filters)), icon: RotateCcwIcon }
            : undefined
        }
      />
      {fallback.length > 0 ? (
        <div className="grid gap-3 pb-10 text-center">
          <p className="text-small font-semibold">{t("tryCities")}</p>
          <ul className="flex flex-wrap justify-center gap-2">
            {fallback.map((city) => (
              <li key={city.slug}>
                <Link href={searchPath({ deal: filters.deal, city: city.slug })} className={chipStyles({ size: "sm" })}>
                  {city.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
