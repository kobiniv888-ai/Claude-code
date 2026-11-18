import { Clock, Hash, ShieldAlert, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/common/container";
import { Ltr } from "@/components/common/ltr";
import { PageHeader } from "@/components/common/page-header";
import { ScamReportForm } from "@/components/help/scam-report-form";
import { SupportReplyPromise } from "@/components/help/support-reply-promise";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { SCAM_KINDS, SCAM_REPORT_PATH, type ScamKind } from "@/lib/reports/scam";
import { findListingForScamReport } from "@/lib/reports/scam-server";
import { pageMetadata } from "@/lib/seo";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "help.scamReport" });
  return pageMetadata({ locale, path: SCAM_REPORT_PATH, title: t("metaTitle"), description: t("lead"), noIndex: true });
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim().slice(0, 60) ?? "";
}

/**
 * "דיווח על הונאה" (SECURITY_REPORT 14.2.c, 14.4.c): the page behind the one-tap scam button of the
 * listing page, the trip page and the booking emails. Open to everyone: visitors leave a name and
 * an email; signed-in guests are answered in their account. Not indexed.
 */
export default async function ReportScamPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const t = await getTranslations("help.scamReport");

  const listingNumber = Number.parseInt(first(query.listing), 10);
  const booking = /^[A-Za-z0-9-]{4,40}$/.test(first(query.booking)) ? first(query.booking) : null;
  const kindParam = first(query.kind);
  const kind: ScamKind = (SCAM_KINDS as readonly string[]).includes(kindParam) ? (kindParam as ScamKind) : "asked_to_pay";

  const [current, listing] = await Promise.all([
    getCurrentUser(),
    findListingForScamReport(listingNumber),
  ]);
  const signedIn = !!current && current.twoFactorVerified;

  const tips = ["neverPay", "noLinks", "noCodes", "keepProof"] as const;

  return (
    <Container size="default" className="max-w-6xl pb-16">
      <PageHeader
        breadcrumbs={[{ label: t("crumbHelp"), href: "/help" }, { label: t("crumb") }]}
        title={t("title")}
        description={t("lead")}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 grid-cols-1 content-start gap-4">
          <p className="flex items-start gap-3 rounded-card border border-primary/40 bg-primary-tint p-4 text-small text-pretty text-foreground">
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary-text" />
            <span>{t("urgent")}</span>
          </p>
          {listing ? (
            <p className="flex min-w-0 items-center gap-2 rounded-card border bg-card p-3 text-small">
              <Hash aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate">
                {t.rich("about", {
                  id: String(listing.publicId),
                  ltr: (chunks) => <Ltr className="font-semibold">{chunks}</Ltr>,
                })}{" "}
                <span dir="auto" className="font-medium">
                  {listing.title}
                </span>
              </span>
            </p>
          ) : null}
          <div className="rounded-3xl border bg-card p-4 shadow-card sm:p-8">
            <ScamReportForm signedIn={signedIn} listing={listing?.publicId ?? null} booking={signedIn ? booking : null} initialKind={kind} />
          </div>
        </div>

        <aside className="flex flex-col gap-4" aria-label={t("asideLabel")}>
          <section className="rounded-2xl border bg-card p-5 shadow-card">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <ShieldCheck aria-hidden="true" className="size-4 text-success" />
              {t("tipsTitle")}
            </h2>
            <ul className="mt-3 flex flex-col gap-3">
              {tips.map((key) => (
                <li key={key} className="text-sm leading-relaxed text-pretty text-muted-foreground">
                  {t(`tips.${key}`)}
                </li>
              ))}
            </ul>
            <Link
              href="/safety"
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary-text underline underline-offset-4 hover:no-underline"
            >
              {t("safetyLink")}
            </Link>
          </section>
          <section className="rounded-2xl border bg-card p-5 shadow-card">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Clock aria-hidden="true" className="size-4 text-primary" />
              {t("replyTitle")}
            </h2>
            <SupportReplyPromise className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground" />
          </section>
        </aside>
      </div>
    </Container>
  );
}
