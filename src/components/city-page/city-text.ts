import "server-only";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/config/site";
import { pickLocalized } from "@/i18n/locale";
import type { CityRecord } from "@/lib/places";

/** The cityPages translator of a language. */
export type CityPagesT = Awaited<ReturnType<typeof getTranslations>>;

/**
 * A city's name for sentences: `city` ("בטומי", from the database) and `inCity` ("בבטומי",
 * "в Батуми", "ბათუმში"), which most titles need. `inCity` comes from cityPages.cities.<slug>.in;
 * a city added later without texts gets the language's plain pattern (inFallback: "ב{city}",
 * "in {city}", "— {city}").
 */
export type CityNames = { city: string; inCity: string };

export function cityNames(t: CityPagesT, city: Pick<CityRecord, "slug" | "names">, locale: AppLocale): CityNames {
  const name = pickLocalized(city.names, locale);
  const key = `cities.${city.slug}.in` as const;
  return { city: name, inCity: t.has(key) ? t(key) : t("inFallback", { city: name }) };
}

/**
 * The 2–3 short paragraphs about the city (cityPages.cities.<slug>.about.p1…p3), written only
 * from facts that can be checked and marked "_review" for the founder. [] for a city without texts.
 */
export function cityAbout(t: CityPagesT, slug: string): string[] {
  return (["p1", "p2", "p3"] as const).flatMap((p) => {
    const key = `cities.${slug}.about.${p}` as const;
    return t.has(key) ? [t(key)] : [];
  });
}
