import { BookOpen, CalendarDays, MapPinned, Phone } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShabbatCandlesIcon } from "@/components/ds/jewish-icons";
import { EmergencyContacts } from "@/components/jewish-life/emergency-contacts";
import { ExploreSection } from "@/components/jewish-life/explore-section";
import { GuidesSection } from "@/components/jewish-life/guides-section";
import { JewishCalendar } from "@/components/jewish-life/jewish-calendar";
import { JewishLifeHero } from "@/components/jewish-life/jewish-life-hero";
import { PlacesSection } from "@/components/jewish-life/places-section";
import { JlContainer, JlSection } from "@/components/jewish-life/section";
import { ShabbatTimesTable } from "@/components/jewish-life/shabbat-times-table";
import { UpcomingHolidays } from "@/components/jewish-life/upcoming-holidays";
import { IntroDetails, WelcomeStrip } from "@/components/jewish-life/welcome-strip";
import { ShabbatCountdownCard } from "@/components/shabbat/shabbat-countdown-card";
import { userWantsHebrewDates } from "@/components/shabbat/shared";
import { siteConfig } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { DEFAULT_TIME_ZONE } from "@/lib/format";
import { formatMonthParam, parseMonthParam, todayIn, yearMonthOf } from "@/lib/jewish-life/calendar";
import { parsePlaceTypes } from "@/lib/jewish-life/places";
import { getShabbatCities } from "@/lib/jewish-life/queries";
import { pickJewishLifeParams } from "@/lib/jewish-life/urls";
import { pageMetadata, siteName } from "@/lib/seo";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "jewishLife.meta" });
  return pageMetadata({
    locale,
    path: "/jewish-life",
    title: t("title"),
    description: t("description", { siteName: siteName(locale) }),
  });
}

/**
 * Jewish life in Georgia (brief §5.8): a synagogue photo hero with the 4 quick actions, the
 * promise (every host welcomes you) with one-tap searches, this week's Shabbat (live countdown
 * with city chips + the per-city table with the parasha), photo cards for synagogues, kosher food
 * and community, the places map and list (3 places first on phones, then "show all"), the Hebrew
 * calendar with upcoming holidays, emergency numbers you tap to call and guides ("coming soon").
 */
export default async function JewishLifePage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  setRequestLocale(locale);

  const query = await searchParams;
  const pageParams = pickJewishLifeParams(query);
  const t = await getTranslations({ locale, namespace: "jewishLife" });

  const today = todayIn(DEFAULT_TIME_ZONE);
  const current = yearMonthOf(today);
  const month = parseMonthParam(query.month, current);

  const cities = await getShabbatCities(locale);
  const defaultSlug = siteConfig.shabbat.homeCities[0];
  const city =
    cities.find((c) => c.slug === pageParams.city) ?? cities.find((c) => c.slug === defaultSlug) ?? cities[0];
  const showHebrewDates = await userWantsHebrewDates();

  return (
    <div className="pb-8">
      <JewishLifeHero locale={locale} />

      <JlContainer>
        <WelcomeStrip locale={locale} />
      </JlContainer>

      {/* This week's Shabbat comes first (brief §5.8): it is what most visitors open the page for. */}
      {city ? (
        <JlSection
          id="shabbat-times"
          icon={ShabbatCandlesIcon}
          tone="coral"
          title={t("times.title")}
          lead={t("times.lead")}
          className="bg-navy-soft/50"
        >
          <div className="grid gap-5 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start lg:gap-6">
            <ShabbatCountdownCard
              cities={cities.map((c) => c.slug)}
              initialCity={city.slug}
              headingLevel="h3"
              moreHref={null}
              locale={locale}
              className="lg:sticky lg:top-24"
            />
            <ShabbatTimesTable
              cities={cities}
              selectedSlug={city.slug}
              params={pageParams}
              showHebrewDate={showHebrewDates}
              locale={locale}
            />
          </div>
        </JlSection>
      ) : null}

      <JlContainer>
        <ExploreSection locale={locale} />
        <IntroDetails locale={locale} />
      </JlContainer>

      <JlSection id="places" icon={MapPinned} title={t("places.title")} lead={t("places.lead")}>
        <PlacesSection
          locale={locale}
          initialTypes={parsePlaceTypes(query.type)}
          initialCity={pageParams.placeCity ?? null}
        />
      </JlSection>

      {city ? (
        <JlSection
          id="calendar"
          icon={CalendarDays}
          tone="green"
          title={t("calendar.title")}
          lead={t("calendar.lead")}
          className="bg-navy-soft/50"
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
            <JewishCalendar
              month={month}
              current={current}
              today={today}
              city={city}
              cities={cities}
              params={pageParams}
              locale={locale}
            />
            <UpcomingHolidays
              today={today}
              params={pageParams}
              currentMonth={formatMonthParam(current)}
              locale={locale}
            />
          </div>
        </JlSection>
      ) : null}

      <JlSection
        id="emergency"
        icon={Phone}
        tone="amber"
        title={t("emergency.title")}
        lead={t("emergency.lead")}
      >
        <EmergencyContacts locale={locale} />
      </JlSection>

      <JlSection id="guides" icon={BookOpen} title={t("guides.title")} lead={t("guides.lead")} className="bg-navy-soft/50">
        <GuidesSection locale={locale} />
      </JlSection>
    </div>
  );
}
