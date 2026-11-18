import "server-only";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { CITY_PAGE_TYPES, CITY_PAGE_TYPE_KEYS, type CityPageType } from "@/lib/city-pages/core";
import { findCityPageCity } from "@/lib/city-pages/server";
import type { CityRecord } from "@/lib/places";
import { cityNames, type CityNames, type CityPagesT } from "./city-text";

export type CityPageBase = {
  locale: AppLocale;
  city: CityRecord;
  t: CityPagesT;
  names: CityNames;
  typeLabels: Record<CityPageType, string>;
};

/**
 * The language, the active city and the city's names for a city page, or null when the address
 * is not a city page (unknown language or city): the page then answers 404. Static routes
 * (/search, /about, /rent…) never get here: Next.js matches them before the [city] segment.
 */
export async function resolveCityPage(rawLocale: string, slug: string): Promise<CityPageBase | null> {
  if (!isAppLocale(rawLocale)) return null;
  const locale: AppLocale = rawLocale;
  const city = await findCityPageCity(slug);
  if (!city) return null;
  const t = await getTranslations({ locale, namespace: "cityPages" });
  const typeLabels = Object.fromEntries(
    CITY_PAGE_TYPES.map((type) => [type, t(`types.${CITY_PAGE_TYPE_KEYS[type]}`)]),
  ) as Record<CityPageType, string>;
  return { locale, city, t, names: cityNames(t, city, locale), typeLabels };
}
