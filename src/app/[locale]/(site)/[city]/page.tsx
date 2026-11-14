import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Container } from "@/components/common/container";
import { CityAbout } from "@/components/city-page/city-about";
import { CityBreadcrumbJsonLd } from "@/components/city-page/city-json-ld";
import { CityMapSection } from "@/components/city-page/city-map-section";
import { CityPageHeader, type CityCrumb } from "@/components/city-page/city-page-header";
import { resolveCityPage } from "@/components/city-page/city-page-data";
import { CitySectionHeading } from "@/components/city-page/city-section-heading";
import { CityShabbatAndMore } from "@/components/city-page/city-shabbat-and-more";
import { cityAbout } from "@/components/city-page/city-text";
import { CityTypeCards } from "@/components/city-page/city-type-cards";
import { EmptyState } from "@/components/ds/empty-state";
import { HousePlusIcon } from "@/components/ds/sprite-icons";
import { ListingGrid } from "@/components/listing/listing-grid";
import { CITY_PAGE_TYPES, cityOverviewPath, isOverviewIndexable } from "@/lib/city-pages/core";
import { getCityTypeCounts } from "@/lib/city-pages/server";
import { searchListings } from "@/lib/listing/queries";
import { emptyFilters, serializeSearchQuery, type SearchFilters } from "@/lib/listing/search-params";
import { searchPath } from "@/lib/listing/urls";
import { getSearchContext } from "@/lib/search/context";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string; city: string }> };

/** How many of the newest places the overview shows (all types). */
const RECENT_COUNT = 8;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, city: slug } = await params;
  const page = await resolveCityPage(rawLocale, slug);
  if (!page) notFound();
  const { locale, city, t, names } = page;
  const counts = await getCityTypeCounts(city.id);
  return pageMetadata({
    locale,
    path: cityOverviewPath(city.slug),
    title: t("overview.title", names),
    description: t("overview.description", names),
    // Indexed when any of the city's four pages is (at least 3 real listings of one type).
    noIndex: !isOverviewIndexable(counts),
  });
}

/**
 * A city's overview (round 3, brief 10): "/he/batumi". The four types with their counts (each
 * opens its city page), the newest places of any type, the city in 2–3 paragraphs, the lazy map
 * and this week's Shabbat. Every other one-segment address under a language that is not a static
 * page (/search, /about, /rent…) or an active city answers 404, as before.
 */
export default async function CityOverviewPage({ params }: Props) {
  const { locale: rawLocale, city: slug } = await params;
  const page = await resolveCityPage(rawLocale, slug);
  if (!page) notFound();
  const { locale, city, t, names, typeLabels } = page;
  setRequestLocale(locale);

  const filters: SearchFilters = { ...emptyFilters(), city: city.slug };
  const ctx = await getSearchContext(locale);
  const [recent, counts] = await Promise.all([
    searchListings({ ...filters, sort: "newest" }, { ...ctx, pageSize: RECENT_COUNT }),
    getCityTypeCounts(city.id),
  ]);
  const total = CITY_PAGE_TYPES.reduce((sum, type) => sum + counts[type].count, 0);
  const crumbs: CityCrumb[] = [
    { name: t("breadcrumb.home"), path: "/" },
    { name: names.city, path: cityOverviewPath(city.slug) },
  ];

  return (
    <div className="pb-16" data-city-page="overview">
      <CityBreadcrumbJsonLd crumbs={crumbs} locale={locale} />
      <CityPageHeader crumbs={crumbs} crumbsLabel={t("breadcrumb.label")} title={t("overview.title", names)} lead={t("overview.lead", names)} />

      <Container className="grid grid-cols-1 gap-section pt-6 sm:pt-8">
        <CityTypeCards id="city-types-title" citySlug={city.slug} counts={counts} labels={typeLabels} locale={locale} t={t} />

        {recent.items.length > 0 ? (
          <section aria-labelledby="city-recent-title" className="grid grid-cols-1 gap-3">
            <CitySectionHeading
              id="city-recent-title"
              title={t("overview.recentTitle", names)}
              href={searchPath({ city: city.slug })}
              linkLabel={t("listings.seeAll")}
            />
            <ListingGrid listings={recent.items} columns={4} priorityCount={1} label={t("listings.label", names)} />
          </section>
        ) : (
          <div data-city-empty="" className="rounded-card border border-dashed border-border bg-card/60 px-4">
            <EmptyState
              icon={HousePlusIcon}
              title={t("empty.title")}
              description={t("empty.descriptionAny", names)}
              action={{ label: t("empty.action"), href: "/post", icon: HousePlusIcon }}
            />
          </div>
        )}

        <CityAbout id="city-about-title" title={t("about.title", names)} paragraphs={cityAbout(t, city.slug)} citySlug={city.slug} />

        {total > 0 ? (
          <CityMapSection
            id="city-map-title"
            title={t("map.title")}
            note={t("map.note")}
            query={serializeSearchQuery(filters)}
            citySlug={city.slug}
            labels={{ show: t("map.show"), loading: t("map.loading"), error: t("map.error"), retry: t("map.retry") }}
          />
        ) : null}

        <CityShabbatAndMore
          city={city}
          cityName={names.city}
          names={names}
          current={null}
          counts={counts}
          typeLabels={typeLabels}
          locale={locale}
          t={t}
          ids={{ more: "city-more-title" }}
        />
      </Container>
    </div>
  );
}
