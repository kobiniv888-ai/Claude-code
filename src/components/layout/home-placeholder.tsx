import { BadgeCheck, Languages, MapPin, MessageCircle, Plus, Search, Sunset } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import { SafetyTip } from "@/components/common/safety-tip";
import { SectionHeading } from "@/components/common/section-heading";
import { Button } from "@/components/ui/button";
import { siteConfig, type AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { isAppLocale } from "@/i18n/locale";

const POINTS = [
  { key: "verified", icon: BadgeCheck },
  { key: "jewish", icon: Sunset },
  { key: "direct", icon: MessageCircle },
  { key: "languages", icon: Languages },
] as const;

/**
 * Temporary home page: hero with the tagline, "Search" and "List your property for free",
 * the trust points and the popular cities. The search/home feature replaces it.
 */
export async function HomePlaceholder() {
  const [t, tc, locale] = await Promise.all([getTranslations("nav"), getTranslations("common"), getLocale()]);
  const lang: AppLocale = isAppLocale(locale) ? locale : "en";
  const cities = siteConfig.cities.filter((city) => city.popular);

  return (
    <>
      <section className="relative isolate overflow-hidden border-b bg-linear-to-b from-secondary/70 via-background to-background">
        <div
          aria-hidden
          className="pointer-events-none absolute -end-32 -top-40 -z-10 size-[28rem] rounded-full bg-terracotta/12 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -start-40 top-40 -z-10 size-[26rem] rounded-full bg-primary/10 blur-3xl"
        />
        <Container className="grid grid-cols-1 items-center gap-12 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:py-24">
          <div className="animate-fade-up">
            <p className="inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1 text-xs font-semibold text-accent-foreground shadow-xs backdrop-blur">
              <MapPin aria-hidden className="size-3.5" />
              {t("home.eyebrow")}
            </p>
            <h1 className="mt-5 text-[1.875rem] leading-[1.12] font-extrabold tracking-tight break-words hyphens-auto text-balance text-foreground sm:text-5xl lg:text-6xl [&:lang(ka)]:text-[1.75rem] [&:lang(ka)]:sm:text-4xl [&:lang(ka)]:lg:text-[2.75rem]">
              {tc("siteTagline")}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
              {t("home.lead")}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="h-12 rounded-xl px-6 text-base font-semibold shadow-card">
                <Link href="/search">
                  <Search aria-hidden className="size-5" />
                  {t("searchHomes")}
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-12 rounded-xl border-terracotta/40 bg-card px-6 text-base font-semibold text-terracotta hover:bg-accent hover:text-accent-foreground"
              >
                <Link href="/post">
                  <Plus aria-hidden className="size-5" strokeWidth={2.4} />
                  {t("listFree")}
                </Link>
              </Button>
            </div>
            <ul className="mt-10 grid grid-cols-2 gap-x-6 gap-y-4 sm:max-w-xl">
              {POINTS.map(({ key, icon: Icon }) => (
                <li key={key} className="flex items-center gap-3 text-sm font-medium text-foreground/85">
                  <span
                    aria-hidden
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-card text-primary shadow-card"
                  >
                    <Icon className="size-[18px]" />
                  </span>
                  {t(`home.points.${key}`)}
                </li>
              ))}
            </ul>
          </div>

          <div aria-hidden className="relative mx-auto hidden w-full max-w-md lg:block">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-linear-to-br from-[#25487F] to-[#1A345F] shadow-float">
              <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_80%_10%,rgb(229_128_95/0.35),transparent)]" />
              <svg viewBox="0 0 64 64" className="absolute inset-x-0 top-[18%] mx-auto w-3/5">
                <path
                  d="M13 31 32 15l19 16"
                  fill="none"
                  stroke="#E5805F"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  fill="#FFFFFF"
                  d="M23.5 48.5V36.5a8.5 8.5 0 0 1 17 0v12a1.5 1.5 0 0 1-1.5 1.5H25a1.5 1.5 0 0 1-1.5-1.5Z"
                />
              </svg>
              <div className="absolute inset-x-6 bottom-6 flex flex-wrap gap-2">
                {cities.slice(0, 6).map((city) => (
                  <span
                    key={city.slug}
                    className="rounded-full bg-white/12 px-3 py-1.5 text-sm font-medium text-white ring-1 ring-white/20 backdrop-blur"
                  >
                    {city.names[lang]}
                  </span>
                ))}
              </div>
            </div>
            <div className="absolute -start-8 top-10 flex items-center gap-2 rounded-2xl bg-card px-4 py-3 text-sm font-semibold shadow-float">
              <BadgeCheck className="size-5 text-verified" />
              {t("home.points.verified")}
            </div>
            <div className="absolute -end-6 bottom-28 flex items-center gap-2 rounded-2xl bg-card px-4 py-3 text-sm font-semibold shadow-float">
              <Sunset className="size-5 text-terracotta" />
              {t("home.points.jewish")}
            </div>
          </div>
        </Container>
      </section>

      <Container className="py-12 sm:py-16">
        <SectionHeading title={t("home.popular")} />
        <ul className="flex flex-wrap gap-2.5">
          {cities.map((city) => (
            <li key={city.slug}>
              <Link
                href={`/search?city=${city.slug}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border bg-card px-4 text-sm font-medium shadow-xs outline-none transition-[box-shadow,background-color] hover:bg-card hover:shadow-card focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <MapPin aria-hidden className="size-4 text-terracotta" />
                {city.names[lang]}
              </Link>
            </li>
          ))}
        </ul>
        <SafetyTip className="mt-12 max-w-3xl" />
      </Container>
    </>
  );
}
