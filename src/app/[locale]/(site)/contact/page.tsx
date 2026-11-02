import { LifeBuoy, Mail, MessageSquarePlus, ShieldAlert, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/common/container";
import { ChevronEnd } from "@/components/common/directional-icon";
import { buttonStyles } from "@/components/ds/button";
import { IconCircle } from "@/components/ds/icon-circle";
import { Ltr } from "@/components/common/ltr";
import { ContactForm } from "@/components/help/contact-form";
import { ShabbatPauseNotice } from "@/components/tickets/shabbat-pause-notice";
import { siteConfig } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { pageMetadata, siteName } from "@/lib/seo";
import { isShabbatModeActive } from "@/lib/settings";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contactPage.meta" });
  return pageMetadata({
    locale,
    path: "/contact",
    title: t("title"),
    description: t("description", { siteName: siteName(locale) }),
  });
}

export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contactPage");
  const [user, shabbat] = await Promise.all([getCurrentUser(), isShabbatModeActive()]);
  const viewer = user && user.twoFactorVerified ? user : null;

  const rows = [
    { href: "/help", icon: LifeBuoy, tone: "navy", title: t("aside.help.title"), body: t("aside.help.body") },
    { href: "/safety", icon: ShieldCheck, tone: "green", title: t("aside.safety.title"), body: t("aside.safety.body") },
  ] as const;
  const rowClass =
    "group flex min-h-16 items-center gap-3 rounded-input p-3 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <div className="pb-16">
      <section className="relative isolate overflow-hidden bg-linear-to-b from-navy-soft to-background">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -end-24 -z-10 size-72 rounded-full bg-coral/10 blur-3xl sm:size-96"
        />
        <Container className="flex max-w-6xl items-start gap-4 pt-8 pb-6 sm:pt-12 sm:pb-8">
          <IconCircle icon={Mail} tone="navy" size="lg" className="bg-card shadow-raised" />
          <div className="min-w-0">
            <h1 className="text-h1 text-balance text-foreground">{t("hero.title")}</h1>
            <p className="mt-1.5 max-w-2xl text-body text-pretty text-muted-foreground">
              {t("hero.lead", { siteName: siteName(locale) })}
            </p>
          </div>
        </Container>
      </section>

      <Container className="mt-2 grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-8">
        <div className="grid min-w-0 content-start gap-4">
          {/* The urgent path first: scam reports are handled before anything else. */}
          <p className="flex items-start gap-3 rounded-card border border-coral/40 bg-coral-soft p-4 text-small text-pretty text-foreground">
            <IconCircle icon={ShieldAlert} tone="coral-solid" size="sm" />
            <span className="min-w-0 self-center">
              {t.rich("aside.scam", {
                link: (chunks) => (
                  <Link
                    href="/help/new-ticket?category=SCAM_REPORT"
                    className="font-semibold text-coral-strong underline underline-offset-4 hover:no-underline"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </span>
          </p>

          {shabbat.active ? (
            <ShabbatPauseNotice endsAt={shabbat.endsAt} />
          ) : (
            <section
              aria-labelledby="contact-form-title"
              className="rounded-card bg-card p-4 shadow-raised ring-1 ring-foreground/5 sm:p-8"
            >
              <h2 id="contact-form-title" className="mb-5 text-h3">
                {t("form.title")}
              </h2>
              <ContactForm
                defaultName={viewer?.name ?? ""}
                defaultEmail={viewer && !viewer.emailIsPlaceholder ? viewer.email : ""}
              />
            </section>
          )}
        </div>

        <aside className="grid content-start gap-4" aria-label={t("aside.label")}>
          {viewer ? (
            <section className="rounded-card bg-navy-soft p-5 text-foreground">
              <h2 className="flex items-center gap-2.5 text-body font-semibold">
                <IconCircle icon={MessageSquarePlus} tone="navy-solid" size="sm" />
                {t("aside.signedInTitle")}
              </h2>
              <p className="mt-2 text-small text-pretty text-muted-foreground">{t("aside.signedInBody")}</p>
              <Link href="/help/new-ticket" className={buttonStyles({ variant: "primary", size: "sm", className: "mt-3" })}>
                {t("aside.signedInCta")}
              </Link>
            </section>
          ) : null}

          <nav aria-label={t("aside.moreLabel")} className="rounded-card border bg-card p-2">
            <ul>
              <li>
                <a href={`mailto:${siteConfig.supportEmail}`} className={rowClass}>
                  <IconCircle icon={Mail} tone="coral" size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-small font-semibold">{t("aside.emailTitle")}</span>
                    <Ltr className="block truncate text-small text-primary">{siteConfig.supportEmail}</Ltr>
                  </span>
                </a>
              </li>
              {rows.map(({ href, icon, tone, title, body }) => (
                <li key={href}>
                  <Link href={href} className={rowClass}>
                    <IconCircle icon={icon} tone={tone} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-small font-semibold">{title}</span>
                      <span className="block text-caption text-muted-foreground">{body}</span>
                    </span>
                    <ChevronEnd aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      </Container>
    </div>
  );
}
