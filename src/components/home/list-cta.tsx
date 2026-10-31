import { HousePlus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import { ArrowEnd } from "@/components/common/directional-icon";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";

/** The big "List your property for free" call to action. */
export async function ListCta({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "home.listCta" });
  return (
    <section aria-labelledby="home-cta-title" className="py-12 sm:py-16">
      <Container>
        <div className="relative isolate overflow-hidden rounded-3xl bg-primary px-6 py-10 text-primary-foreground shadow-card sm:px-12 sm:py-14">
          <div aria-hidden="true" className="absolute -end-16 -top-16 -z-10 size-64 rounded-full bg-white/10 blur-2xl" />
          <div aria-hidden="true" className="absolute -bottom-20 -start-10 -z-10 size-72 rounded-full bg-terracotta/30 blur-3xl" />
          <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid max-w-2xl gap-3">
              <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-white/15">
                <HousePlus className="size-6" aria-hidden="true" />
              </span>
              <h2 id="home-cta-title" className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
                {t("title")}
              </h2>
              <p className="text-base text-pretty text-primary-foreground/85 sm:text-lg">{t("text")}</p>
            </div>
            <Link
              href="/post"
              className="group inline-flex h-13 shrink-0 items-center gap-2 rounded-full bg-background px-7 text-base font-semibold text-foreground shadow-lg transition hover:bg-secondary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {t("button")}
              <ArrowEnd className="size-5 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
