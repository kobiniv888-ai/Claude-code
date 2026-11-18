import {
  ArrowRightLeft,
  Ban,
  BadgeCheck,
  Bot,
  Banknote,
  BellRing,
  Camera,
  Flag,
  Gift,
  Globe,
  Hand,
  HandCoins,
  HeartHandshake,
  IdCard,
  ImageOff,
  Landmark,
  LifeBuoy,
  Link2,
  Lock,
  MessageSquareQuote,
  Plane,
  Receipt,
  ScanSearch,
  ShieldCheck,
  Siren,
  Smartphone,
  SquareTerminal,
  Timer,
  TrendingDown,
  UserRoundCheck,
  Users,
  Video,
} from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { CheckList } from "@/components/content/check-list";
import { ContentContainer } from "@/components/content/content-container";
import { IconAccordion } from "@/components/content/icon-accordion";
import { contentMetadata } from "@/components/content/metadata";
import { contentTags, contentValues } from "@/components/content/rich";
import { ScamAlertList, ScamAlertListSkeleton } from "@/components/content/scam-alerts";
import { VerificationBadgeGrid } from "@/components/content/verification-badges";
import { buttonStyles } from "@/components/ds/button";
import { chipStyles } from "@/components/ds/chip";
import { IconCircle } from "@/components/ds/icon-circle";
import { EmergencyContacts } from "@/components/jewish-life/emergency-contacts";
import type { AppLocale } from "@/config/site";
import { documentChecksOn } from "@/config/verification";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { SCAM_REPORT_PATH } from "@/lib/reports/scam";
import { siteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";

/** The one domain the site lives on (SECURITY_REPORT 14.4.b, 19.j): from SITE_URL, never hard-coded. */
function siteDomain(): string {
  try {
    return new URL(siteUrl()).host;
  } catch {
    return "";
  }
}

type Props = { params: Promise<{ locale: string }> };

const SCAM_TICKET = SCAM_REPORT_PATH;

/** Sections sit under the sticky header and the "on this page" chips. */
const anchorOffset = "scroll-mt-[calc(var(--header-height)+4.5rem)]";

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

function Section({
  id,
  title,
  lead,
  children,
  className,
}: {
  id: string;
  title: string;
  lead?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn(anchorOffset, "py-8 sm:py-12", className)}>
      <ContentContainer>
        <h2 id={`${id}-title`} className="text-h2 text-balance">
          {title}
        </h2>
        {lead ? <p className="mt-1.5 max-w-2xl text-body text-pretty text-muted-foreground">{lead}</p> : null}
        <div className="mt-5 sm:mt-6">{children}</div>
      </ContentContainer>
    </section>
  );
}

/**
 * /safety — the Safety Center. Phones see one idea per row: red flags and owner tips are short
 * rows that open on tap, and "on this page" chips jump between sections. Every text and function of
 * the earlier page is kept: the urgent scam report, current scam alerts, tips, verification and the
 * steps to take after a scam. Round 3: the emergency numbers (the same cards as on the Jewish life
 * page) are here too, at #emergency, which the menu's "Emergency numbers" row opens.
 */
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
    // SECURITY_REPORT 14.3.e: the Booking.com lesson (malware, fake CAPTCHA pages, shared accounts).
    { key: "commands", icon: SquareTerminal },
    { key: "captcha", icon: Bot },
    { key: "sharing", icon: Users },
  ] as const;

  // SECURITY_REPORT 19.j: what the trust & safety promise is, in one place.
  const trustItems = [
    { key: "pledge", icon: HeartHandshake },
    { key: "payOnArrival", icon: HandCoins },
    { key: "reportButtons", icon: Flag },
    { key: "verifiedPhones", icon: BadgeCheck },
    { key: "realReviews", icon: MessageSquareQuote },
    { key: "privacy", icon: Lock },
    { key: "onlyDomain", icon: Globe },
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

  const jump = [
    { id: "emergency", label: t("jump.emergency") },
    { id: "alerts", label: t("jump.alerts") },
    { id: "spot", label: t("jump.spot") },
    { id: "guests", label: t("jump.guests") },
    { id: "owners", label: t("jump.owners") },
    { id: "trust", label: t("jump.trust") },
    { id: "verification", label: t("jump.verification") },
    { id: "if-scammed", label: t("jump.help") },
  ];

  return (
    <div className="pb-16">
      {/* Hero: the promise and the urgent way out */}
      <section className="relative isolate overflow-hidden bg-linear-to-b from-primary-tint to-background">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -end-24 -z-10 size-72 rounded-full bg-primary/10 blur-3xl sm:size-96"
        />
        <ContentContainer className="pt-8 pb-6 sm:pt-14 sm:pb-10">
          <IconCircle icon={ShieldCheck} tone="green" size="lg" className="mb-4 bg-card shadow-raised" />
          <p className="text-small font-semibold text-success">{t("hero.eyebrow")}</p>
          <h1 className="mt-1 max-w-3xl text-h1 text-balance text-foreground">{t("hero.title")}</h1>
          <p className="mt-2 max-w-2xl text-body text-pretty text-muted-foreground">{t("hero.lead")}</p>
          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
            <Link href={SCAM_TICKET} className={buttonStyles({ variant: "accent", size: "lg" })}>
              <Flag aria-hidden="true" />
              {t("hero.report")}
            </Link>
            <a href="#alerts" className={buttonStyles({ variant: "outline", size: "lg" })}>
              <BellRing aria-hidden="true" />
              {t("hero.alerts")}
            </a>
          </div>
        </ContentContainer>
      </section>

      {/* On this page */}
      <nav
        aria-label={t("jump.label")}
        data-follow-header=""
        className="sticky top-(--header-height) z-(--z-sticky) border-b border-border/70 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/85"
      >
        <ContentContainer>
          <ul className="-mx-gutter flex gap-2 overflow-x-auto px-gutter py-2.5 scrollbar-none sm:mx-0 sm:px-0">
            {jump.map(({ id, label }) => (
              <li key={id}>
                <a href={`#${id}`} className={chipStyles({ size: "sm" })}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </ContentContainer>
      </nav>

      {/* The golden rule */}
      <ContentContainer className="pt-6 sm:pt-10">
        <aside
          aria-labelledby="safety-golden"
          className="flex flex-col gap-4 rounded-card bg-primary-tint p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-7"
        >
          <IconCircle icon={Hand} tone="navy-solid" size="lg" />
          <div className="min-w-0">
            <h2 id="safety-golden" className="text-small font-semibold text-primary-text">
              {t("goldenRule.title")}
            </h2>
            <p className="mt-1 text-h3 text-balance text-foreground">{t("goldenRule.body")}</p>
            <p className="mt-2 text-small font-medium text-foreground/80">{t("goldenRule.noLinks", values)}</p>
          </div>
        </aside>
      </ContentContainer>

      {/* Emergency numbers: tap a card to call (admins add embassy and community numbers) */}
      <Section id="emergency" title={t("emergency.title")} lead={t("emergency.lead")} className="bg-muted/40">
        <EmergencyContacts locale={locale as AppLocale} />
      </Section>

      {/* Current scam alerts */}
      <Section id="alerts" title={t("alerts.title")} lead={t("alerts.lead")}>
        <div className="max-w-3xl">
          <Suspense fallback={<ScamAlertListSkeleton label={t("alerts.loading")} />}>
            <ScamAlertList locale={locale} />
          </Suspense>
        </div>
      </Section>

      {/* How to spot a scam: one line each, the detail on tap */}
      <Section id="spot" title={t("spot.title")} lead={t("spot.lead")} className="bg-muted/40">
        <IconAccordion
          className="lg:grid-cols-2"
          items={redFlags.map(({ key, icon }) => ({
            id: key,
            icon: <IconCircle icon={icon} tone="coral" size="sm" />,
            title: t(`spot.${key}.title`),
            body: t(`spot.${key}.body`, values),
          }))}
        />
        <div className="mt-4 flex flex-col gap-4 rounded-card bg-primary p-5 text-primary-foreground sm:flex-row sm:items-center sm:p-6">
          <IconCircle tone="glass" size="md" className="bg-primary-foreground/15 text-primary-foreground shadow-none">
            <Flag />
          </IconCircle>
          <div className="min-w-0 flex-1">
            <h3 className="text-h3 text-balance">{t("spot.report.title")}</h3>
            <p className="mt-0.5 text-small opacity-85">{t("spot.report.body")}</p>
          </div>
          <Link
            href={SCAM_TICKET}
            className={buttonStyles({ variant: "outline", size: "md", className: "border-transparent text-primary-text" })}
          >
            {t("spot.report.cta")}
          </Link>
        </div>
      </Section>

      {/* Tips for guests */}
      <Section id="guests" title={t("guests.title")}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
          <CheckList
            className="rounded-card border bg-card p-5 text-body sm:p-6"
            items={(["tip1", "tip2", "tip3", "tip4", "tip5", "tip6"] as const).map((k) => t(`guests.${k}`, values))}
          />
          <aside aria-labelledby="safety-video" className="self-start rounded-card bg-primary-tint p-5 sm:p-6">
            <IconCircle icon={Video} tone="coral-solid" size="md" />
            <h3 id="safety-video" className="mt-3 text-h3">
              {t("guests.video.title")}
            </h3>
            <p className="mt-1.5 text-small leading-relaxed text-pretty text-foreground/80">{t("guests.video.body")}</p>
          </aside>
        </div>
      </Section>

      {/* Tips for owners */}
      <Section id="owners" title={t("owners.title")} lead={t("owners.lead")} className="bg-muted/40">
        <IconAccordion
          className="lg:grid-cols-3"
          items={ownerTips.map(({ key, icon }) => ({
            id: key,
            icon: <IconCircle icon={icon} tone="amber" size="sm" />,
            title: t(`owners.${key}.title`),
            body: t(`owners.${key}.body`, values),
          }))}
        />
      </Section>

      {/* Our promises (SECURITY_REPORT 19.j) */}
      <Section id="trust" title={t("trust.title")} lead={t("trust.lead")}>
        <IconAccordion
          className="lg:grid-cols-3"
          items={trustItems.map(({ key, icon }) => ({
            id: `trust-${key}`,
            icon: <IconCircle icon={icon} tone="green" size="sm" />,
            title: t(`trust.${key}.title`),
            body: t(`trust.${key}.body`, { ...values, domain: siteDomain() }),
          }))}
        />
      </Section>

      {/* How verification works */}
      <Section id="verification" title={t("verification.title")} lead={t("verification.lead")}>
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
          <div>
            <h3 className="text-h3">{t("verification.badgesTitle")}</h3>
            <VerificationBadgeGrid
              className="mt-4 sm:grid-cols-1 xl:grid-cols-2"
              items={[
                { icon: Smartphone, label: t("badges.phone.label"), body: t("badges.phone.body") },
                // No ID or ownership documents for now (src/config/verification.ts).
                ...(documentChecksOn()
                  ? [
                      { icon: IdCard, label: t("badges.id.label"), body: t("badges.id.body") },
                      { icon: UserRoundCheck, label: t("badges.owner.label"), body: t("badges.owner.body") },
                    ]
                  : []),
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
          <div className="self-start rounded-card border bg-card p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <IconCircle icon={ScanSearch} tone="green" size="md" />
              <h3 className="text-h3 text-balance">{t("verification.checksTitle")}</h3>
            </div>
            <p className="mt-3 text-small leading-relaxed text-pretty text-muted-foreground">{t("verification.checksLead")}</p>
            <CheckList className="mt-4 text-small" items={checks.map((k) => t(`verification.checks.${k}`))} />
          </div>
        </div>
      </Section>

      {/* If something goes wrong: numbered steps */}
      <Section id="if-scammed" title={t("help.title")} lead={t("help.lead")} className="bg-muted/40">
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {helpSteps.map(({ key, icon }, index) => (
            <li
              key={key}
              className={cn("flex flex-col gap-3 rounded-card p-5", index < 4 ? "bg-primary-tint" : "bg-primary-tint")}
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-11 items-center justify-center rounded-xl bg-card text-h3 font-extrabold text-primary-text shadow-sm"
                >
                  {formatNumber(index + 1, locale)}
                </span>
                <IconCircle icon={icon} tone={index < 4 ? "navy" : "coral"} size="sm" className="bg-card" />
              </div>
              <div className="min-w-0">
                <h3 className="text-h3 text-balance">{t(`help.${key}.title`)}</h3>
                <p className="mt-1 text-small leading-relaxed text-pretty text-foreground/80">{t.rich(`help.${key}.body`, rich)}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
          <Link href={SCAM_TICKET} className={buttonStyles({ variant: "accent", size: "lg" })}>
            <Flag aria-hidden="true" />
            {t("help.cta")}
          </Link>
          <Link href="/help" className={buttonStyles({ variant: "outline", size: "lg" })}>
            <LifeBuoy aria-hidden="true" />
            {t("help.helpCenter")}
          </Link>
        </div>
      </Section>
    </div>
  );
}
