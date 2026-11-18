import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Container } from "@/components/common/container";
import { CityAbout } from "@/components/city-page/city-about";
import { CityBookingSteps } from "@/components/city-page/city-booking-steps";
import { CityEmpty } from "@/components/city-page/city-empty";
import { CityBreadcrumbJsonLd } from "@/components/city-page/city-json-ld";
import { CityMapSection } from "@/components/city-page/city-map-section";
import { CityPageHeader, type CityCrumb } from "@/components/city-page/city-page-header";
import { CityPostBand } from "@/components/city-page/city-post-band";
import { resolveCityPage } from "@/components/city-page/city-page-data";
import { CitySectionHeading } from "@/components/city-page/city-section-heading";
import { CityShabbatAndMore } from "@/components/city-page/city-shabbat-and-more";
import { cityAbout } from "@/components/city-page/city-text";
import { CityTypeNav } from "@/components/city-page/city-type-nav";
import { ListingGrid } from "@/components/listing/listing-grid";
import {
  CITY_PAGE_TYPE_KEYS,
  cityOverviewPath,
  cityPageFilters,
  cityPagePath,
  cityListingsState,
  cityPageSearchPath,
  isCityPageType,
  isIndexable,
} from "@/lib/city-pages/core";
import { getCityTypeCounts } from "@/lib/city-pages/server";
import { formatNumber } from "@/lib/format";
import { searchListings } from "@/lib/listing/queries";
import { serializeSearchQuery } from "@/lib/listing/search-params";
import { getSearchContext } from "@/lib/search/context";
import { pageMetadata, siteName } from "@/lib/seo";

type Props = { params: Promise<{ locale: string; city: string; type: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, city: slug, type } = await params;
  if (!isCityPageType(type)) notFound();
  const page = await resolveCityPage(rawLocale, slug);
  if (!page) notFound();
  const { locale, city, t, names } = page;
  const counts = await getCityTypeCounts(city.id);
  const key = CITY_PAGE_TYPE_KEYS[type];
  return pageMetadata({
    locale,
    path: cityPagePath(city.slug, type),
    title: t(`title.${key}`, names),
    description: t(`description.${key}`, { ...names, siteName: siteName(locale) }),
    // Brief 10: only with at least 3 real (LIVE, public, non-demo) listings.
    noIndex: !isIndexable(counts[type].realCount),
  });
}

/**
 * A city page (round 3, brief 10): "/he/batumi/short-stays" = "דירות לטווח קצר בבטומי". The
 * breadcrumbs, the h1 and the four types of the city; the public listings of this city and type
 * (the search's cards and where-builder: LIVE listings, demo ones with their label while the demo
 * data is shown) or "עדיין אין כאן מקומות · פרסמו את שלכם"; the city in 2–3 paragraphs; the lazy
 * map; how booking works; this week's Shabbat with a link to the city's Shabbat times; the other
 * types. Indexed only with at least 3 real listings (generateMetadata). Server-rendered; only
 * the cards' small parts and the map (when near) run in the browser. With places to show but
 * fewer than 3 real ones (demo ones, or 1–2 real), the cards stay and a "פרסמו את שלכם" band follows
 * them; the "עדיין אין כאן מקומות" empty state is only for a page with no places at all.
 */
export default async function CityTypePage({ params }: Props) {
  const { locale: rawLocale, city: slug, type } = await params;
  if (!isCityPageType(type)) notFound();
  const page = await resolveCityPage(rawLocale, slug);
  if (!page) notFound();
  const { locale, city, t, names, typeLabels } = page;
  setRequestLocale(locale);

  const filters = cityPageFilters(city.slug, type);
  const ctx = await getSearchContext(locale);
  const [result, counts] = await Promise.all([searchListings(filters, ctx), getCityTypeCounts(city.id)]);
  const key = CITY_PAGE_TYPE_KEYS[type];
  const title = t(`title.${key}`, names);
  const crumbs: CityCrumb[] = [
    { name: t("breadcrumb.home"), path: "/" },
    { name: names.city, path: cityOverviewPath(city.slug) },
    { name: typeLabels[type], path: cityPagePath(city.slug, type) },
  ];
  const total = result.total;
  const state = cityListingsState(total, counts[type].realCount);
  const searchHref = cityPageSearchPath(city.slug, type);

  return (
    <div className="pb-16" data-city-page={type}>
      <CityBreadcrumbJsonLd crumbs={crumbs} locale={locale} />
      <CityPageHeader crumbs={crumbs} crumbsLabel={t("breadcrumb.label")} title={title} lead={t(`lead.${key}`)}>
        <CityTypeNav
          citySlug={city.slug}
          current={type}
          counts={counts}
          labels={typeLabels}
          label={t("nav.label", names)}
          locale={locale}
        />
      </CityPageHeader>

      <Container className="grid grid-cols-1 gap-section pt-6 sm:pt-8">
        {state !== "empty" ? (
          <section aria-labelledby="city-listings-title" className="grid grid-cols-1 gap-3">
            <CitySectionHeading
              id="city-listings-title"
              title={t("count", { count: total, formatted: formatNumber(total, locale) })}
              href={searchHref}
              linkLabel={t("listings.seeAll")}
            />
            <ListingGrid listings={result.items} columns={4} priorityCount={1} label={t("listings.label", names)} />
            {total > result.items.length ? (
              <p className="text-small text-muted-foreground">
                {t("listings.showing", {
                  shown: formatNumber(result.items.length, locale),
                  total: formatNumber(total, locale),
                })}
              </p>
            ) : null}
            {/* Places to show but fewer than 3 real ones (the page is noindex): the "post yours" call. */}
            {state === "invite" ? (
              <CityPostBand text={t(`empty.description.${key}`, names)} action={t("empty.action")} />
            ) : null}
          </section>
        ) : (
          <CityEmpty citySlug={city.slug} type={type} counts={counts} names={names} typeLabels={typeLabels} locale={locale} t={t} />
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

        <CityBookingSteps id="city-booking-title" type={type} t={t} />

        <CityShabbatAndMore
          city={city}
          cityName={names.city}
          names={names}
          current={type}
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
