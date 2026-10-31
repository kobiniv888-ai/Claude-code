import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/common/container";
import { SafetyTip } from "@/components/common/safety-tip";
import { FeaturedListings, NewestListings } from "@/components/home/listing-rows";
import { HomeHero } from "@/components/home/hero";
import { HomeJsonLd } from "@/components/home/home-json-ld";
import { HowItWorks } from "@/components/home/how-it-works";
import { ListCta } from "@/components/home/list-cta";
import { PopularCities } from "@/components/home/popular-cities";
import { QuickCategories } from "@/components/home/quick-categories";
import { WhyUs } from "@/components/home/why-us";
import { RecentlyViewed } from "@/components/listing/recently-viewed";
import { ShabbatTimesStrip } from "@/components/shabbat";
import type { AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { getFeaturedListings, getNewestListings } from "@/lib/listing/queries";
import type { ListingCardData } from "@/lib/listing/types";
import { getSearchContext } from "@/lib/search/context";
import { getHolidayMarks, getPopularCities } from "@/lib/search/home";
import { pageMetadata, siteName } from "@/lib/seo";
import { getSettings, type HomeSectionKey } from "@/lib/settings";

type Props = { params: Promise<{ locale: string }> };

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

export default async function HomePage({ params }: Props) {
  const { locale: rawLocale } = await params;
  if (!isAppLocale(rawLocale)) notFound();
  const locale: AppLocale = rawLocale;
  setRequestLocale(locale);

  const settings = await getSettings();
  const enabled = new Set(settings.homeSections.filter((s) => s.enabled).map((s) => s.key));
  const ctx = await getSearchContext(locale);
  const none: ListingCardData[] = [];

  const [cities, holidays, featured, newest] = await Promise.all([
    safely("cities", () => getPopularCities(locale), []),
    getHolidayMarks(locale),
    enabled.has("featured") ? safely("featured listings", () => getFeaturedListings(ctx, 8), none) : none,
    enabled.has("newest") ? safely("newest listings", () => getNewestListings(ctx, 8), none) : none,
  ]);

  const sections: Record<HomeSectionKey, () => ReactNode> = {
    categories: () => <QuickCategories locale={locale} />,
    cities: () => <PopularCities locale={locale} cities={cities} />,
    featured: () => <FeaturedListings locale={locale} listings={featured} />,
    newest: () => <NewestListings locale={locale} listings={newest} />,
    recentlyViewed: () => (
      <Container>
        <RecentlyViewed className="py-10 sm:py-14" />
      </Container>
    ),
    whyUs: () => <WhyUs locale={locale} />,
    howItWorks: () => <HowItWorks locale={locale} />,
    shabbatTimes: () => (
      <Container className="py-10 sm:py-14">
        <ShabbatTimesStrip locale={locale} />
      </Container>
    ),
    safetyStrip: () => (
      <Container className="py-6">
        <SafetyTip />
      </Container>
    ),
    listCta: () => <ListCta locale={locale} />,
  };

  return (
    <>
      <HomeJsonLd locale={locale} />
      <HomeHero locale={locale} cities={cities} holidays={holidays} />
      {settings.homeSections
        .filter((section) => section.enabled)
        .map((section) => (
          <div key={section.key} data-home-section={section.key}>
            {sections[section.key]()}
          </div>
        ))}
    </>
  );
}
