import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/common/container";
import { Destinations } from "@/components/home/destinations";
import { HomeHero } from "@/components/home/hero";
import { HomeJsonLd } from "@/components/home/home-json-ld";
import { HomeSearchCard, type HomeSearchLabels } from "@/components/home/home-search-card";
import { HowItWorks } from "@/components/home/how-it-works";
import { JewishLifeBand } from "@/components/home/jewish-life-band";
import { ListCta } from "@/components/home/list-cta";
import { FeaturedListings, NewestListings } from "@/components/home/listing-rows";
import { PledgeSection } from "@/components/home/pledge-section";
import { QuickCategories } from "@/components/home/quick-categories";
import { SafetyNote } from "@/components/home/safety-note";
import { TrustStrip } from "@/components/home/trust-strip";
import { RecentlyViewed } from "@/components/listing/recently-viewed";
import type { AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { getHomeCities, type HomeCity } from "@/lib/home/cities";
import { getFeaturedListings, getNewestListings } from "@/lib/listing/queries";
import type { ListingCardData } from "@/lib/listing/types";
import { getSearchContext } from "@/lib/search/context";
import { getHolidayMarks } from "@/lib/search/home";
import { MAX_GUESTS, SEARCH_BAR_DEALS } from "@/lib/search/search-bar";
import { pageMetadata, siteName } from "@/lib/seo";
import { getSettings, type HomeSectionKey } from "@/lib/settings";

type Props = { params: Promise<{ locale: string }> };

/**
 * Cards in the "New homes" and "Featured" carousels: one row on desktop, a swipe on phones. Each
 * card is ~18 KB of HTML (photos, badges, icons), so more would slow the first load; "See all"
 * opens the search.
 */
const HOME_ROW_CARDS = 4;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "home.meta" });
  const name = siteName(locale);
  const metadata = pageMetadata({ locale, path: "/", title: t("title"), description: t("description", { siteName: name }) });
  return { ...metadata, title: { absolute: `${name} · ${t("title")}` } };
}

async function safely<T>(label: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch (error) {
    console.error(`[home] could not load ${label}:`, error);
    return fallback;
  }
}

async function searchLabels(locale: AppLocale): Promise<HomeSearchLabels> {
  const t = await getTranslations({ locale, namespace: "home.search" });
  return {
    label: t("label"),
    dealLabel: t("dealLabel"),
    deals: Object.fromEntries(SEARCH_BAR_DEALS.map((deal) => [deal, t(`deals.${deal}`)])) as HomeSearchLabels["deals"],
    where: t("where"),
    when: t("when"),
    addDates: t("addDates"),
    datesTitle: t("datesTitle"),
    datesDone: t("datesDone"),
    clearDates: t("clearDates"),
    guests: t("guests"),
    guestsAny: t("guestsAny"),
    guestCounts: Array.from({ length: MAX_GUESTS }, (_, i) => t("guestCount", { count: i + 1 })),
    fewerGuests: t("fewerGuests"),
    moreGuests: t("moreGuests"),
    rooms: t("rooms"),
    roomsAny: t("roomsAny"),
    budget: t("budget"),
    budgetMonthly: t("budgetMonthly"),
    budgetPlaceholder: t("budgetPlaceholder"),
    submit: t("submit"),
  };
}

/**
 * The home page (brief §5.1): the promise and the search card over a photo slideshow, the trust
 * strip, then the sections admins toggle and order in Admin → Content → Home
 * (settings.homeSections). The redesign kept the stored keys:
 *   cities → "Where to?" · categories → photo tiles · featured / newest → card carousels ·
 *   recentlyViewed · shabbatTimes → the "Jewish life in Georgia" band (Shabbat countdown) ·
 *   whyUs → "The Bayit pledge" · howItWorks · safetyStrip → the small safety tip · listCta.
 */
export default async function HomePage({ params }: Props) {
  const { locale: rawLocale } = await params;
  if (!isAppLocale(rawLocale)) notFound();
  const locale: AppLocale = rawLocale;
  setRequestLocale(locale);

  const settings = await getSettings();
  const enabled = new Set(settings.homeSections.filter((s) => s.enabled).map((s) => s.key));
  const ctx = await getSearchContext(locale);
  const none: ListingCardData[] = [];
  const noCities: HomeCity[] = [];

  const [cities, holidays, featured, newest, labels] = await Promise.all([
    safely("cities", () => getHomeCities(locale), noCities),
    getHolidayMarks(locale),
    enabled.has("featured") ? safely("featured listings", () => getFeaturedListings(ctx, HOME_ROW_CARDS), none) : none,
    enabled.has("newest") ? safely("newest listings", () => getNewestListings(ctx, HOME_ROW_CARDS), none) : none,
    searchLabels(locale),
  ]);

  const sections: Record<HomeSectionKey, () => ReactNode> = {
    cities: () => <Destinations locale={locale} cities={cities} />,
    categories: () => <QuickCategories locale={locale} />,
    featured: () => <FeaturedListings locale={locale} listings={featured} />,
    newest: () => <NewestListings locale={locale} listings={newest} />,
    recentlyViewed: () => (
      <Container>
        <RecentlyViewed className="py-6 sm:py-10" />
      </Container>
    ),
    shabbatTimes: () => <JewishLifeBand locale={locale} />,
    whyUs: () => <PledgeSection locale={locale} />,
    howItWorks: () => <HowItWorks locale={locale} />,
    safetyStrip: () => <SafetyNote locale={locale} />,
    listCta: () => <ListCta locale={locale} />,
  };

  return (
    <>
      <HomeJsonLd locale={locale} />
      <HomeHero
        locale={locale}
        searchCard={
          <HomeSearchCard labels={labels} popular={cities.map(({ slug, name }) => ({ slug, name }))} holidays={holidays} />
        }
      />
      <TrustStrip locale={locale} />
      <div className="pb-6">
        {settings.homeSections
          .filter((section) => section.enabled)
          .map((section) => (
            // content-visibility: the browser skips style and layout of the sections below the
            // fold until they come near the screen, so the hero (the LCP photo) paints sooner.
            // The size is a placeholder; `auto` remembers the real height once rendered. Not on
            // "recently viewed", which is often empty (a placeholder would leave a gap).
            <div
              key={section.key}
              data-home-section={section.key}
              className={section.key === "recentlyViewed" ? undefined : "[content-visibility:auto] [contain-intrinsic-size:auto_32rem]"}
            >
              {sections[section.key]()}
            </div>
          ))}
      </div>
    </>
  );
}
