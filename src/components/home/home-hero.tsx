import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import { ShieldCheckIcon } from "@/components/ds/sprite-icons";
import type { AppLocale } from "@/config/site";

/**
 * The top of the home page (brief round 2, 3.8 and 5.2). Light: the purple header continues into a
 * purple band with 28px rounded bottom corners, a white two-line title and one white line; the
 * search card overlaps the band's bottom by 48px. Dark: no band (bg-hero-band is transparent),
 * a white title with its last words in lavender.
 * Then the promise line with a purple shield. No photo and no motion: the title is the LCP and
 * paints with the HTML.
 */
export async function HomeHero({ locale, searchCard }: { locale: AppLocale; searchCard: ReactNode }) {
  const [t, tHome] = await Promise.all([
    getTranslations({ locale, namespace: "home.hero" }),
    getTranslations({ locale, namespace: "home" }),
  ]);

  return (
    <section aria-labelledby="home-hero-title">
      {/* -mt-px: no hairline between the header and the band on any zoom level. */}
      <div className="-mt-px rounded-b-[28px] bg-hero-band pt-4 pb-[calc(3rem+1.25rem)] sm:pt-8 lg:pt-12 lg:pb-[calc(3rem+2.5rem)]">
        <Container className="text-start text-white md:text-center">
          <h1
            id="home-hero-title"
            className="mx-auto max-w-[22ch] text-display text-balance text-white max-sm:[&:lang(ka)]:text-[1.375rem] max-sm:[&:lang(ru)]:text-[1.5rem] md:max-w-3xl"
          >
            {t.rich("title", {
              em: (chunks) => <span className="dark:text-primary-text">{chunks}</span>,
            })}
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-body text-pretty text-white/90 dark:text-muted-foreground">{t("lead")}</p>
        </Container>
      </div>

      <Container className="relative -mt-12">
        <div className="mx-auto max-w-5xl">{searchCard}</div>
        <p className="mx-auto mt-3 flex max-w-5xl items-center gap-2 text-small font-medium text-foreground md:justify-center">
          <ShieldCheckIcon className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 text-pretty">{tHome("promise")}</span>
        </p>
      </Container>
    </section>
  );
}
