import { BadgeCheck, Languages, MessageCircle, Sunset, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import { SectionHeading } from "@/components/common/section-heading";
import type { AppLocale } from "@/config/site";
import { siteName } from "@/lib/seo";

const POINTS: readonly { key: string; icon: LucideIcon }[] = [
  { key: "verified", icon: BadgeCheck },
  { key: "jewish", icon: Sunset },
  { key: "direct", icon: MessageCircle },
  { key: "languages", icon: Languages },
];

/** "Why us": four promises the product keeps (no numbers, no testimonials). */
export async function WhyUs({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "home.whyUs" });
  return (
    <section aria-labelledby="home-why-title" className="bg-secondary/40 py-12 sm:py-16">
      <Container>
        <SectionHeading id="home-why-title" title={t("title", { siteName: siteName(locale) })} description={t("lead")} />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {POINTS.map(({ key, icon: Icon }) => (
            <li key={key} className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-xs">
              <span className="inline-flex size-11 items-center justify-center rounded-xl bg-secondary text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="text-base font-semibold">{t(`points.${key}.title`)}</h3>
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{t(`points.${key}.text`)}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
