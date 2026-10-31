import { ArrowRight, Scale } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ContentContainer } from "@/components/content/content-container";
import { LawyerReviewNotice } from "@/components/content/lawyer-review-notice";
import { legalDocKeys, legalDocs } from "@/components/content/legal-docs";
import { contentMetadata } from "@/components/content/metadata";
import { PageHero } from "@/components/content/page-hero";
import { contentValues } from "@/components/content/rich";
import { Link } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  const values = contentValues(locale);
  return contentMetadata({
    locale,
    path: "/legal",
    title: t("index.title"),
    description: t("index.metaDescription", values),
  });
}

export default async function LegalIndexPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");
  const values = contentValues(locale);

  return (
    <div className="pb-16">
      <PageHero icon={Scale} eyebrow={t("common.eyebrow")} title={t("index.title")} lead={t("index.lead", values)} size="compact">
        <LawyerReviewNotice title={t("common.draftTitle")}>{t("common.draftBody", values)}</LawyerReviewNotice>
      </PageHero>
      <ContentContainer size="narrow" className="pt-10 sm:pt-12">
        <ul className="grid gap-4 sm:grid-cols-2">
          {legalDocKeys.map((key) => {
            const Icon = legalDocs[key].icon;
            return (
              <li key={key}>
                <Link
                  href={legalDocs[key].path}
                  className="group flex h-full items-start gap-4 rounded-2xl border bg-card p-5 shadow-card transition-shadow hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-6"
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                  >
                    <Icon className="size-6" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-lg font-semibold group-hover:text-primary">
                      {t(`nav.${key}`)}
                      <ArrowRight aria-hidden="true" className="size-4 shrink-0 rtl:-scale-x-100" />
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                      {t(`${key}.summary`, values)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </ContentContainer>
    </div>
  );
}
