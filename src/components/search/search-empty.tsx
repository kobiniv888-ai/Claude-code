import { RotateCcw, SearchX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/common/states";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { clearFilters, hasActiveFilters, type SearchFilters } from "@/lib/listing/search-params";
import { searchPath } from "@/lib/listing/urls";
import type { PopularCity } from "@/lib/search/home";

/** "No homes match" with a clear-filters button and the popular cities to try instead. */
export async function SearchEmpty({
  filters,
  cities,
  locale,
}: {
  filters: SearchFilters;
  cities: PopularCity[];
  locale: AppLocale;
}) {
  const t = await getTranslations({ locale, namespace: "search.empty" });
  const filtered = hasActiveFilters(filters);
  const suggestions = cities.filter((city) => city.slug !== filters.city && city.count > 0).slice(0, 8);
  const fallback = suggestions.length > 0 ? suggestions : cities.filter((city) => city.slug !== filters.city).slice(0, 8);

  return (
    <EmptyState
      icon={SearchX}
      bordered
      title={filtered ? t("title") : t("titleNoListings")}
      description={filtered ? t("description") : t("descriptionNoListings")}
      action={filtered ? { label: t("clear"), href: searchPath(clearFilters(filters)), icon: RotateCcw } : undefined}
    >
      {fallback.length > 0 ? (
        <div className="mt-6 grid gap-3">
          <p className="text-sm font-semibold">{t("tryCities")}</p>
          <ul className="flex flex-wrap justify-center gap-2">
            {fallback.map((city) => (
              <li key={city.slug}>
                <Link
                  href={searchPath({ deal: filters.deal, city: city.slug })}
                  className="inline-flex min-h-9 items-center rounded-full border bg-background px-3.5 py-1.5 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {city.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </EmptyState>
  );
}
