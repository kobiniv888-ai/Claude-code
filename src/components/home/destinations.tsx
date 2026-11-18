import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { PhotoPlaceholder, PhotoSlot } from "@/components/photos/photo-slot";
import { citySlot } from "@/config/photos";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import type { HomeCity } from "@/lib/home/cities";
import { searchPath } from "@/lib/listing/urls";
import { AfterLoad } from "./after-load";
import { HomeSection } from "./home-section";

/** The photo is 140px wide on phones, 176px from 640px, ~150px in the desktop grid. */
const SIZES = "(min-width: 1024px) 180px, (min-width: 640px) 176px, 140px";

/**
 * "Where to?" (brief round 2, 5.2): small city cards in a sideways row (a grid on desktop, where
 * a mouse can't swipe): a photo, the city name and the real number of public listings. No Shabbat times (they live on the Jewish life page).
 */
export async function Destinations({ locale, cities }: { locale: AppLocale; cities: HomeCity[] }) {
  if (cities.length === 0) return null;
  const [t, tPhotos] = await Promise.all([
    getTranslations({ locale, namespace: "home.cities" }),
    getTranslations({ locale, namespace: "photos" }),
  ]);

  return (
    <HomeSection id="home-cities-title" title={t("title")} bleed>
      <ul
        aria-label={t("title")}
        className="flex snap-x snap-mandatory scroll-px-gutter gap-3 overflow-x-auto overscroll-x-contain px-gutter pb-1 scrollbar-none lg:grid lg:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] lg:gap-4 lg:overflow-visible"
      >
        {cities.map((city) => {
          const slot = citySlot(city.slug);
          return (
            <li key={city.slug} className="w-35 shrink-0 snap-start sm:w-44 lg:w-auto">
              <Link
                href={searchPath({ city: city.slug })}
                className="group block rounded-card outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span className="relative block aspect-[4/3] overflow-hidden rounded-card bg-surface-muted" aria-hidden="true">
                  {/* Below the first screen: the (decorative) photos load after the page, so they
                      never compete with the first card photo (./after-load.tsx). */}
                  <AfterLoad>
                    {slot ? (
                      <PhotoSlot slot={slot} sizes={SIZES} alt="" className="size-full" />
                    ) : city.photoUrl ? (
                      <Image src={city.photoUrl} alt="" fill sizes={SIZES} className="object-cover" />
                    ) : (
                      <PhotoPlaceholder label={tPhotos("comingSoon")} className="size-full" />
                    )}
                  </AfterLoad>
                </span>
                <span className="mt-2 block truncate text-[0.9375rem] leading-snug font-medium text-foreground group-hover:underline" dir="auto">
                  {city.name}
                </span>
                <span className="block truncate text-caption text-muted-foreground">
                  {t("count", { count: city.count, formatted: formatNumber(city.count, locale) })}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </HomeSection>
  );
}
