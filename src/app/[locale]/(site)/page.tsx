import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CategoryChips } from "@/components/home/category-chips";
import { ContinueSection } from "@/components/home/continue-section";
import { Destinations } from "@/components/home/destinations";
import { HomeHero } from "@/components/home/home-hero";
import { HomeJsonLd } from "@/components/home/home-json-ld";
import { HomeSearchCard, type HomeSearchLabels } from "@/components/home/home-search-card";
import { HomeTabProvider } from "@/components/home/home-tab";
import { HowItWorks } from "@/components/home/how-it-works";
import { ListCta } from "@/components/home/list-cta";
import { RecommendedListings } from "@/components/home/recommended-listings";
import type { AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { getCurrentUser } from "@/lib/auth/session";
import { getHomeCities, type HomeCity } from "@/lib/home/cities";
import { HOME_DEFAULT_DEAL } from "@/lib/home/recommended";
import { getHomeRecommended } from "@/lib/home/recommended-server";
import { HOME_ROOM_OPTIONS } from "@/lib/home/search-card";
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

/**
 * Below-the-fold sections the browser may skip styling and laying out until they come near the
 * screen (content-visibility); the size is a placeholder until the real height is known. Not on
 * the short rows.
 */
const DEFERRED_SIZE: Partial<Record<HomeSectionKey, string>> = {
  featured: "[content-visibility:auto] [contain-intrinsic-size:auto_24rem]",
  cities: "[content-visibility:auto] [contain-intrinsic-size:auto_12rem]",
};

/**
 * The home page, light for a first visit (round 3, brief 4, replacing round 2's 5.2): the purple
 * band with the title, the search card overlapping it and the promise line; for returning visitors
 * "המשך מאיפה שעצרתם" right under it (last search, saved places, recently viewed: nothing at all
 * on a first visit); then the sections admins can switch off or reorder in Admin → Content → Home
 * (settings.homeSections, default order): category chips, "Recommended places" (at most 6 of the
 * selected tab's type), "Where to?", the 3-step "How it works" and the host card. The footer comes
 * from the layout. The Jewish life card left the home page (it stays in the menu, the footer and
 * the "כשר ושבת" chip). The search card and the recommended row share the selected tab.
 */
export default async function HomePage({ params }: Props) {
  const { locale: rawLocale } = await params;
  if (!isAppLocale(rawLocale)) notFound();
  const locale: AppLocale = rawLocale;
  setRequestLocale(locale);

  const settings = await getSettings();
  const enabled = new Set(settings.homeSections.filter((s) => s.enabled).map((s) => s.key));
  const [ctx, user] = await Promise.all([getSearchContext(locale), getCurrentUser().catch(() => null)]);
  // The account's history only for a full sign-in (past 2-step login where the account has it).
  const historyUserId = user?.twoFactorVerified ? user.id : null;
  const none: ListingCardData[] = [];
  const noCities: HomeCity[] = [];
  const wantsListings = enabled.has("featured");

  const [cities, holidays, recommended, labels] = await Promise.all([
    safely("cities", () => getHomeCities(locale), noCities),
    getHolidayMarks(locale),
    wantsListings ? safely("recommended listings", () => getHomeRecommended(ctx, HOME_DEFAULT_DEAL), none) : none,
    searchLabels(locale),
  ]);

  const sections: Record<HomeSectionKey, () => ReactNode> = {
    categories: () => <CategoryChips locale={locale} />,
    featured: () => <RecommendedListings locale={locale} listings={recommended} />,
    cities: () => <Destinations locale={locale} cities={cities} />,
    howItWorks: () => <HowItWorks locale={locale} />,
    listCta: () => <ListCta locale={locale} />,
  };

  return (
    <HomeTabProvider>
      <HomeJsonLd locale={locale} />
      <HomeHero
        locale={locale}
        searchCard={
          <HomeSearchCard labels={labels} popular={cities.map(({ slug, name }) => ({ slug, name }))} holidays={holidays} />
        }
      />
      {/* Returning visitors only: renders nothing (and reserves nothing) on a first visit. */}
      <ContinueSection locale={locale} userId={historyUserId} deals={labels.deals} guestCounts={labels.guestCounts} />
      {/* 32px between sections on phones (--section-space); empty sections (no cities) render
          nothing or an empty wrapper that the gap skips. */}
      <div className="mt-6 flex flex-col gap-section pb-section">
        {settings.homeSections
          .filter((section) => section.enabled)
          .map((section) => (
            <div key={section.key} data-home-section={section.key} className={`empty:hidden ${DEFERRED_SIZE[section.key] ?? ""}`}>
              {sections[section.key]()}
            </div>
          ))}
      </div>
    </HomeTabProvider>
  );
}
