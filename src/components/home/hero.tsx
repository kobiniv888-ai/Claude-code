import { getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import { SearchBar } from "@/components/search/search-bar";
import type { AppLocale } from "@/config/site";
import type { HolidayMark } from "@/lib/search/holiday-marks";
import type { PopularCity } from "@/lib/search/home";
import { siteName } from "@/lib/seo";

/** The top of the home page: the promise in one line and the big search bar. */
export async function HomeHero({
  locale,
  cities,
  holidays,
}: {
  locale: AppLocale;
  cities: PopularCity[];
  holidays: HolidayMark[];
}) {
  const t = await getTranslations({ locale, namespace: "home.hero" });
  return (
    <section
      aria-labelledby="home-hero-title"
      className="relative isolate z-10 border-b bg-linear-to-b from-secondary/80 via-secondary/30 to-background"
    >
      {/* Decoration is clipped on its own layer, so the search suggestions can overflow the hero. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -end-24 -top-24 size-80 rounded-full bg-terracotta/10 blur-3xl sm:size-[28rem]" />
        <div className="absolute -start-32 bottom-0 size-72 rounded-full bg-primary/10 blur-3xl" />
      </div>
      <Container className="py-8 sm:py-14 lg:py-20">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-sm font-semibold text-accent-foreground">{t("eyebrow", { siteName: siteName(locale) })}</p>
          <h1
            id="home-hero-title"
            className="mt-2 text-3xl leading-tight font-bold tracking-tight text-balance text-foreground sm:text-4xl lg:text-5xl"
          >
            {t("title")}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">{t("lead")}</p>
        </div>
        <SearchBar
          variant="hero"
          initial={{ deal: "short-stay", place: null, checkIn: null, checkOut: null, guests: 0 }}
          popular={cities.map(({ slug, name }) => ({ slug, name }))}
          holidays={holidays}
          className="mx-auto mt-6 max-w-4xl text-start sm:mt-10"
        />
      </Container>
    </section>
  );
}
