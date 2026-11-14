import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BayitMark } from "@/components/brand/logo";
import { ContentContainer } from "@/components/content/content-container";
import { contentMetadata } from "@/components/content/metadata";
import { contentTags, contentValues } from "@/components/content/rich";
import { ContentSection, SectionHeading } from "@/components/content/section-heading";
import { buttonStyles } from "@/components/ds/button";
import { cardStyles } from "@/components/ds/card";
import { SpriteIcon } from "@/components/ds/sprite-icons";
import type { SpriteIconName } from "@/components/ds/sprite-icons.generated";
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

const STEPS = [
  { key: "step1", icon: "search" },
  { key: "step2", icon: "calendar-check" },
  { key: "step3", icon: "wallet" },
] as const satisfies readonly { key: string; icon: SpriteIconName }[];

const VALUES = [
  { key: "trust", icon: "shield-check" },
  { key: "community", icon: "heart-handshake" },
  { key: "jewishFriendly", icon: "sparkles" },
  { key: "direct", icon: "hand-coins" },
  { key: "languages", icon: "languages" },
] as const satisfies readonly { key: string; icon: SpriteIconName }[];

const HIGHLIGHTS = ["a", "b", "c", "d", "e"] as const;

/**
 * About (brief 5.10): the founder story first — the founder's Hebrew and English drafts word for
 * word, with the name left as a visible placeholder until the founder adds it (OWNER_TODO.md) —
 * then what Bayit is, how booking works, what we believe in and how to reach us.
 */
export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");
  const values = contentValues(locale);
  const rich = { ...values, ...contentTags };

  return (
    <div className="pb-section">
      {/* Our story — linked as "הסיפור שלנו" from the footer and the menu. */}
      <article id="story" aria-labelledby="about-story-title" className="scroll-mt-24 border-b border-border pt-8 pb-section sm:pt-14">
        <ContentContainer size="prose">
          <p className="inline-flex items-center gap-2 rounded-full bg-primary-tint px-3 py-1 text-caption font-medium text-primary-text ring-1 ring-primary-tint-border">
            <SpriteIcon name="quote" className="size-3.5" />
            {t("story.eyebrow")}
          </p>
          <h1 id="about-story-title" className="mt-3 text-h1 text-balance text-foreground">
            {t("story.title")}
          </h1>
          <div className="mt-5 space-y-4 text-body text-pretty text-foreground sm:text-lg sm:leading-relaxed">
            <p>{t("story.p1")}</p>
            <p>{t("story.p2")}</p>
            <p>{t("story.p3")}</p>
            <p>{t("story.p4")}</p>
          </div>
          {/* The brand story: one calm line with the mark, never in a colored block of text. */}
          <p className="mt-6 flex items-center gap-3 rounded-card border border-border bg-card p-3 text-body text-pretty text-foreground sm:p-4">
            <span
              aria-hidden="true"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-[0.875rem] bg-primary text-white"
            >
              <BayitMark className="h-6 w-auto" />
            </span>
            {t("story.p5")}
          </p>
          {/* SECURITY_REPORT 19.c/19.e: the founder's name from FOUNDER_DISPLAY_NAME (not committed); until
              it is set, "the Bayit team" — never a bracketed placeholder. */}
          <p className="mt-6 text-body font-medium text-foreground" dir="auto">
            {process.env.FOUNDER_DISPLAY_NAME?.trim() || t("story.signatureTeam")}
          </p>
        </ContentContainer>
      </article>

      {/* What Bayit is */}
      <ContentSection aria-labelledby="about-what">
        <ContentContainer>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
            <div className="max-w-3xl">
              <SectionHeading id="about-what" title={t("what.title", values)} />
              <div className="mt-4 space-y-3 text-body text-pretty text-foreground/85">
                <p>{t("what.p1", values)}</p>
                <p>{t("what.p2", values)}</p>
                <p>{t("what.p3", values)}</p>
              </div>
            </div>
            <aside aria-labelledby="about-highlights" className={cardStyles({ padding: "lg", className: "self-start" })}>
              <h3 id="about-highlights" className="text-body font-semibold">
                {t("what.highlights.title")}
              </h3>
              <ul className="mt-3 grid gap-2.5 text-small text-foreground/85">
                {HIGHLIGHTS.map((key) => (
                  <li key={key} className="flex items-start gap-2">
                    <SpriteIcon name="check" className="mt-0.5 size-4 shrink-0 text-primary-text" />
                    <span className="min-w-0 text-pretty">{t(`what.highlights.${key}`)}</span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </ContentContainer>
      </ContentSection>

      {/* How it works (summary) */}
      <ContentSection aria-labelledby="about-how" className="border-t border-border">
        <ContentContainer>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeading id="about-how" title={t("how.title")} lead={t("how.lead")} />
            <Link
              href="/how-it-works"
              className="inline-flex min-h-11 items-center gap-1 self-start rounded-full text-small font-medium text-primary-text outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 sm:self-auto"
            >
              {t("how.link")}
              <SpriteIcon name="arrow-right" className="size-4 rtl:-scale-x-100" />
            </Link>
          </div>
          <ol className="mt-5 grid gap-3 md:grid-cols-3">
            {STEPS.map(({ key, icon }, index) => (
              <li key={key} className={cardStyles({ padding: "lg" })}>
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary-text"
                  >
                    <SpriteIcon name={icon} className="size-5" />
                  </span>
                  <span className="text-caption text-muted-foreground">{t("how.stepLabel", { number: String(index + 1) })}</span>
                </div>
                <h3 className="mt-3 text-body font-semibold text-balance">{t(`how.${key}.title`)}</h3>
                <p className="mt-1 text-small text-pretty text-muted-foreground">{t(`how.${key}.body`)}</p>
              </li>
            ))}
          </ol>
        </ContentContainer>
      </ContentSection>

      {/* Values */}
      <ContentSection aria-labelledby="about-values" className="border-t border-border">
        <ContentContainer>
          <SectionHeading id="about-values" title={t("values.title")} lead={t("values.lead")} />
          <ul className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {VALUES.map(({ key, icon }) => (
              <li key={key} className="flex items-start gap-3">
                <SpriteIcon name={icon} className="mt-0.5 size-5 shrink-0 text-primary-text" />
                <div className="min-w-0">
                  <h3 className="text-body font-semibold text-balance">{t(`values.${key}.title`)}</h3>
                  <p className="mt-0.5 text-small text-pretty text-muted-foreground">{t(`values.${key}.body`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </ContentContainer>
      </ContentSection>

      {/* How to reach us */}
      <ContentSection aria-labelledby="about-contact" className="border-t border-border">
        <ContentContainer>
          <SectionHeading id="about-contact" title={t("contact.title")} lead={t("contact.lead")} />
          <ul className="mt-5 grid gap-3 md:grid-cols-3">
            <ContactCard icon="life-buoy" title={t("contact.help.title")} body={t("contact.help.body")} href="/help" cta={t("contact.help.cta")} />
            <ContactCard icon="messages-square" title={t("contact.form.title")} body={t("contact.form.body")} href="/contact" cta={t("contact.form.cta")} />
            <ContactCard icon="mail" title={t("contact.email.title")} body={t.rich("contact.email.body", rich)} />
          </ul>
        </ContentContainer>
      </ContentSection>

      {/* Start */}
      <ContentContainer>
        <div className="flex flex-col gap-4 rounded-card bg-primary-tint p-5 ring-1 ring-primary-tint-border sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <h2 className="text-h2 text-balance text-foreground">{t("cta.title")}</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/search" className={buttonStyles({ variant: "primary", className: "grow sm:grow-0" })}>
              <SpriteIcon name="search" />
              {t("cta.search")}
            </Link>
            <Link href="/post" className={buttonStyles({ variant: "outline", className: "grow bg-card sm:grow-0" })}>
              <SpriteIcon name="key-round" />
              {t("cta.post")}
            </Link>
          </div>
        </div>
      </ContentContainer>
    </div>
  );
}

function ContactCard({
  icon,
  title,
  body,
  href,
  cta,
}: {
  icon: SpriteIconName;
  title: string;
  body: React.ReactNode;
  href?: string;
  cta?: string;
}) {
  return (
    <li className={cardStyles({ padding: "lg", className: "flex flex-col" })}>
      <div className="flex items-center gap-3">
        <SpriteIcon name={icon} className="size-5 shrink-0 text-primary-text" />
        <h3 className="text-body font-semibold">{title}</h3>
      </div>
      <p className="mt-1.5 text-small text-pretty text-muted-foreground">{body}</p>
      {href && cta ? (
        <Link href={href} className={buttonStyles({ variant: "secondary", className: "mt-4 w-full" })}>
          {cta}
        </Link>
      ) : null}
    </li>
  );
}
