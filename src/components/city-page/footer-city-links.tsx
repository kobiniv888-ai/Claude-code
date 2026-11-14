import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/config/site";
import { isAppLocale, pickLocalized } from "@/i18n/locale";
import { Link } from "@/i18n/navigation";
import { cityOverviewPath, isCityPageSlug } from "@/lib/city-pages/core";
import { getCities } from "@/lib/places";

/**
 * The footer's row of city links (round 3, brief 10): every page links to the city pages, so
 * visitors and search engines can reach them. The popular cities (all active ones when none is
 * marked popular), in the admins' order, from the places cache. Renders nothing if the cities
 * can't be loaded, so the footer never fails.
 */
export async function FooterCityLinks({ locale }: { locale: string }) {
  const lang: AppLocale = isAppLocale(locale) ? locale : "en";
  let cities: Awaited<ReturnType<typeof getCities>> = [];
  try {
    // Only cities that have pages (a reserved or overlong slug has none).
    cities = (await getCities()).filter((city) => isCityPageSlug(city.slug));
  } catch (error) {
    console.error("[footer] could not load the cities:", error);
    return null;
  }
  const popular = cities.filter((city) => city.isPopular);
  const list = [...(popular.length > 0 ? popular : cities)].sort((a, b) => a.sortOrder - b.sortOrder);
  if (list.length === 0) return null;
  const t = await getTranslations({ locale: lang, namespace: "cityPages.footer" });

  return (
    <nav aria-labelledby="footer-cities" className="mt-8 grid gap-2 border-t pt-6 sm:mt-10">
      <h2 id="footer-cities" className="text-sm font-semibold text-foreground">
        {t("title")}
      </h2>
      <ul className="flex flex-wrap gap-x-4 gap-y-0.5">
        {list.map((city) => (
          <li key={city.slug}>
            <Link
              href={cityOverviewPath(city.slug)}
              className="-mx-1 inline-flex min-h-11 items-center rounded-md px-1 text-sm text-muted-foreground underline-offset-4 outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-9"
            >
              {pickLocalized(city.names, lang)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
