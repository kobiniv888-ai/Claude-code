import { getMessages } from "next-intl/server";
import { siteConfig, type AppLocale } from "@/config/site";
import { cachedShabbatTimes } from "@/lib/home/shabbat-times";
import { getShabbatCities } from "@/lib/jewish-life/queries";
import { ShabbatCountdown, type CountdownCity, type CountdownMessages } from "./shabbat-countdown";
import { resolveLocale } from "./shared";

export type ShabbatCountdownCardProps = {
  /** City slugs to switch between (chips). Default: siteConfig.shabbat.homeCities (Tbilisi, Batumi). */
  cities?: readonly string[];
  /** Heading element of the card title. Default "h3". */
  headingLevel?: "h2" | "h3";
  /** "All Shabbat times →" target; pass null to hide it. Default: the Jewish life page's times. */
  moreHref?: string | null;
  locale?: AppLocale;
  className?: string;
};

/**
 * This week's Shabbat as a warm card: flickering candles, a live countdown ("Shabbat starts in
 * 2 days and 4 hours"; during Shabbat "Shabbat shalom · ends at 18:32"), candle lighting and
 * Havdalah in the city's own time zone, and city chips. Times come from @/lib/hebcal, computed
 * once a day per city. Server component (the countdown itself is a small client part).
 *
 *   <ShabbatCountdownCard />                              // home page
 *   <ShabbatCountdownCard cities={["tbilisi", "batumi", "kutaisi"]} headingLevel="h2" moreHref={null} />
 */
export async function ShabbatCountdownCard({
  cities = siteConfig.shabbat.homeCities,
  headingLevel = "h3",
  moreHref = "/jewish-life#shabbat-times",
  locale: localeProp,
  className,
}: ShabbatCountdownCardProps) {
  const locale = await resolveLocale(localeProp);
  const [all, messages] = await Promise.all([getShabbatCities(locale), getMessages({ locale })]);
  const now = new Date();

  const list = (
    await Promise.all(
      cities.map(async (slug): Promise<CountdownCity | null> => {
        const configured = siteConfig.cities.find((c) => c.slug === slug);
        const city =
          all.find((c) => c.slug === slug) ??
          (configured
            ? { slug, name: configured.names[locale], lat: configured.lat, lng: configured.lng, timezone: configured.timezone }
            : null);
        if (!city) return null;
        try {
          const times = await cachedShabbatTimes(slug, city, locale, now);
          return {
            slug,
            name: city.name,
            candleLighting: times.candleLighting?.toISOString() ?? null,
            havdalah: times.havdalah?.toISOString() ?? null,
            parashaTitle: times.parashaTitle,
            timezone: city.timezone,
          };
        } catch (error) {
          console.error(`[shabbat] no times for ${slug}:`, error);
          return null;
        }
      }),
    )
  ).filter((city): city is CountdownCity => city !== null);
  if (list.length === 0) return null;

  return (
    <ShabbatCountdown
      cities={list}
      serverNow={now.toISOString()}
      messages={(messages as unknown as { shabbatCountdown: CountdownMessages }).shabbatCountdown}
      headingLevel={headingLevel}
      moreHref={moreHref ?? undefined}
      className={className}
    />
  );
}
