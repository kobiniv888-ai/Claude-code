import {
  ArrowRight,
  BadgeCheck,
  ChevronDown,
  Flame,
  Footprints,
  HousePlus,
  IdCard,
  KeyRound,
  LifeBuoy,
  MessageCircle,
  MessagesSquare,
  Route,
  ScanSearch,
  Search,
  Smartphone,
  UserRoundCheck,
  Users,
  UtensilsCrossed,
  Video,
} from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ContentContainer } from "@/components/content/content-container";
import { CtaBand, ctaButtonClass } from "@/components/content/cta-band";
import { contentMetadata } from "@/components/content/metadata";
import { PageHero } from "@/components/content/page-hero";
import { contentValues } from "@/components/content/rich";
import { ContentSection, SectionHeading } from "@/components/content/section-heading";
import { ChipList, StepCard } from "@/components/content/step-card";
import { TrackTabs } from "@/components/content/track-tabs";
import { VerificationBadgeGrid } from "@/components/content/verification-badges";
import { documentChecksOn } from "@/config/verification";
import { Link } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "howItWorks" });
  const values = contentValues(locale);
  return contentMetadata({
    locale,
    path: "/how-it-works",
    title: t("metaTitle", values),
    description: t("metaDescription", values),
  });
}

export default async function HowItWorksPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("howItWorks");
  const values = contentValues(locale);
  const stepLabel = (n: number) => t("step", { number: String(n) });

  const guestSteps = (
    <Track
      title={t("guests.title")}
      lead={t("guests.lead")}
      cta={
        <Link href="/search" className={ctaButtonClass.primary}>
          <Search aria-hidden="true" />
          {t("guests.cta")}
        </Link>
      }
    >
      <StepCard icon={Search} step={stepLabel(1)} title={t("guests.step1.title")}
        extra={
          <ChipList
            items={[
              { icon: UtensilsCrossed, label: t("guests.step1.chips.kosher") },
              { icon: Flame, label: t("guests.step1.chips.shabbat") },
              { icon: Footprints, label: t("guests.step1.chips.synagogue") },
            ]}
          />
        }
      >
        {t("guests.step1.body")}
      </StepCard>
      <StepCard icon={BadgeCheck} tone="verified" step={stepLabel(2)} title={t("guests.step2.title")}>
        {t("guests.step2.body")}
      </StepCard>
      <StepCard icon={MessageCircle} tone="terracotta" step={stepLabel(3)} title={t("guests.step3.title")}>
        {t("guests.step3.body", values)}
      </StepCard>
    </Track>
  );

  const ownerSteps = (
    <Track
      title={t("owners.title")}
      lead={t("owners.lead")}
      cta={
        <Link href="/post" className={ctaButtonClass.accent}>
          <HousePlus aria-hidden="true" />
          {t("owners.cta")}
        </Link>
      }
    >
      <StepCard icon={Smartphone} step={stepLabel(1)} title={t("owners.step1.title")}>
        {t("owners.step1.body")}
      </StepCard>
      <StepCard icon={ScanSearch} tone="verified" step={stepLabel(2)} title={t("owners.step2.title")}>
        {t("owners.step2.body")}
      </StepCard>
      <StepCard icon={MessagesSquare} tone="terracotta" step={stepLabel(3)} title={t("owners.step3.title")}>
        {t("owners.step3.body")}
      </StepCard>
    </Track>
  );

  const faqKeys = ["q1", "q2", "q3", "q4"] as const;

  return (
    <div className="pb-16">
      <PageHero icon={Route} eyebrow={t("hero.eyebrow")} title={t("hero.title")} lead={t("hero.lead", values)} />

      <ContentSection aria-label={t("tabs.label")}>
        <ContentContainer>
          <TrackTabs
            label={t("tabs.label")}
            tracks={[
              { value: "guests", label: t("tabs.guests"), icon: <Users aria-hidden="true" />, content: guestSteps },
              { value: "owners", label: t("tabs.owners"), icon: <KeyRound aria-hidden="true" />, content: ownerSteps },
            ]}
          />
        </ContentContainer>
      </ContentSection>

      <ContentSection aria-labelledby="hiw-badges" className="border-y bg-secondary/40">
        <ContentContainer>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeading id="hiw-badges" title={t("badges.title")} lead={t("badges.lead")} />
            <Link
              href="/safety"
              className="inline-flex items-center gap-1.5 self-start rounded-lg font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring sm:self-auto"
            >
              {t("badges.link")}
              <ArrowRight aria-hidden="true" className="size-4 rtl:-scale-x-100" />
            </Link>
          </div>
          <VerificationBadgeGrid
            className="mt-8"
            items={[
              { icon: Smartphone, label: t("badges.phone.label"), body: t("badges.phone.body"), tag: t("badges.phone.tag") },
              // No ID or ownership documents for now (src/config/verification.ts).
              ...(documentChecksOn()
                ? [
                    { icon: IdCard, label: t("badges.id.label"), body: t("badges.id.body"), tag: t("badges.id.tag") },
                    { icon: UserRoundCheck, label: t("badges.owner.label"), body: t("badges.owner.body"), tag: t("badges.owner.tag") },
                  ]
                : []),
              {
                icon: Video,
                label: t("badges.property.label"),
                body: t("badges.property.body"),
                tag: t("badges.property.tag"),
                comingSoon: true,
              },
            ]}
          />
        </ContentContainer>
      </ContentSection>

      <ContentSection aria-labelledby="hiw-faq">
        <ContentContainer size="narrow">
          <SectionHeading id="hiw-faq" title={t("faq.title")} />
          <div className="mt-6 divide-y rounded-2xl border bg-card shadow-card">
            {faqKeys.map((key) => (
              <details key={key} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-6 [&::-webkit-details-marker]:hidden">
                  <span className="flex-1 text-balance">{t(`faq.${key}.q`, values)}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                  />
                </summary>
                <p className="px-5 pb-5 leading-relaxed text-pretty text-muted-foreground sm:px-6">
                  {t(`faq.${key}.a`, values)}
                </p>
              </details>
            ))}
          </div>
          <Link href="/help" className={ctaButtonClass.outline + " mt-6"}>
            <LifeBuoy aria-hidden="true" />
            {t("faq.more")}
          </Link>
        </ContentContainer>
      </ContentSection>

      <ContentContainer>
        <CtaBand title={t("cta.title")} body={t("cta.body")}>
          <Link href="/search" className={ctaButtonClass.onPrimary}>
            <Search aria-hidden="true" />
            {t("cta.search")}
          </Link>
          <Link href="/post" className={ctaButtonClass.onPrimaryOutline}>
            <HousePlus aria-hidden="true" />
            {t("cta.post")}
          </Link>
        </CtaBand>
      </ContentContainer>
    </div>
  );
}

function Track({
  title,
  lead,
  cta,
  children,
}: {
  title: string;
  lead: string;
  cta: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="text-center">
        <h2 className="text-h2 text-balance">{title}</h2>
        <p className="mx-auto mt-2 max-w-xl text-body text-muted-foreground">{lead}</p>
      </div>
      <ol className="mt-8 grid gap-4 md:grid-cols-3">{children}</ol>
      <div className="mt-8 flex justify-center">{cta}</div>
    </div>
  );
}
