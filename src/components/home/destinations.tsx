import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { CardCarousel } from "@/components/ds/card-carousel";
import { ShabbatCandlesIcon } from "@/components/ds/jewish-icons";
import { PhotoPlaceholder, PhotoSlot } from "@/components/photos/photo-slot";
import { citySlot } from "@/config/photos";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import type { HomeCity } from "@/lib/home/cities";
import { searchPath } from "@/lib/listing/urls";
import { cn } from "@/lib/utils";
import { HomeSection } from "./home-section";

const SIZES = "(min-width: 1280px) 19vw, (min-width: 1024px) 23vw, (min-width: 640px) 31vw, 46vw";

/** "Where to?": tall photo cards per city with the real number of listings and this week's Shabbat time. */
export async function Destinations({ locale, cities }: { locale: AppLocale; cities: HomeCity[] }) {
  if (cities.length === 0) return null;
  const [t, tPhotos] = await Promise.all([
    getTranslations({ locale, namespace: "home.cities" }),
    getTranslations({ locale, namespace: "photos" }),
  ]);

  return (
    <HomeSection id="home-cities-title" title={t("title")} subtitle={t("lead")} href="/search" linkLabel={t("all")} bleed>
      <CardCarousel label={t("title")} itemClassName="basis-[46%] sm:basis-[31%] lg:basis-[23.2%] xl:basis-[19%]">
        {cities.map((city) => {
          const slot = citySlot(city.slug);
          return (
            <Link
              key={city.slug}
              href={searchPath({ city: city.slug })}
              className={cn(
                "group relative isolate flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-card bg-muted p-3 text-white shadow-card outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 sm:p-4",
                "bh-press",
              )}
            >
              <span className={cn("absolute inset-0 -z-10", "bh-zoom-hover")} aria-hidden="true">
                {slot ? (
                  <PhotoSlot slot={slot} sizes={SIZES} alt="" className="size-full" />
                ) : city.photoUrl ? (
                  <Image src={city.photoUrl} alt="" fill sizes={SIZES} className="object-cover" />
                ) : (
                  <PhotoPlaceholder label={tPhotos("comingSoon")} className="size-full" />
                )}
              </span>
              <span aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-t from-black/80 via-black/25 to-black/10" />
              {city.shabbat ? (
                <span className="absolute start-2.5 top-2.5 inline-flex max-w-[calc(100%-1.25rem)] items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-caption font-semibold text-white ring-1 ring-white/20 backdrop-blur-sm">
                  <ShabbatCandlesIcon className="size-3.5 shrink-0 text-amber-200" aria-hidden="true" />
                  <span className="truncate">
                    {t(city.shabbat.kind === "in" ? "shabbatIn" : "shabbatOut", { time: city.shabbat.time })}
                  </span>
                </span>
              ) : null}
              <span className="text-h3 leading-tight font-bold text-white [text-shadow:0_1px_8px_rgb(0_0_0/0.45)]" dir="auto">
                {city.name}
              </span>
              <span className="text-small font-medium text-white/90">
                {t("count", { count: city.count, formatted: formatNumber(city.count, locale) })}
              </span>
            </Link>
          );
        })}
      </CardCarousel>
    </HomeSection>
  );
}
