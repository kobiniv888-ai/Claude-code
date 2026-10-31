import { ChevronRight, LifeBuoy, Mail, MessageSquarePlus, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/common/container";
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

  const links = [
    { href: "/help", icon: LifeBuoy, key: "help" },
    { href: "/safety", icon: ShieldCheck, key: "safety" },
  ] as const;

  return (
    <div className="pb-16">
      <section className="relative isolate overflow-hidden border-b bg-linear-to-b from-secondary/80 via-secondary/30 to-background">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -end-24 -z-10 size-72 rounded-full bg-terracotta/10 blur-3xl sm:size-96"
        />
        <Container className="max-w-6xl py-10 sm:py-14">
          <span
            aria-hidden="true"
            className="mb-5 flex size-14 items-center justify-center rounded-full bg-card text-primary shadow-card"
          >
            <Mail className="size-7" />
          </span>
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">{t("hero.title")}</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
            {t("hero.lead", { siteName: siteName(locale) })}
          </p>
        </Container>
      </section>

      <Container className="mt-8 grid max-w-6xl gap-8 sm:mt-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {shabbat.active ? (
            <ShabbatPauseNotice endsAt={shabbat.endsAt} />
          ) : (
            <section aria-labelledby="contact-form-title" className="rounded-3xl border bg-card p-4 shadow-card sm:p-8">
              <h2 id="contact-form-title" className="mb-6 text-xl font-bold tracking-tight">
                {t("form.title")}
              </h2>
              <ContactForm
                defaultName={viewer?.name ?? ""}
                defaultEmail={viewer && !viewer.emailIsPlaceholder ? viewer.email : ""}
              />
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-4" aria-label={t("aside.label")}>
          {viewer ? (
            <section className="rounded-2xl border border-primary/20 bg-secondary p-5 text-secondary-foreground">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <MessageSquarePlus aria-hidden="true" className="size-4" />
                {t("aside.signedInTitle")}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-pretty">{t("aside.signedInBody")}</p>
              <Link
                href="/help/new-ticket"
                className="mt-3 inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {t("aside.signedInCta")}
              </Link>
            </section>
          ) : null}

          <section className="rounded-2xl border bg-card p-5 shadow-card">
            <h2 className="text-base font-semibold">{t("aside.emailTitle")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">{t("aside.emailBody")}</p>
            <a
              href={`mailto:${siteConfig.supportEmail}`}
              className="mt-3 inline-flex max-w-full items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm font-semibold text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Mail aria-hidden="true" className="size-4 shrink-0" />
              <Ltr className="truncate">{siteConfig.supportEmail}</Ltr>
            </a>
          </section>

          <nav aria-label={t("aside.moreLabel")} className="rounded-2xl border bg-card p-2 shadow-card">
            <ul>
              {links.map(({ href, icon: Icon, key }) => (
                <li key={key}>
                  <Link
                    href={href}
                    className="group flex items-center gap-3 rounded-xl p-3 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{t(`aside.${key}.title`)}</span>
                      <span className="block text-xs text-muted-foreground">{t(`aside.${key}.body`)}</span>
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <p className="rounded-2xl border border-terracotta/30 bg-accent p-4 text-sm leading-relaxed text-pretty text-accent-foreground">
            {t.rich("aside.scam", {
              link: (chunks) => (
                <Link
                  href="/help/new-ticket?category=SCAM_REPORT"
                  className="font-semibold underline underline-offset-4 hover:no-underline"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </aside>
      </Container>
    </div>
  );
}
