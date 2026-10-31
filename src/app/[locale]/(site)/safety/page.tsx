import {
  ArrowRightLeft,
  Ban,
  Banknote,
  BellRing,
  Camera,
  Flag,
  Gift,
  Hand,
  IdCard,
  ImageOff,
  Landmark,
  LifeBuoy,
  Link2,
  Lock,
  Plane,
  Receipt,
  ScanSearch,
  ShieldCheck,
  Siren,
  Smartphone,
  Timer,
  TrendingDown,
  UserRoundCheck,
  Video,
} from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { CheckList } from "@/components/content/check-list";
import { ContentContainer } from "@/components/content/content-container";
import { ctaButtonClass } from "@/components/content/cta-band";
import { IconCircle } from "@/components/content/icon-circle";
import { InfoCard } from "@/components/content/info-card";
import { contentMetadata } from "@/components/content/metadata";
import { PageHero } from "@/components/content/page-hero";
import { contentTags, contentValues } from "@/components/content/rich";
import { ScamAlertList, ScamAlertListSkeleton } from "@/components/content/scam-alerts";
import { ContentSection, SectionHeading } from "@/components/content/section-heading";
import { VerificationBadgeGrid } from "@/components/content/verification-badges";
import { Link } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

const SCAM_TICKET = "/help/new-ticket?category=SCAM_REPORT";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "safety" });
  const values = contentValues(locale);
  return contentMetadata({
    locale,
    path: "/safety",
    title: t("metaTitle", values),
    description: t("metaDescription", values),
  });
}

export default async function SafetyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("safety");
  const values = contentValues(locale);
  const rich = { ...values, ...contentTags };

  const redFlags = [
    { key: "deposit", icon: Banknote },
    { key: "abroad", icon: Plane },
    { key: "paymentLinks", icon: Link2 },
    { key: "untraceable", icon: Gift },
    { key: "lowPrice", icon: TrendingDown },
    { key: "pressure", icon: Timer },
    { key: "offPlatform", icon: ArrowRightLeft },
  ] as const;

  const ownerTips = [
    { key: "overpayment", icon: Receipt },
    { key: "screenshots", icon: ImageOff },
    { key: "codes", icon: Lock },
  ] as const;

  const checks = ["photos", "price", "phrases", "contacts", "accounts", "firstListing"] as const;

  const helpSteps = [
    { key: "step1", icon: Ban },
    { key: "step2", icon: Camera },
    { key: "step3", icon: Flag },
    { key: "step4", icon: LifeBuoy },
    { key: "step5", icon: Landmark },
    { key: "step6", icon: Siren },
  ] as const;

  return (
    <div className="pb-16">
      <PageHero
        icon={ShieldCheck}
        tone="verified"
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        lead={t("hero.lead")}
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href={SCAM_TICKET} className={ctaButtonClass.accent}>
            <Flag aria-hidden="true" />
            {t("hero.report")}
          </Link>
          <a href="#alerts" className={ctaButtonClass.outline}>
            <BellRing aria-hidden="true" />
            {t("hero.alerts")}
          </a>
        </div>
      </PageHero>

      {/* The golden rule */}
      <ContentContainer className="pt-10 sm:pt-12">
        <aside
          aria-labelledby="safety-golden"
          className="flex flex-col gap-4 rounded-3xl border border-primary/15 bg-secondary p-6 text-secondary-foreground shadow-card sm:flex-row sm:items-center sm:gap-6 sm:p-8"
        >
          <IconCircle icon={Hand} size="lg" className="bg-card" />
          <div className="min-w-0">
            <h2 id="safety-golden" className="text-sm font-semibold tracking-wide text-accent-foreground">
              {t("goldenRule.title")}
            </h2>
            <p className="mt-1 text-xl font-bold text-balance text-foreground sm:text-2xl">{t("goldenRule.body")}</p>
            <p className="mt-2 font-medium">{t("goldenRule.noLinks", values)}</p>
          </div>
        </aside>
      </ContentContainer>

      {/* Current scam alerts */}
      <ContentSection id="alerts" aria-labelledby="safety-alerts" className="scroll-mt-20">
        <ContentContainer size="narrow">
          <SectionHeading id="safety-alerts" title={t("alerts.title")} lead={t("alerts.lead")} />
          <div className="mt-6">
            <Suspense fallback={<ScamAlertListSkeleton label={t("alerts.loading")} />}>
              <ScamAlertList locale={locale} />
            </Suspense>
          </div>
        </ContentContainer>
      </ContentSection>

      {/* How to spot a scam */}
      <ContentSection aria-labelledby="safety-spot" className="border-y bg-secondary/40">
        <ContentContainer>
          <SectionHeading id="safety-spot" title={t("spot.title")} lead={t("spot.lead")} />
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {redFlags.map(({ key, icon }) => (
              <li key={key}>
                <InfoCard icon={icon} tone="destructive" title={t(`spot.${key}.title`)}>
                  {t(`spot.${key}.body`, values)}
                </InfoCard>
              </li>
            ))}
            <li>
              <div className="flex h-full flex-col justify-between gap-4 rounded-2xl bg-primary p-5 text-primary-foreground shadow-card sm:p-6">
                <div>
                  <span
                    aria-hidden="true"
                    className="inline-flex size-12 items-center justify-center rounded-full bg-primary-foreground/15"
                  >
                    <Flag className="size-6" strokeWidth={1.75} />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-balance">{t("spot.report.title")}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-primary-foreground/85">{t("spot.report.body")}</p>
                </div>
                <Link href={SCAM_TICKET} className={ctaButtonClass.onPrimary + " h-11 text-sm"}>
                  {t("spot.report.cta")}
                </Link>
              </div>
            </li>
          </ul>
        </ContentContainer>
      </ContentSection>

      {/* Tips for guests */}
      <ContentSection aria-labelledby="safety-guests">
        <ContentContainer>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-14">
            <div>
              <SectionHeading id="safety-guests" title={t("guests.title")} />
              <CheckList
                className="mt-6 text-base sm:text-lg"
                items={(["tip1", "tip2", "tip3", "tip4", "tip5", "tip6"] as const).map((k) =>
                  t(`guests.${k}`, values),
                )}
              />
            </div>
            <aside
              aria-labelledby="safety-video"
              className="self-start rounded-2xl border bg-card p-6 shadow-card sm:p-7"
            >
              <IconCircle icon={Video} tone="terracotta" />
              <h3 id="safety-video" className="mt-4 text-lg font-semibold">
                {t("guests.video.title")}
              </h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{t("guests.video.body")}</p>
            </aside>
          </div>
        </ContentContainer>
      </ContentSection>

      {/* Tips for owners */}
      <ContentSection aria-labelledby="safety-owners" className="border-y bg-card">
        <ContentContainer>
          <SectionHeading id="safety-owners" title={t("owners.title")} lead={t("owners.lead")} />
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {ownerTips.map(({ key, icon }) => (
              <li key={key}>
                <InfoCard icon={icon} tone="warning" title={t(`owners.${key}.title`)} className="bg-background">
                  {t(`owners.${key}.body`, values)}
                </InfoCard>
              </li>
            ))}
          </ul>
        </ContentContainer>
      </ContentSection>

      {/* How verification works */}
      <ContentSection aria-labelledby="safety-verification">
        <ContentContainer>
          <SectionHeading id="safety-verification" title={t("verification.title")} lead={t("verification.lead")} />
          <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:gap-10">
            <div>
              <h3 className="text-lg font-semibold">{t("verification.badgesTitle")}</h3>
              <VerificationBadgeGrid
                className="mt-4 sm:grid-cols-1 xl:grid-cols-2"
                items={[
                  { icon: Smartphone, label: t("badges.phone.label"), body: t("badges.phone.body") },
                  { icon: IdCard, label: t("badges.id.label"), body: t("badges.id.body") },
                  { icon: UserRoundCheck, label: t("badges.owner.label"), body: t("badges.owner.body") },
                  {
                    icon: Video,
                    label: t("badges.property.label"),
                    body: t("badges.property.body"),
                    tag: t("badges.property.soon"),
                    comingSoon: true,
                  },
                ]}
              />
            </div>
            <div className="self-start rounded-2xl border bg-card p-6 shadow-card sm:p-7">
              <div className="flex items-center gap-3">
                <IconCircle icon={ScanSearch} tone="verified" />
                <h3 className="text-lg font-semibold text-balance">{t("verification.checksTitle")}</h3>
              </div>
              <p className="mt-3 leading-relaxed text-muted-foreground">{t("verification.checksLead")}</p>
              <CheckList
                className="mt-5"
                items={checks.map((k) => t(`verification.checks.${k}`))}
              />
            </div>
          </div>
        </ContentContainer>
      </ContentSection>

      {/* If something goes wrong */}
      <ContentSection aria-labelledby="safety-help" className="border-t bg-secondary/40">
        <ContentContainer>
          <SectionHeading id="safety-help" title={t("help.title")} lead={t("help.lead")} />
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {helpSteps.map(({ key, icon }, index) => (
              <li key={key} className="flex gap-4 rounded-2xl border bg-card p-5 shadow-card sm:p-6">
                <div className="relative shrink-0">
                  <IconCircle icon={icon} tone={index < 4 ? "primary" : "wine"} />
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -end-1 inline-flex size-6 items-center justify-center rounded-full bg-terracotta text-xs font-bold text-terracotta-foreground ring-2 ring-card"
                  >
                    {index + 1}
                  </span>
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-balance">{t(`help.${key}.title`)}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-pretty text-muted-foreground sm:text-[0.9375rem]">
                    {t.rich(`help.${key}.body`, rich)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href={SCAM_TICKET} className={ctaButtonClass.accent}>
              <Flag aria-hidden="true" />
              {t("help.cta")}
            </Link>
            <Link href="/help" className={ctaButtonClass.outline}>
              <LifeBuoy aria-hidden="true" />
              {t("help.helpCenter")}
            </Link>
          </div>
        </ContentContainer>
      </ContentSection>
    </div>
  );
}
