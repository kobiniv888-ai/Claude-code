import { CheckIcon as Check } from "@/components/ds/sprite-icons";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import { ArrowEnd } from "@/components/common/directional-icon";
import { buttonStyles } from "@/components/ds/button";
import { Reveal } from "@/components/ds/reveal";
import { PhotoSlot } from "@/components/photos/photo-slot";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const POINTS = ["free", "direct", "fast"] as const;

/** "List your property for free": a big photo card with three short promises and one button. */
export async function ListCta({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "home.listCta" });
  return (
    <section aria-labelledby="home-cta-title" className="py-[calc(var(--section-space)*0.55)]">
      <Container>
        <Reveal className="relative isolate overflow-hidden rounded-card bg-neutral-900 text-white shadow-raised">
          <PhotoSlot slot="cta.listYourProperty" sizes="(min-width: 1280px) 1216px, 100vw" alt="" className="absolute inset-0 -z-20" />
          {/* Legibility: the text side is at least 60% black. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-linear-to-t from-black/85 via-black/60 to-black/30 md:bg-linear-to-l md:from-black/20 md:via-black/60 md:to-black/85 md:rtl:bg-linear-to-r"
          />
          <div className="flex min-h-[26rem] flex-col justify-end gap-4 p-6 sm:p-10 md:min-h-[24rem] md:max-w-xl md:justify-center lg:p-14">
            <p className="text-small font-semibold text-white/85">{t("eyebrow")}</p>
            <h2 id="home-cta-title" className="text-h1 text-balance text-white">
              {t("title")}
            </h2>
            <p className="text-body text-pretty text-white/90">{t("text")}</p>
            <ul className="flex flex-wrap gap-2">
              {POINTS.map((key) => (
                <li
                  key={key}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-small font-semibold ring-1 ring-white/25 backdrop-blur-sm"
                >
                  <Check className="size-4" aria-hidden="true" />
                  {t(`points.${key}`)}
                </li>
              ))}
            </ul>
            <Link href="/post" className={cn(buttonStyles({ variant: "accent", size: "lg" }), "group mt-1 w-full sm:w-fit")}>
              {t("button")}
              <ArrowEnd
                className="size-5 transition-transform duration-(--motion-fast) group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </Link>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
