import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CategoryChips } from "@/components/home/category-chips";
import { Destinations } from "@/components/home/destinations";
import { HomeHero } from "@/components/home/home-hero";
import { HomeJsonLd } from "@/components/home/home-json-ld";
import { HomeSearchCard, type HomeSearchLabels } from "@/components/home/home-search-card";
import { HowItWorks } from "@/components/home/how-it-works";
import { JewishLifeCard } from "@/components/home/jewish-life-card";
import { ListCta } from "@/components/home/list-cta";
import { RecommendedListings } from "@/components/home/recommended-listings";
import { RecentlyViewed } from "@/components/listing/recently-viewed";
import type { AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { getHomeCities, type HomeCity } from "@/lib/home/cities";
import { HOME_RECOMMENDED_CARDS, mergeRecommended } from "@/lib/home/recommended";
import { HOME_ROOM_OPTIONS } from "@/lib/home/search-card";
import { getFeaturedListings, getNewestListings } from "@/lib/listing/queries";
import type { ListingCardData } from "@/lib/listing/types";
import { getSearchContext } from "@/lib/search/context";
import { getHolidayMarks } from "@/lib/search/home";
import { MAX_GUESTS, SEARCH_BAR_DEALS } from "@/lib/search/search-bar";
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
    roomCounts: HOME_ROOM_OPTIONS.filter((n) => n > 0).map((count) => t("roomCount", { count })),
    fewerRooms: t("fewerRooms"),
    moreRooms: t("moreRooms"),
    budget: t("budget"),
    budgetMonthly: t("budgetMonthly"),
    budgetPlaceholder: t("budgetPlaceholder"),
    submit: t("submit"),
  };
}

/** The Container's width and gutters, on the row itself. */
const RECENT_CONTAINER = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8";

/**
 * Below-the-fold sections the browser may skip styling and laying out until they come near the
 * screen (content-visibility); the size is a placeholder until the real height is known. Not on
 * "recently viewed" (often empty) or the short rows.
 */
const DEFERRED_SIZE: Partial<Record<HomeSectionKey, string>> = {
  featured: "[content-visibility:auto] [contain-intrinsic-size:auto_24rem]",
  cities: "[content-visibility:auto] [contain-intrinsic-size:auto_12rem]",
};

/**
 * The home page, short and clear (brief round 2, 5.2): the purple band with the title, the search
 * card overlapping it and the promise line, then the sections admins can switch off or reorder in
 * Admin → Content → Home (settings.homeSections, default order): category chips, "Recommended
 * places" (promoted, then newest), "Recently viewed" (only with history), "Where to?", the 3-step
 * "How it works", the slim Jewish life card and the host card. The footer comes from the layout.
 * Server components only; the search card is the one client island above the fold.
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
  const wantsListings = enabled.has("featured");

  const [cities, holidays, promoted, newest, labels] = await Promise.all([
    safely("cities", () => getHomeCities(locale), noCities),
    getHolidayMarks(locale),
    wantsListings ? safely("featured listings", () => getFeaturedListings(ctx, HOME_RECOMMENDED_CARDS), none) : none,
    wantsListings ? safely("newest listings", () => getNewestListings(ctx, HOME_RECOMMENDED_CARDS), none) : none,
    searchLabels(locale),
  ]);

  const sections: Record<HomeSectionKey, () => ReactNode> = {
    categories: () => <CategoryChips locale={locale} />,
    featured: () => <RecommendedListings locale={locale} listings={mergeRecommended(promoted, newest)} />,
    // Renders nothing without history, so its wrapper stays :empty and takes no gap.
    recentlyViewed: () => <RecentlyViewed className={RECENT_CONTAINER} />,
    cities: () => <Destinations locale={locale} cities={cities} />,
    howItWorks: () => <HowItWorks locale={locale} />,
    jewishLife: () => <JewishLifeCard locale={locale} />,
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
      {/* 32px between sections on phones (--section-space); empty sections (no history, no cities)
          render nothing or an empty wrapper that the gap skips. */}
      <div className="mt-6 flex flex-col gap-section pb-section">
        {settings.homeSections
          .filter((section) => section.enabled)
          .map((section) => (
            <div key={section.key} data-home-section={section.key} className={`empty:hidden ${DEFERRED_SIZE[section.key] ?? ""}`}>
              {sections[section.key]()}
            </div>
          ))}
      </div>
    </>
  );
}
