import { BookOpen, CalendarDays, Flame, MapPinned, Phone } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmergencyContacts } from "@/components/jewish-life/emergency-contacts";
import { GuidesSection } from "@/components/jewish-life/guides-section";
import { IntroSection } from "@/components/jewish-life/intro-section";
import { JewishCalendar } from "@/components/jewish-life/jewish-calendar";
import { JewishLifeHero } from "@/components/jewish-life/jewish-life-hero";
import { PlacesSection } from "@/components/jewish-life/places-section";
import { JlSection } from "@/components/jewish-life/section";
import { ShabbatTimesTable } from "@/components/jewish-life/shabbat-times-table";
import { UpcomingHolidays } from "@/components/jewish-life/upcoming-holidays";
import { ShabbatTimesCard } from "@/components/shabbat";
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
  const showGuides = siteConfig.features.articles;

  return (
    <div className="pb-8">
      <JewishLifeHero
        locale={locale}
        showGuidesLink={showGuides}
        aside={
          city ? (
            <ShabbatTimesCard
              city={city}
              locale={locale}
              hebrewDates={showHebrewDates}
              headingLevel="h2"
              showMoreLink={false}
            />
          ) : null
        }
      />

      <IntroSection locale={locale} />

      <JlSection
        id="places"
        icon={MapPinned}
        eyebrow={t("places.eyebrow")}
        title={t("places.title")}
        lead={t("places.lead")}
        className="border-y bg-secondary/30"
      >
        <PlacesSection
          locale={locale}
          initialTypes={parsePlaceTypes(query.type)}
          initialCity={pageParams.placeCity ?? null}
        />
      </JlSection>

      {city ? (
        <JlSection
          id="shabbat-times"
          icon={Flame}
          eyebrow={t("times.eyebrow")}
          title={t("times.title")}
          lead={t("times.lead")}
        >
          <ShabbatTimesTable
            cities={cities}
            selectedSlug={city.slug}
            params={pageParams}
            showHebrewDate={showHebrewDates}
            locale={locale}
          />
        </JlSection>
      ) : null}

      {city ? (
        <JlSection
          id="calendar"
          icon={CalendarDays}
          eyebrow={t("calendar.eyebrow")}
          title={t("calendar.title")}
          lead={t("calendar.lead")}
          className="border-y bg-secondary/30"
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
        id="guides"
        icon={BookOpen}
        eyebrow={t("guides.eyebrow")}
        title={t("guides.title")}
        lead={t("guides.lead")}
      >
        <GuidesSection locale={locale} />
      </JlSection>

      <JlSection
        id="emergency"
        icon={Phone}
        eyebrow={t("emergency.eyebrow")}
        title={t("emergency.title")}
        lead={t("emergency.lead")}
        className="border-t bg-secondary/30"
      >
        <EmergencyContacts locale={locale} />
      </JlSection>
    </div>
  );
}
