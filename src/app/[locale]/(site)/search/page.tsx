import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { preferredCardTags, stayNights } from "@/components/listing/card-tags";
import { HolidaysInRange } from "@/components/shabbat";
import { ActiveFilterChips } from "@/components/search/active-filter-chips";
import { ResultsPagination } from "@/components/search/results-pagination";
import { SearchBarIsland } from "@/components/search/search-bar-island";
import { SearchProvider } from "@/components/search/search-context";
import { SearchEmpty } from "@/components/search/search-empty";
import { ResultCards } from "@/components/search/result-cards";
import { SearchResults } from "@/components/search/search-results";
import { SearchSheets } from "@/components/search/search-sheets";
import { SearchTopBar } from "@/components/search/search-top-bar";
import { Container } from "@/components/common/container";
import { LastSearchRecorder } from "@/components/home/last-search-recorder";
import type { AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { formatNumber } from "@/lib/format";
import { lastSearchDraft } from "@/lib/home/last-search-draft";
import { getMapPoints, searchListings } from "@/lib/listing/queries";
import { parseSearchParams, serializeSearchParams, serializeSearchQuery } from "@/lib/listing/search-params";
import { getSearchContext } from "@/lib/search/context";
import { getHolidayMarks, getPlaceNames, getPopularCities } from "@/lib/search/home";
import { searchBarStateFrom } from "@/lib/search/search-bar";
import { dealTitleKey, searchIndexing, searchNoIndex } from "@/lib/search/seo";
import { defaultSearchName, isSearchSaved } from "@/lib/saved-searches/page-state";
import { listCityPages } from "@/lib/city-pages";
import { pageMetadata } from "@/lib/seo";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function placeLabel(names: { city: string | null; neighborhood: string | null }): string | null {
  if (names.neighborhood && names.city) return `${names.neighborhood}, ${names.city}`;
  return names.city;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) return {};
  const filters = parseSearchParams(await searchParams);
  const [t, names, cityPages] = await Promise.all([
    getTranslations({ locale, namespace: "search.meta" }),
    getPlaceNames(filters.city, filters.neighborhood, locale),
    // Round 3, brief 10: index a results page only with 3 real listings (none loaded: noindex).
    searchNoIndex(filters) ? Promise.resolve([]) : listCityPages().catch(() => []),
  ]);
  const key = dealTitleKey(filters.deal);
  const place = placeLabel(names);
  const base = place ? t(`titleIn.${key}`, { place }) : t(`title.${key}`);
  const title = filters.page > 1 ? t("withPage", { title: base, page: formatNumber(filters.page, locale) }) : base;
  const { noIndex, canonicalPath } = searchIndexing(filters, cityPages);
  return pageMetadata({
    locale,
    path: canonicalPath,
    title,
    // Each deal's landing has its own description (round 3, brief 10: unique per page).
    description: place ? t("descriptionIn", { place }) : key === "any" ? t("description") : t(`dealDescription.${key}`),
    noIndex,
  });
}

export default async function SearchPage({ params, searchParams }: Props) {
  const { locale: rawLocale } = await params;
  if (!isAppLocale(rawLocale)) notFound();
  const locale: AppLocale = rawLocale;
  setRequestLocale(locale);

  const filters = parseSearchParams(await searchParams);
  const ctx = await getSearchContext(locale);
  const isMap = filters.view === "map";
  const [result, points, names, holidays, cities, t, searchSaved] = await Promise.all([
    searchListings(filters, ctx),
    isMap ? getMapPoints(filters, ctx) : Promise.resolve(null),
    getPlaceNames(filters.city, filters.neighborhood, locale),
    getHolidayMarks(locale),
    getPopularCities(locale),
    getTranslations({ locale, namespace: "search.results" }),
    // "שמירת חיפוש": is this search saved already? Alongside the rest, not after it (speed-3).
    ctx.userId ? isSearchSaved(ctx.userId, filters, ctx.currency).catch(() => false) : Promise.resolve(false),
  ]);

  const place = placeLabel(names);
  const count = { count: result.total, formatted: formatNumber(result.total, locale) };
  const barKey = [filters.deal, filters.city, filters.neighborhood, filters.q, filters.checkIn, filters.checkOut, filters.guests].join("|");
  const fitKey = serializeSearchQuery({ ...filters, bounds: null, page: 1, sort: "recommended", view: "grid" });
  const popular = cities.map(({ slug, name }) => ({ slug, name }));
  // "המשך מאיפה שעצרתם" on the home page (round 3, brief 4): this search, on this device.
  const lastSearch = lastSearchDraft(filters, place, locale);
  // "שמירת חיפוש" (round 3, brief 7.4): the prefilled name (no database), and whether this search is saved already.
  const saveSearch = { defaultName: await defaultSearchName(filters, place, locale), saved: searchSaved };

  return (
    <SearchProvider filters={filters} total={result.total} holidays={holidays}>
      {lastSearch ? <LastSearchRecorder draft={lastSearch} /> : null}
      <SearchSheets popular={popular} placeNames={names}>
        {/* Tablets and desktops: the full search bar (it scrolls away; the chip row below stays). */}
        <Container size="wide" className="hidden pt-4 pb-1 md:block" data-search-bar="">
          <SearchBarIsland
            key={barKey}
            variant="compact"
            initial={searchBarStateFrom(filters, names)}
            baseFilters={filters}
            popular={popular}
            holidays={holidays}
            className="mx-auto max-w-3xl"
          />
        </Container>
        <SearchTopBar placeNames={names} />
        <SearchResults
          items={result.items}
          mapPoints={points}
          fitKey={fitKey}
          cards={
            !isMap && result.items.length > 0 ? (
              <ResultCards
                items={result.items}
                variant={filters.view === "list" ? "list" : "grid"}
                nights={stayNights(filters.checkIn, filters.checkOut)}
                preferTags={preferredCardTags(filters)}
              />
            ) : null
          }
          header={
            <h1 className="truncate text-body font-semibold text-foreground" aria-live="polite">
              {place ? (
                <>
                  {/* Phones: "24 נכסים" (the place is in the summary pill above); screen readers get it all. */}
                  <span aria-hidden="true" className="md:hidden">
                    {t("count", count)}
                  </span>
                  <span className="max-md:sr-only">{t("countIn", { ...count, place })}</span>
                </>
              ) : (
                t("count", count)
              )}
            </h1>
          }
          chips={<ActiveFilterChips placeNames={names} className="hidden lg:flex" />}
          notice={
            filters.checkIn ? (
              <HolidaysInRange
                start={filters.checkIn}
                end={filters.checkOut ?? filters.checkIn}
                searchParams={serializeSearchParams(filters)}
                locale={locale}
                maxItems={4}
              />
            ) : null
          }
          pagination={<ResultsPagination filters={filters} page={result.page} pageCount={result.pageCount} locale={locale} />}
          empty={<SearchEmpty filters={filters} cities={cities} locale={locale} ctx={ctx} placeNames={names} />}
          saveSearch={saveSearch}
        />
      </SearchSheets>
    </SearchProvider>
  );
}
