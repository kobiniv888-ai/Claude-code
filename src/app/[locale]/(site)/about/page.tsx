import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  HandCoins,
  HeartHandshake,
  House,
  KeyRound,
  Languages,
  LifeBuoy,
  Mail,
  MessageCircle,
  MessagesSquare,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckList } from "@/components/content/check-list";
import { ContentContainer } from "@/components/content/content-container";
import { ctaButtonClass } from "@/components/content/cta-band";
import { InfoCard } from "@/components/content/info-card";
import { contentMetadata } from "@/components/content/metadata";
import { PageHero } from "@/components/content/page-hero";
import { PlaceholderNote } from "@/components/content/placeholder-note";
import { contentTags, contentValues } from "@/components/content/rich";
import { ContentSection, SectionHeading } from "@/components/content/section-heading";
import { StepCard } from "@/components/content/step-card";
import { Link } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  const values = contentValues(locale);
  return contentMetadata({
    locale,
    path: "/about",
    title: t("metaTitle", values),
    description: t("metaDescription", values),
  });
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");
  const values = contentValues(locale);
  const rich = { ...values, ...contentTags };

  const audience = [
    { key: "guests", icon: Users, tone: "primary" },
    { key: "buyers", icon: TrendingUp, tone: "wine" },
    { key: "owners", icon: KeyRound, tone: "terracotta" },
    { key: "businesses", icon: Briefcase, tone: "verified" },
  ] as const;

  const steps = [
    { key: "step1", icon: Search, tone: "primary" },
    { key: "step2", icon: BadgeCheck, tone: "verified" },
    { key: "step3", icon: MessageCircle, tone: "terracotta" },
  ] as const;

  const valueItems = [
    { key: "trust", icon: ShieldCheck, tone: "verified" },
    { key: "community", icon: HeartHandshake, tone: "terracotta" },
    { key: "jewishFriendly", icon: Sparkles, tone: "wine" },
    { key: "direct", icon: HandCoins, tone: "primary" },
    { key: "languages", icon: Languages, tone: "warning" },
  ] as const;

  return (
    <div className="pb-16">
      <PageHero icon={House} tone="terracotta" eyebrow={t("hero.eyebrow", values)} title={t("hero.title")} lead={t("hero.lead", values)}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/search" className={ctaButtonClass.primary}>
            <Search aria-hidden="true" />
            {t("hero.ctaSearch")}
          </Link>
          <Link href="/post" className={ctaButtonClass.outline}>
            <KeyRound aria-hidden="true" />
            {t("hero.ctaPost")}
          </Link>
        </div>
      </PageHero>

      {/* What the site is */}
      <ContentSection aria-labelledby="about-what">
        <ContentContainer>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
            <div className="max-w-3xl">
              <SectionHeading id="about-what" title={t("what.title", values)} />
              <div className="mt-5 space-y-4 text-base leading-relaxed text-pretty text-foreground/85 sm:text-lg">
                <p>{t("what.p1")}</p>
                <p>{t("what.p2")}</p>
                <p>{t("what.p3")}</p>
              </div>
            </div>
            <aside
              aria-labelledby="about-highlights"
              className="self-start rounded-2xl border bg-card p-6 shadow-card"
            >
              <h3 id="about-highlights" className="text-lg font-semibold">
                {t("what.highlights.title")}
              </h3>
              <CheckList
                className="mt-4 text-[0.9375rem]"
                items={(["a", "b", "c", "d", "e"] as const).map((k) => t(`what.highlights.${k}`))}
              />
            </aside>
          </div>
        </ContentContainer>
      </ContentSection>

      {/* Who it's for */}
      <ContentSection aria-labelledby="about-audience" className="border-y bg-secondary/40">
        <ContentContainer>
          <SectionHeading id="about-audience" title={t("audience.title")} lead={t("audience.lead")} />
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {audience.map(({ key, icon, tone }) => (
              <li key={key}>
                <InfoCard icon={icon} tone={tone} title={t(`audience.${key}.title`)}>
                  {t(`audience.${key}.body`)}
                </InfoCard>
              </li>
            ))}
          </ul>
        </ContentContainer>
      </ContentSection>

      {/* Our story — for the founders to write */}
      <ContentSection aria-labelledby="about-story">
        <ContentContainer size="narrow">
          <SectionHeading id="about-story" title={t("story.title")} />
          <PlaceholderNote
            className="mt-6"
            badge={t("story.badge")}
            title={t("story.noteTitle")}
            hint={t("story.noteHint")}
          >
            {t("story.noteBody", values)}
          </PlaceholderNote>
        </ContentContainer>
      </ContentSection>

      {/* How it works (summary) */}
      <ContentSection aria-labelledby="about-how" className="border-y bg-card">
        <ContentContainer>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeading id="about-how" title={t("how.title")} lead={t("how.lead")} />
            <Link
              href="/how-it-works"
              className="inline-flex items-center gap-1.5 self-start rounded-lg font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring sm:self-auto"
            >
              {t("how.link")}
              <ArrowRight aria-hidden="true" className="size-4 rtl:-scale-x-100" />
            </Link>
          </div>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {steps.map(({ key, icon, tone }, index) => (
              <StepCard
                key={key}
                icon={icon}
                tone={tone}
                step={t("how.stepLabel", { number: String(index + 1) })}
                title={t(`how.${key}.title`)}
                className="bg-background"
              >
                {t(`how.${key}.body`)}
              </StepCard>
            ))}
          </ol>
        </ContentContainer>
      </ContentSection>

      {/* Values */}
      <ContentSection aria-labelledby="about-values">
        <ContentContainer>
          <SectionHeading id="about-values" title={t("values.title")} lead={t("values.lead")} />
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {valueItems.map(({ key, icon, tone }, index) => (
              <li key={key} className={index === 0 ? "sm:col-span-2" : undefined}>
                <InfoCard
                  icon={icon}
                  tone={tone}
                  title={t(`values.${key}.title`)}
                  className={index === 0 ? "bg-linear-to-br from-primary-tint/70 to-card" : undefined}
                >
                  {t(`values.${key}.body`)}
                </InfoCard>
              </li>
            ))}
          </ul>
        </ContentContainer>
      </ContentSection>

      {/* How to reach us */}
      <ContentSection aria-labelledby="about-contact" className="pb-4">
        <ContentContainer>
          <SectionHeading id="about-contact" title={t("contact.title")} lead={t("contact.lead")} />
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            <li>
              <InfoCard
                icon={LifeBuoy}
                title={t("contact.help.title")}
                footer={
                  <Link href="/help" className={ctaButtonClass.outline + " h-11 w-full text-sm"}>
                    {t("contact.help.cta")}
                  </Link>
                }
              >
                {t("contact.help.body")}
              </InfoCard>
            </li>
            <li>
              <InfoCard
                icon={MessagesSquare}
                tone="terracotta"
                title={t("contact.form.title")}
                footer={
                  <Link href="/contact" className={ctaButtonClass.outline + " h-11 w-full text-sm"}>
                    {t("contact.form.cta")}
                  </Link>
                }
              >
                {t("contact.form.body")}
              </InfoCard>
            </li>
            <li>
              <InfoCard icon={Mail} tone="wine" title={t("contact.email.title")}>
                {t.rich("contact.email.body", rich)}
              </InfoCard>
            </li>
          </ul>
        </ContentContainer>
      </ContentSection>
    </div>
  );
}
