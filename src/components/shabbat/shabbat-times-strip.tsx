import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { siteConfig, type AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { getShabbatCities } from "@/lib/jewish-life/queries";
import { cn } from "@/lib/utils";
import { ShabbatTimesCard } from "./shabbat-times-card";
import { resolveLocale, userWantsHebrewDates, type HeadingLevel, type ShabbatCityInput } from "./shared";

export type ShabbatTimesStripProps = {
  /** Cities to show side by side. Default: siteConfig.shabbat.homeCities (Tbilisi and Batumi). */
  cities?: ShabbatCityInput[];
  /** Section heading + "all cities" link above the cards. Default true; false renders only the cards. */
  withHeading?: boolean;
  /** Heading element of the section title (cards use the next level). Default "h2". */
  headingLevel?: Exclude<HeadingLevel, "h4">;
  /** Show Hebrew dates. Default: the signed-in user's setting. */
  hebrewDates?: boolean;
  locale?: AppLocale;
  className?: string;
};

/**
 * This week's Shabbat times for a few cities, side by side — the home page section.
 *
 *   <ShabbatTimesStrip />                       // Tbilisi + Batumi from siteConfig.shabbat.homeCities
 *   <ShabbatTimesStrip cities={[…]} withHeading={false} />
 *
 * Server component.
 */
export async function ShabbatTimesStrip({
  cities,
  withHeading = true,
  headingLevel: Heading = "h2",
  hebrewDates,
  locale: localeProp,
  className,
}: ShabbatTimesStripProps) {
  const locale = await resolveLocale(localeProp);
  const t = await getTranslations({ locale, namespace: "shabbat" });

  let list = cities;
  if (!list) {
    const all = await getShabbatCities(locale);
    const homeCities: readonly string[] = siteConfig.shabbat.homeCities;
    list = homeCities.flatMap((slug): ShabbatCityInput[] => {
      const city = all.find((c) => c.slug === slug);
      if (city) return [city];
      // Not in the database (yet): use the starting city from the site config.
      const configured = siteConfig.cities.find((c) => c.slug === slug);
      return configured
        ? [{ name: configured.names[locale], lat: configured.lat, lng: configured.lng, timezone: configured.timezone }]
        : [];
    });
  }
  if (list.length === 0) return null;

  const showHebrew = hebrewDates ?? (await userWantsHebrewDates());
  const cardHeading: HeadingLevel = withHeading ? (Heading === "h2" ? "h3" : "h4") : "h3";

  const cards = (
    <div className={cn("grid gap-4", list.length > 1 && "sm:grid-cols-2", list.length > 2 && "lg:grid-cols-3")}>
      {list.map((city) => (
        <ShabbatTimesCard
          key={`${city.name}-${city.lat}-${city.lng}`}
          city={city}
          locale={locale}
          hebrewDates={showHebrew}
          headingLevel={cardHeading}
          showMoreLink={false}
        />
      ))}
    </div>
  );

  if (!withHeading) return <div className={className}>{cards}</div>;

  return (
    <section aria-labelledby="shabbat-strip-title" className={className}>
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Heading id="shabbat-strip-title" className="text-2xl font-bold tracking-tight text-balance">
            {t("strip.title")}
          </Heading>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">{t("strip.lead")}</p>
        </div>
        <Link
          href="/jewish-life#shabbat-times"
          className="inline-flex min-h-6 items-center gap-1.5 self-start rounded-md text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:self-auto"
        >
          {t("strip.allCities")}
          <ArrowRight aria-hidden="true" className="size-4 rtl:-scale-x-100" />
        </Link>
      </div>
      {cards}
    </section>
  );
}
