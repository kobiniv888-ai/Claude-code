import Image from "next/image";
import { MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import { SectionHeading } from "@/components/common/section-heading";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { searchPath } from "@/lib/listing/urls";
import type { PopularCity } from "@/lib/search/home";

/** Photo tiles of the popular cities with their number of live listings. */
export async function PopularCities({ locale, cities }: { locale: AppLocale; cities: PopularCity[] }) {
  if (cities.length === 0) return null;
  const t = await getTranslations({ locale, namespace: "home.cities" });
  return (
    <section aria-labelledby="home-cities-title" className="py-10 sm:py-14">
      <Container>
        <SectionHeading id="home-cities-title" title={t("title")} description={t("lead")} action={{ label: t("all"), href: "/search" }} />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          {cities.map((city, index) => (
            <li key={city.slug}>
              <Link
                href={searchPath({ city: city.slug })}
                className="group relative isolate flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-2xl bg-primary/80 p-3 text-white shadow-card focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring sm:aspect-[3/4] sm:p-4"
              >
                {city.photoUrl ? (
                  <Image
                    src={city.photoUrl}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
                    priority={index < 2}
                    className="-z-10 object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />
                ) : (
                  <span aria-hidden="true" className="absolute inset-0 -z-10 flex items-center justify-center bg-linear-to-br from-primary to-wine">
                    <MapPin className="size-10 opacity-40" />
                  </span>
                )}
                <span aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-t from-black/75 via-black/20 to-transparent" />
                <span className="text-lg leading-tight font-bold drop-shadow sm:text-xl">{city.name}</span>
                <span className="text-xs font-medium text-white/90 sm:text-sm">
                  {t("count", { count: city.count, formatted: formatNumber(city.count, locale) })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
