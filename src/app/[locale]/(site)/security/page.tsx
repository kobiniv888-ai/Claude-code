import { Ban, Bug, CircleCheck, Info, ListChecks, Mail, Scale, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { Ltr } from "@/components/common/ltr";
import { CheckList } from "@/components/content/check-list";
import { ContentContainer } from "@/components/content/content-container";
import { IconCircle } from "@/components/content/icon-circle";
import { LawyerReviewNotice } from "@/components/content/lawyer-review-notice";
import { contentMetadata } from "@/components/content/metadata";
import { PageHero } from "@/components/content/page-hero";
import { contentTags, contentValues } from "@/components/content/rich";
import { Link } from "@/i18n/navigation";
import { SECURITY_PAGE_PATH, SECURITY_TXT_PATH, securityContactEmail } from "@/lib/security/security-txt";

type Props = { params: Promise<{ locale: string }> };

/** The support form, opened on "Technical problem" (only while no security address is set: a codespace). */
const TECHNICAL_TICKET = "/help/new-ticket?category=TECHNICAL";

const linkClass =
  "font-medium text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "securityPolicy" });
  const values = contentValues(locale);
  return contentMetadata({ locale, path: SECURITY_PAGE_PATH, title: t("metaTitle", values), description: t("metaDescription", values) });
}

function Section({ id, icon, title, children }: { id: string; icon: typeof ShieldCheck; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="py-6 sm:py-8">
      <div className="flex items-center gap-3">
        <IconCircle icon={icon} tone="primary" size="sm" />
        <h2 id={`${id}-title`} className="text-h3 text-balance text-foreground">
          {title}
        </h2>
      </div>
      <div className="mt-4 text-body text-pretty text-foreground/90">{children}</div>
    </section>
  );
}

/**
 * /security — "Report a security problem" (SECURITY_REPORT 18.2; the Policy of
 * /.well-known/security.txt, 18.1): what to report, how, what happens next, the promise to
 * good-faith researchers (safe harbour, a draft for the lawyer) and what not to do. The address is
 * the private hosting setting SECURITY_CONTACT_EMAIL (never in the repository); without it (a
 * codespace) the page sends reporters to the support form instead. Linked from the footer.
 */
export default async function SecurityPolicyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("securityPolicy");
  const values = contentValues(locale);
  const address = securityContactEmail(process.env);
  const rich = {
    ...values,
    ...contentTags,
    address: address ?? "",
    email: (chunks: ReactNode) => (
      <a href={`mailto:${address}`} className={linkClass}>
        <Ltr>{chunks}</Ltr>
      </a>
    ),
    ticket: (chunks: ReactNode) => (
      <Link href={TECHNICAL_TICKET} className={linkClass}>
        {chunks}
      </Link>
    ),
    file: (chunks: ReactNode) => (
      // A plain link: the file lives outside the language folders.
      <a href={SECURITY_TXT_PATH} className={linkClass}>
        <Ltr>{chunks}</Ltr>
      </a>
    ),
  };

  const reportItems = ["data", "accounts", "limits", "code", "secrets"] as const;
  const notItems = ["scams", "account", "scanners"] as const;
  const includeItems = ["what", "steps", "impact", "contact"] as const;
  const nextItems = ["confirm", "check", "fix", "reward"] as const;
  const dontItems = ["data", "disrupt", "people", "real", "public"] as const;

  return (
    <div className="pb-16">
      <PageHero icon={ShieldCheck} eyebrow={t("eyebrow")} title={t("title")} lead={t("lead", values)} />
      <ContentContainer size="prose" className="pt-2">
        {/* How to report first: it is what a researcher came for. */}
        <section aria-labelledby="how-title" className="mt-6 rounded-2xl border bg-card p-5 text-card-foreground shadow-card sm:p-6">
          <div className="flex items-center gap-3">
            <IconCircle icon={Mail} tone="primary" size="sm" />
            <h2 id="how-title" className="text-h3 text-balance">
              {t("how.title")}
            </h2>
          </div>
          <p className="mt-4 text-body font-medium wrap-break-word">{address ? t.rich("how.email", rich) : t.rich("how.noEmail", rich)}</p>
          <p className="mt-4 text-small font-semibold text-foreground">{t("how.include")}</p>
          <CheckList className="mt-2" items={includeItems.map((key) => t(`how.items.${key}`))} />
          <p className="mt-4 text-small text-muted-foreground">{t("how.languages")}</p>
          <p className="mt-1 text-small text-muted-foreground">{t("how.privacy")}</p>
        </section>

        <Section id="report" icon={Bug} title={t("report.title")}>
          <p className="text-muted-foreground">{t("report.lead")}</p>
          <CheckList className="mt-3" items={reportItems.map((key) => t(`report.items.${key}`))} />
          <h3 className="mt-6 text-base font-semibold text-foreground">{t("report.notTitle")}</h3>
          <CheckList
            className="mt-3"
            icon={Info}
            iconClassName="text-muted-foreground"
            items={notItems.map((key) => t.rich(`report.not.${key}`, rich))}
          />
        </Section>

        <Section id="next" icon={ListChecks} title={t("next.title")}>
          <CheckList icon={CircleCheck} items={nextItems.map((key) => t(`next.items.${key}`))} />
        </Section>

        <Section id="safe-harbour" icon={Scale} title={t("safeHarbour.title")}>
          <p>{t("safeHarbour.body")}</p>
          <LawyerReviewNotice className="mt-4" title={t("safeHarbour.note")} />
        </Section>

        <Section id="dont" icon={Ban} title={t("dont.title")}>
          <CheckList icon={Ban} iconClassName="text-destructive" items={dontItems.map((key) => t(`dont.items.${key}`))} />
        </Section>

        <p className="mt-4 border-t border-border pt-6 text-small text-muted-foreground">{t.rich("machine", rich)}</p>
      </ContentContainer>
    </div>
  );
}
